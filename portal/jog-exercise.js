export const JOG_EXERCISE_CONFIG = Object.freeze({
  bpm: 128,
  initialOffsetMs: 180,
  stepMs: 18,
  toleranceMs: 20,
  holdMs: 1200,
  timeLimitSec: 30,
});

export function getJogFeedback({ offsetMs, running, done }) {
  if (done) return { title: 'Colou. O downbeat está no lugar.', tone: 'success' };
  if (!running) return { title: 'Gire o jog para colar o downbeat do Deck B.', tone: 'neutral' };
  if (Math.abs(offsetMs) <= JOG_EXERCISE_CONFIG.toleranceMs) return { title: 'Quase colado — segure o encaixe.', tone: 'success' };
  return { title: offsetMs > 0 ? `B está ${Math.abs(offsetMs)} ms atrasado.` : `B está ${Math.abs(offsetMs)} ms adiantado.`, tone: Math.abs(offsetMs) < 70 ? 'near' : 'error' };
}

export function createJogTracker({ toleranceMs, holdMs }) {
  let matchingSince = null;
  return {
    update(now, offsetMs) {
      if (Math.abs(offsetMs) > toleranceMs) { matchingSince = null; return false; }
      if (matchingSince === null) matchingSince = now;
      return now - matchingSince >= holdMs;
    },
    reset() { matchingSince = null; },
  };
}

