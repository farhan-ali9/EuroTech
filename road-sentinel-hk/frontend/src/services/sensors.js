// Real browser sensor APIs — no mock data, no simulated values

// ─── GPS ────────────────────────────────────────────────────────────────────

export function startGPS(onUpdate, onError) {
  if (!navigator.geolocation) {
    onError("Geolocation not supported");
    return null;
  }

  const id = navigator.geolocation.watchPosition(
    (pos) => onUpdate({
      lat:       pos.coords.latitude,
      lng:       pos.coords.longitude,
      speed_kmh: pos.coords.speed != null ? pos.coords.speed * 3.6 : 0,
      accuracy:  pos.coords.accuracy,
      timestamp: pos.timestamp,
    }),
    (err) => onError(err.message),
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
  );

  return () => navigator.geolocation.clearWatch(id);
}

// ─── ACCELEROMETER ──────────────────────────────────────────────────────────

export function startAccelerometer(onReading, onError) {
  // iOS 13+ requires permission
  if (typeof DeviceMotionEvent !== "undefined" &&
      typeof DeviceMotionEvent.requestPermission === "function") {
    DeviceMotionEvent.requestPermission()
      .then((state) => {
        if (state === "granted") _listenMotion(onReading);
        else onError("Motion permission denied");
      })
      .catch(onError);
  } else if (typeof DeviceMotionEvent !== "undefined") {
    _listenMotion(onReading);
  } else {
    onError("DeviceMotion not supported");
  }

  return () => window.removeEventListener("devicemotion", _motionHandler);
}

let _motionHandler = null;

function _listenMotion(onReading) {
  _motionHandler = (e) => {
    const a = e.accelerationIncludingGravity;
    if (!a) return;
    onReading({
      x: a.x || 0,
      y: a.y || 0,
      z: a.z || 0,
      interval: e.interval,
    });
  };
  window.addEventListener("devicemotion", _motionHandler, { passive: true });
}

// ─── CAMERA / VIDEO ANALYSIS ────────────────────────────────────────────────

export async function startCamera(onFrame, onError) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",  // rear camera — faces road
        width:  { ideal: 320 },
        height: { ideal: 240 },
      },
      audio: false,
    });

    const video  = document.createElement("video");
    const canvas = document.createElement("canvas");
    canvas.width  = 320;
    canvas.height = 240;
    video.srcObject = stream;
    video.setAttribute("playsinline", true);
    await video.play();

    let running = true;

    const interval = setInterval(() => {
      if (!running) return;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, 320, 240);
      const frame = canvas.toDataURL("image/jpeg", 0.7);
      onFrame(frame);
    }, 1500);  // capture frame every 1.5 seconds

    return () => {
      running = false;
      clearInterval(interval);
      stream.getTracks().forEach((t) => t.stop());
    };

  } catch (err) {
    onError(`Camera: ${err.message}`);
    return null;
  }
}

// ─── MICROPHONE / AUDIO ANALYSIS ────────────────────────────────────────────

export async function startAudio(onFeatures, onError) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const ctx     = new (window.AudioContext || window.webkitAudioContext)();
    const source  = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);

    const bufferLen  = analyser.frequencyBinCount;
    const timeData   = new Float32Array(bufferLen);
    const freqData   = new Uint8Array(bufferLen);

    let running = true;

    function tick() {
      if (!running) return;

      analyser.getFloatTimeDomainData(timeData);
      analyser.getByteFrequencyData(freqData);

      // RMS from time-domain
      const rms = Math.sqrt(timeData.reduce((s, v) => s + v * v, 0) / timeData.length);

      // Zero crossing rate
      let crossings = 0;
      for (let i = 1; i < timeData.length; i++) {
        if (timeData[i] * timeData[i - 1] < 0) crossings++;
      }
      const zcr = crossings / timeData.length;

      // Peak dB
      const peak    = Math.max(...timeData.map(Math.abs));
      const peak_db = 20 * Math.log10(peak + 1e-10);

      // Frequency band energies using FFT data
      const lowEnd  = Math.floor(bufferLen * 0.05);   // ~0–500 Hz
      const midEnd  = Math.floor(bufferLen * 0.25);   // ~500–2500 Hz
      const highEnd = bufferLen;

      const lowSum  = freqData.slice(0, lowEnd).reduce((a, b) => a + b, 0) / lowEnd;
      const midSum  = freqData.slice(lowEnd, midEnd).reduce((a, b) => a + b, 0) / (midEnd - lowEnd);
      const highSum = freqData.slice(midEnd, highEnd).reduce((a, b) => a + b, 0) / (highEnd - midEnd);
      const totalSum = lowSum + midSum + highSum || 1;

      const spectral_centroid = (lowSum * 250 + midSum * 1500 + highSum * 6000) / totalSum;

      onFeatures({
        rms:               parseFloat(rms.toFixed(4)),
        zcr:               parseFloat(zcr.toFixed(4)),
        spectral_centroid: parseFloat(spectral_centroid.toFixed(1)),
        peak_db:           parseFloat(peak_db.toFixed(1)),
        low_freq_energy:   parseFloat((lowSum / 255).toFixed(3)),
        high_freq_energy:  parseFloat((highSum / 255).toFixed(3)),
      });

      requestAnimationFrame(tick);
    }

    tick();

    return () => {
      running = false;
      stream.getTracks().forEach((t) => t.stop());
      ctx.close();
    };

  } catch (err) {
    onError(err.message);
    return null;
  }
}
