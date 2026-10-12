(() => {
  const button = document.getElementById('push-to-talk');
  const label = document.getElementById('push-to-talk-label');
  if (!button || !label) return;

  let stream = null;
  let levelContext = null;
  let analyser = null;
  let levelFrame = 0;
  let holdRequested = false;

  const dispatchVoiceState = (enabled, activeStream = null) => {
    window.dispatchEvent(new CustomEvent('nikkiflix:voice-state', {
      detail: { enabled, transmitting: enabled, receiving: enabled, stream: activeStream }
    }));
  };

  const stopMeter = () => {
    if (levelFrame) cancelAnimationFrame(levelFrame);
    levelFrame = 0;
    analyser = null;
    if (levelContext) levelContext.close().catch(() => {});
    levelContext = null;
    button.style.removeProperty('--mic-level');
    button.querySelector('.mic-live-dot').style.removeProperty('transform');
  };

  const stopTalking = () => {
    holdRequested = false;
    if (stream) stream.getTracks().forEach(track => track.stop());
    stream = null;
    stopMeter();
    button.classList.remove('talking');
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', 'Hold to talk');
    label.textContent = 'Hold to talk';
    dispatchVoiceState(false);
  };

  const startMeter = activeStream => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    levelContext = new AudioContextClass();
    const source = levelContext.createMediaStreamSource(activeStream);
    analyser = levelContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.frequencyBinCount);
    const readLevel = () => {
      if (!analyser || !holdRequested) return;
      analyser.getByteTimeDomainData(samples);
      let energy = 0;
      for (let i = 0; i < samples.length; i++) {
        const value = (samples[i] - 128) / 128;
        energy += value * value;
      }
      const level = Math.min(1, Math.sqrt(energy / samples.length) * 4.5);
      button.style.setProperty('--mic-level', level.toFixed(2));
      button.querySelector('.mic-live-dot').style.transform = `scale(${1 + level * .7})`;
      levelFrame = requestAnimationFrame(readLevel);
    };
    readLevel();
  };

  const startTalking = async event => {
    if (event) event.preventDefault();
    if (holdRequested || stream) return;
    holdRequested = true;
    button.classList.remove('mic-error');
    label.textContent = 'Connecting mic…';
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Microphone capture is unavailable');
      const captured = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (!holdRequested) {
        captured.getTracks().forEach(track => track.stop());
        return;
      }
      stream = captured;
      button.classList.add('talking');
      button.setAttribute('aria-pressed', 'true');
      button.setAttribute('aria-label', 'Talking live. Release to stop');
      label.textContent = 'Talking live';
      startMeter(stream);
      dispatchVoiceState(true, stream);
    } catch (error) {
      holdRequested = false;
      button.classList.remove('talking');
      button.classList.add('mic-error');
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', 'Microphone blocked. Hold to try again');
      label.textContent = 'Mic blocked · retry';
      dispatchVoiceState(false);
    }
  };

  button.addEventListener('pointerdown', event => {
    if (typeof button.setPointerCapture === 'function') button.setPointerCapture(event.pointerId);
    startTalking(event);
  });
  button.addEventListener('pointerup', stopTalking);
  button.addEventListener('pointercancel', stopTalking);
  button.addEventListener('lostpointercapture', () => { if (holdRequested) stopTalking(); });
  button.addEventListener('keydown', event => {
    if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) startTalking(event);
  });
  button.addEventListener('keyup', event => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      stopTalking();
    }
  });
  window.addEventListener('blur', stopTalking);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopTalking(); });

  window.NikkiflixVoice = {
    stop: stopTalking,
    isTalking: () => Boolean(stream && holdRequested)
  };
})();