export function getNextPhaseBeatTime({ referenceBeat, offsetMs, now, lookaheadSec, beatDurationSec }) {
  const earliestSafeTime = now + lookaheadSec;
  let nextBeat = referenceBeat + offsetMs / 1000;
  while (nextBeat < earliestSafeTime) nextBeat += beatDurationSec;
  return nextBeat;
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function mountJogExercise(root, { onComplete, onContinue, onAttempt, attemptOffset = 0 } = {}) {
  if (!root) return () => {};
  const config = JOG_EXERCISE_CONFIG;
  let offsetMs = config.initialOffsetMs;
  let running = false;
  let done = false;
  let audio = null;
  let timer = 0;
  let raf = 0;
  let startedAt = 0;
  let wheelRotation = 0;
  let expired = false;
  let completionSeconds = 0;
  let modalDismissed = false;
  let attemptNumber = attemptOffset;
  const tracker = createJogTracker({ toleranceMs: config.toleranceMs, holdMs: config.holdMs });
  root.innerHTML = `<section class="jog-exercise-card" aria-labelledby="jog-exercise-title">
    <div class="bpm-exercise-heading"><div><span class="mono">EXERCÍCIO · TIMING + JOG</span><h3 id="jog-exercise-title">Cole o downbeat com a mão.</h3></div><span class="bpm-exercise-target mono">TEMPO <strong data-jog-timer>00:30</strong></span></div>
    <p class="bpm-exercise-intro">Os BPMs já estão iguais. Agora use o jog para corrigir o lugar da batida — pequenos movimentos, como numa CDJ.</p>
    <div class="jog-exercise-preview"><div class="bpm-preview-top mono"><span>SIMULADOR DE CABINE · DOIS PLAYERS</span><span>02 / 10 · JOG</span></div><div class="jog-deck-row"><article class="jog-cdj jog-cdj-a"><div class="jog-cdj-head"><span class="mono">DECK A · MASTER</span><b class="mono">PLAY</b></div><div class="jog-cdj-body"><div class="jog-cdj-screen"><strong>${config.bpm}<small>BPM</small></strong><span class="mono">MASTER · CH 01</span></div><div class="jog-wheel jog-wheel-reference" data-jog-wheel-a aria-hidden="true"><span class="jog-wheel-mark">ONLY<br>DJs</span><i></i></div></div><i class="jog-phase-dot"></i></article><article class="jog-cdj jog-cdj-b"><div class="jog-cdj-head"><span class="mono">DECK B · CUE</span><b class="mono">ADJUST</b></div><div class="jog-cdj-body"><div class="jog-cdj-screen"><strong>${config.bpm}<small>BPM</small></strong><span class="mono">CUE · CH 02</span></div><button class="jog-wheel" type="button" data-jog-wheel aria-label="Jog wheel do Deck B" aria-pressed="false"><span class="jog-wheel-mark">ONLY<br>DJs</span><i></i></button></div><i class="jog-phase-dot"></i></article></div><div class="jog-phase-meter" aria-hidden="true"><div class="jog-phase-track"><i data-jog-meter></i><b></b></div></div><div class="jog-controls"><button type="button" data-jog-step="-1" aria-label="Girar o jog para trás">← GIRAR</button><span class="mono">TOQUE SUAVE · 18 MS</span><button type="button" data-jog-step="1" aria-label="Girar o jog para frente">GIRAR →</button></div></div>
    <details class="jog-feedback-details"><summary class="mono">MOSTRAR FEEDBACK</summary><div class="bpm-exercise-feedback" data-jog-feedback role="status" aria-live="polite"></div></details><button class="bpm-exercise-stop mono" type="button" data-jog-stop hidden>■ PARAR E CONFERIR</button><div class="bpm-exercise-modal" data-jog-modal role="dialog" aria-modal="true" aria-labelledby="jog-modal-title"><div class="bpm-exercise-modal-card"><span class="mono" data-jog-modal-kicker>EXERCÍCIO · TIMING + JOG</span><h4 id="jog-modal-title" data-jog-modal-title>Pronto para ouvir?</h4><p data-jog-modal-copy>Use o jog com pequenos movimentos e confie no ouvido.</p><span class="mono bpm-exercise-modal-time" data-jog-modal-time hidden></span><div class="bpm-exercise-modal-actions"><button class="mono" type="button" data-jog-modal-start>▶ DAR PLAY</button><button class="mono" type="button" data-jog-modal-retry hidden>↺ REFAZER</button><button class="mono" type="button" data-jog-modal-continue hidden>CONTINUAR →</button></div></div></div>
  </section>`;
  const wheel = root.querySelector('[data-jog-wheel]');
  const referenceWheel = root.querySelector('[data-jog-wheel-a]');
  const wheelIndicator = wheel.querySelector('i');
  const referenceIndicator = referenceWheel?.querySelector('i');
  const feedbackEl = root.querySelector('[data-jog-feedback]');
  const differenceEl = root.querySelector('[data-jog-difference]');
  const timerEl = root.querySelector('[data-jog-timer]');
  const meterEl = root.querySelector('[data-jog-meter]');
  const stopEl = root.querySelector('[data-jog-stop]');
  const modalEl = root.querySelector('[data-jog-modal]');
  const modalTitleEl = root.querySelector('[data-jog-modal-title]');
  const modalKickerEl = root.querySelector('[data-jog-modal-kicker]');
  const modalCopyEl = root.querySelector('[data-jog-modal-copy]');
  const modalTimeEl = root.querySelector('[data-jog-modal-time]');
  const modalStartEl = root.querySelector('[data-jog-modal-start]');
  const modalRetryEl = root.querySelector('[data-jog-modal-retry]');
  const modalContinueEl = root.querySelector('[data-jog-modal-continue]');
  const setOffset = value => { offsetMs = Math.round(clamp(value, -240, 240)); tracker.reset(); render(); };
  const render = () => {
    const feedback = getJogFeedback({ offsetMs, running, done });
    if (differenceEl) differenceEl.textContent = Math.abs(offsetMs) <= config.toleranceMs ? 'BEATS COLADOS' : `${Math.abs(offsetMs)} MS ${offsetMs > 0 ? 'ATRASADO' : 'ADIANTADO'}`;
    if (differenceEl) differenceEl.dataset.tone = feedback.tone;
    feedbackEl.textContent = feedback.title;
    feedbackEl.dataset.tone = feedback.tone;
    meterEl.style.width = `${Math.max(3, Math.min(100, 100 - (Math.abs(offsetMs) / 240) * 100))}%`;
    meterEl.dataset.tone = feedback.tone;
    const transportAngle = startedAt ? ((performance.now() - startedAt) * config.bpm / 60000 * 360) : 0;
    if (wheelIndicator) wheelIndicator.style.transform = `translate(-50%, -100%) rotate(${transportAngle + wheelRotation}deg)`;
    if (referenceIndicator) referenceIndicator.style.transform = `translate(-50%, -100%) rotate(${transportAngle}deg)`;
    wheel.setAttribute('aria-pressed', String(Math.abs(offsetMs) <= config.toleranceMs));
    stopEl.hidden = !running;
    modalEl.hidden = running || modalDismissed;
    if (!modalEl.hidden) {
      const success = done;
      modalStartEl.hidden = success || expired;
      modalRetryEl.hidden = !(success || expired);
      modalContinueEl.hidden = !success;
      modalTimeEl.hidden = !success;
      modalKickerEl.textContent = success ? 'EXERCÍCIO CONCLUÍDO' : expired ? 'FIM DE TENTATIVA' : 'EXERCÍCIO · TIMING + JOG';
      modalTitleEl.textContent = success ? 'Parabéns. Você conseguiu.' : expired ? 'Estávamos quase lá.' : 'Pronto para ouvir?';
      modalCopyEl.textContent = success ? 'O downbeat está no lugar. Esse foi o seu tempo:' : expired ? 'O ajuste ainda não estava no lugar. Tente mais uma vez — você vai conseguir.' : 'Use o jog com pequenos movimentos e confie no ouvido.';
      if (success) modalTimeEl.textContent = `TEMPO · 00:${String(completionSeconds).padStart(2, '0')}`;
    }
    if (!running && !startedAt) timerEl.textContent = `00:${String(config.timeLimitSec).padStart(2, '0')}`;
  };
  const stopAudio = () => { clearInterval(timer); cancelAnimationFrame(raf); timer = 0; raf = 0; if (audio) { audio.gain.gain.setTargetAtTime(0, audio.context.currentTime, 0.02); audio.gain.disconnect(); audio = null; } };
  const startAudio = () => {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    const context = new Ctor(); const gain = context.createGain(); gain.gain.value = 0.58; gain.connect(context.destination); audio = { context, gain, firstA: context.currentTime + 0.08, firstB: context.currentTime + 0.08 + offsetMs / 1000, nextA: context.currentTime + 0.08, nextB: context.currentTime + 0.08 + offsetMs / 1000 };
    context.resume();
    const click = (time, frequency) => { const oscillator = context.createOscillator(); const clickGain = context.createGain(); oscillator.frequency.value = frequency; clickGain.gain.setValueAtTime(0.0001, time); clickGain.gain.exponentialRampToValueAtTime(0.18, time + 0.001); clickGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05); oscillator.connect(clickGain); clickGain.connect(gain); oscillator.start(time); oscillator.stop(time + 0.06); };
    const tick = () => { while (audio.nextA < context.currentTime + 0.12) { click(audio.nextA, 1100); audio.nextA += 60 / config.bpm; } while (audio.nextB < context.currentTime + 0.12) { click(audio.nextB, 650); audio.nextB += 60 / config.bpm; } };
    tick(); timer = window.setInterval(tick, 25);
    raf = requestAnimationFrame(function animate() { if (!audio) return; const remaining = Math.max(0, config.timeLimitSec - Math.floor((performance.now() - startedAt) / 1000)); timerEl.textContent = `00:${String(remaining).padStart(2, '0')}`; if (!remaining) { finishAttempt('timeout'); return; } render(); raf = requestAnimationFrame(animate); });
  };
  const applyOffset = value => {
    setOffset(value);
    if (audio) {
      audio.nextB = getNextPhaseBeatTime({
        referenceBeat: audio.nextA,
        offsetMs,
        now: audio.context.currentTime,
        lookaheadSec: 0.12,
        beatDurationSec: 60 / config.bpm,
      });
    }
  };
  const nudge = direction => { applyOffset(offsetMs + direction * config.stepMs); wheelRotation += direction * 10; render(); };
  root.querySelectorAll('[data-jog-step]').forEach(button => button.addEventListener('click', () => nudge(Number(button.dataset.jogStep))));
  wheel.addEventListener('keydown', event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); nudge(event.key === 'ArrowRight' ? 1 : -1); } });
  let pointerId = null;
  let pointerX = 0;
  wheel.addEventListener('pointerdown', event => { event.preventDefault(); pointerId = event.pointerId; pointerX = event.clientX; wheel.setPointerCapture?.(pointerId); });
  wheel.addEventListener('pointermove', event => { if (event.pointerId !== pointerId) return; event.preventDefault(); const delta = event.clientX - pointerX; if (Math.abs(delta) < 0.25) return; applyOffset(offsetMs - delta * 1.2); wheelRotation += delta * 0.8; render(); pointerX = event.clientX; });
  const releasePointer = event => { if (event.pointerId === pointerId) { pointerId = null; pointerX = 0; } };
  wheel.addEventListener('pointerup', releasePointer);
  wheel.addEventListener('pointercancel', releasePointer);
  wheel.addEventListener('lostpointercapture', releasePointer);
  const finishAttempt = result => { completionSeconds = Math.max(1, Math.floor((performance.now() - startedAt) / 1000)); done = result === 'success'; expired = !done; running = false; onAttempt?.({ exercise: 'beatmatch-jog', attempt: attemptNumber, offsetMs, elapsedSeconds: completionSeconds, result, recordedAt: new Date().toISOString() }); stopAudio(); modalDismissed = false; render(); if (done) onComplete?.(); };
  const resetAttempt = () => { done = false; expired = false; running = false; modalDismissed = false; startedAt = 0; offsetMs = config.initialOffsetMs; wheelRotation = 0; tracker.reset(); render(); };
  const beginAttempt = () => { done = false; expired = false; modalDismissed = false; running = true; attemptNumber += 1; startedAt = performance.now(); startAudio(); render(); };
  stopEl.addEventListener('click', () => { if (running) finishAttempt(Math.abs(offsetMs) <= config.toleranceMs ? 'success' : 'stopped_early'); });
  modalStartEl.addEventListener('click', beginAttempt);
  modalRetryEl.addEventListener('click', resetAttempt);
  modalContinueEl.addEventListener('click', () => { modalDismissed = true; render(); onContinue?.(); });
  render();
  return () => { stopAudio(); root.innerHTML = ''; };
}
