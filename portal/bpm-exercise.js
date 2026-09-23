import { createDjDeck } from './dj-deck.js';
import { createBeatEngine } from './beat-engine.js';

export const BPM_EXERCISE_CONFIG = Object.freeze({
  target: 128,
  initial: 123.4,
  attemptBpms: Object.freeze([123.4, 121.8, 125.2, 126.6, 122.7, 124.5, 127.1]),
  min: 118,
  max: 138,
  tolerance: 0.6,
  holdMs: 1500,
  timeLimitSec: 30,
});

export function isBpmExact({ bpm, target = BPM_EXERCISE_CONFIG.target }) {
  return Number(Number(bpm).toFixed(1)) === Number(Number(target).toFixed(1));
}

const ENCOURAGEMENTS = [
  'Estávamos quase lá. Tente mais uma vez — você vai conseguir.',
  'Boa escuta. O encaixe está vindo; faça um ajuste pequeno e tente de novo.',
  'Você já encontrou o caminho. Respire, ouça e faça mais uma tentativa.',
];

export function getBpmFeedback({ bpm, running, done, expired = false, target = BPM_EXERCISE_CONFIG.target, encouragement = ENCOURAGEMENTS[0] }) {
  if (done) return { title: '', tone: 'success' };
  if (expired) return { title: encouragement, tone: 'neutral' };
  if (!running) return { title: 'Inicie e ouça: os dois cliques estão fora de sincronia.', tone: 'neutral' };
  const diff = bpm - target;
  const absolute = Math.abs(diff);
  if (absolute <= BPM_EXERCISE_CONFIG.tolerance) return { title: 'Quase travado — segure firme.', tone: 'success' };
  return {
    title: diff > 0 ? `B está ${absolute.toFixed(1)} BPM rápido demais.` : `B está ${absolute.toFixed(1)} BPM lento demais.`,
    tone: absolute <= 2 ? 'near' : 'error',
  };
}

export function synchronizeBeatPhase({ bpm, target, tolerance, nextReference, nextAdjustable }) {
  return Math.abs(bpm - target) <= tolerance ? nextReference : nextAdjustable;
}

export function getBeatIndex({ now, start, bpm, firstBeat = 0 }) {
  return ((firstBeat + Math.floor(Math.max(0, now - start) / (60 / bpm))) % 4 + 4) % 4;
}

export function createMatchTracker({ tolerance, holdMs }) {
  let matchingSince = null;
  return {
    update(now, difference) {
      if (Math.abs(difference) > tolerance) {
        matchingSince = null;
        return false;
      }
      if (matchingSince === null) matchingSince = now;
      return now - matchingSince >= holdMs;
    },
    reset() { matchingSince = null; },
  };
}

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

export function mountBpmExercise(root, { onComplete, onContinue, onAttempt, attemptOffset = 0 } = {}) {
  if (!root) return () => {};
  const config = BPM_EXERCISE_CONFIG;
  let bpm = config.initial;
  // The first screen uses config.initial; the next click intentionally advances
  // to a different starting BPM so the learner cannot memorize one path.
  let attemptIndex = 1;
  let running = false;
  let done = false;
  let expired = false;
  let audio = null;
  let timer = 0;
  let raf = 0;
  let startedAt = 0;
  let completionSeconds = 0;
  let modalDismissed = false;
  let attemptNumber = attemptOffset;
  let phaseInSync = false;
  let encouragement = ENCOURAGEMENTS[0];
  const tracker = createMatchTracker({ tolerance: config.tolerance, holdMs: config.holdMs });
  const audioContext = () => {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    return Ctor ? new Ctor() : null;
  };
  root.innerHTML = `
    <section class="bpm-exercise-card" aria-labelledby="bpm-exercise-title">
      <div class="bpm-exercise-heading">
        <div><span class="mono">EXERCÍCIO · OUVIDO + VELOCIDADE</span><h3 id="bpm-exercise-title">Faça os dois pulsos se encontrarem.</h3></div>
        <span class="bpm-exercise-target mono">REFERÊNCIA <strong data-bpm-target>OUÇA</strong></span>
      </div>
      <p class="bpm-exercise-intro">O Deck A é a referência. Ajuste o Deck B até o “wub wub” desaparecer — e segure o encaixe por um instante.</p>
      <div class="bpm-exercise-preview"><div class="bpm-preview-top mono"><span>SIMULADOR DE CABINE</span><span>02 / 10 · BPM · <b data-bpm-timer>00:00</b></span></div><div class="bpm-deck-grid">
        <div class="bpm-deck bpm-deck-a"><span class="mono">DECK A · REFERÊNCIA</span><strong data-bpm-target-deck>OUÇA <small>MASTER</small></strong><div class="bpm-beatgrid" data-beatgrid="a">${[0,1,2,3].map(i => `<i data-beat="${i}"></i>`).join('')}</div><div class="bpm-deck-footer mono"><span>MASTER</span><span>LOCKED</span></div></div>
        <div class="bpm-deck bpm-deck-b"><span class="mono">DECK B · AJUSTE</span><strong data-bpm-value>${bpm.toFixed(1)} <small>BPM</small></strong><div class="bpm-beatgrid" data-beatgrid="b">${[0,1,2,3].map(i => `<i data-beat="${i}"></i>`).join('')}</div><div class="bpm-deck-footer mono"><span>CHANNEL 02</span><span data-bpm-state>LISTEN</span></div></div>
      </div><div class="bpm-sync-meter"><div class="bpm-sync-label mono"><span>SINCRONIA</span><span data-bpm-difference>${Math.abs(bpm - config.target).toFixed(1)} BPM DE DIFERENÇA</span></div><div class="bpm-sync-track"><i data-bpm-meter></i></div></div>
      <div class="bpm-slider-wrap"><div class="bpm-slider" data-bpm-slider role="slider" tabindex="0" aria-label="BPM do Deck B" aria-valuemin="${config.min}" aria-valuemax="${config.max}" aria-valuenow="${bpm}" aria-valuetext="${bpm.toFixed(1)} BPM"><i data-bpm-knob></i></div><div class="bpm-slider-labels mono"><span>${config.min}</span><span>BPM DO DECK B · OUÇA</span><span>${config.max}</span></div><div class="bpm-nudge-controls" aria-label="Ajuste fino do BPM"><button type="button" data-bpm-nudge="-0.1" aria-label="Diminuir BPM do Deck B">←</button><span class="mono">AJUSTE FINO · 0,1 BPM</span><button type="button" data-bpm-nudge="0.1" aria-label="Aumentar BPM do Deck B">→</button></div></div></div>
      <button class="bpm-exercise-stop mono" type="button" data-bpm-stop hidden>■ PARAR E CONFERIR</button>
      <div class="bpm-exercise-feedback" data-bpm-feedback role="status" aria-live="polite"></div>
      <div class="bpm-exercise-modal" data-bpm-modal role="dialog" aria-modal="true" aria-labelledby="bpm-modal-title">
        <div class="bpm-exercise-modal-card">
          <span class="mono" data-bpm-modal-kicker>EXERCÍCIO · OUVIDO + VELOCIDADE</span>
          <h4 id="bpm-modal-title" data-bpm-modal-title>Pronto para ouvir?</h4>
          <p data-bpm-modal-copy>O alvo fica oculto. Encontre o encaixe pelo ouvido e segure a batida.</p>
          <span class="mono bpm-exercise-modal-time" data-bpm-modal-time hidden></span>
          <div class="bpm-exercise-modal-actions">
            <button class="mono" type="button" data-bpm-modal-start>▶ DAR PLAY</button>
            <button class="mono" type="button" data-bpm-modal-retry hidden>↺ REFAZER</button>
            <button class="mono" type="button" data-bpm-modal-continue hidden>CONTINUAR →</button>
          </div>
        </div>
      </div>
    </section>`;

  const valueEl = root.querySelector('[data-bpm-value]');
  const meterEl = root.querySelector('[data-bpm-meter]');
  const diffEl = root.querySelector('[data-bpm-difference]');
  const feedbackEl = root.querySelector('[data-bpm-feedback]');
  const modalEl = root.querySelector('[data-bpm-modal]');
  const modalKickerEl = root.querySelector('[data-bpm-modal-kicker]');
  const modalTitleEl = root.querySelector('[data-bpm-modal-title]');
  const modalCopyEl = root.querySelector('[data-bpm-modal-copy]');
  const modalTimeEl = root.querySelector('[data-bpm-modal-time]');
  const modalStartEl = root.querySelector('[data-bpm-modal-start]');
  const modalRetryEl = root.querySelector('[data-bpm-modal-retry]');
  const modalContinueEl = root.querySelector('[data-bpm-modal-continue]');
  const stopEl = root.querySelector('[data-bpm-stop]');
  const sliderEl = root.querySelector('[data-bpm-slider]');
  const knobEl = root.querySelector('[data-bpm-knob]');
  const markerEl = root.querySelector('[data-bpm-marker]');
  const targetEl = root.querySelector('[data-bpm-target]');
  const targetDeckEl = root.querySelector('[data-bpm-target-deck]');
  const timerEl = root.querySelector('[data-bpm-timer]');
  const nudgeEls = [...root.querySelectorAll('[data-bpm-nudge]')];
  const beatA = [...root.querySelectorAll('[data-beatgrid="a"] i')];
  const beatB = [...root.querySelectorAll('[data-beatgrid="b"] i')];
  const nextAttemptBpm = () => {
    const values = config.attemptBpms?.length ? config.attemptBpms : [config.initial];
    const value = values[attemptIndex % values.length];
    attemptIndex += 1;
    return value;
  };
  const getRemainingSeconds = () => {
    if (!startedAt) return config.timeLimitSec;
    return Math.max(0, config.timeLimitSec - Math.floor((performance.now() - startedAt) / 1000));
  };
  const formatSeconds = seconds => `00:${String(Math.max(0, seconds)).padStart(2, '0')}`;
  const renderModal = () => {
    const show = !running && !modalDismissed;
    modalEl.hidden = !show;
    if (!show) return;
    const success = done;
    const timeout = expired && !done;
    modalRetryEl.hidden = !(success || timeout);
    modalContinueEl.hidden = !success;
    modalStartEl.hidden = success || timeout;
    if (success) {
      modalKickerEl.textContent = 'EXERCÍCIO CONCLUÍDO';
      modalTitleEl.textContent = 'Parabéns. Você conseguiu.';
      modalCopyEl.textContent = 'Os dois pulsos se encontraram. Esse foi o seu tempo:';
      modalTimeEl.hidden = false;
      modalTimeEl.textContent = `TEMPO · ${formatSeconds(completionSeconds)}`;
    } else if (timeout) {
      modalKickerEl.textContent = 'FIM DE TENTATIVA';
      modalTitleEl.textContent = 'Estávamos quase lá.';
      modalCopyEl.textContent = encouragement;
      modalTimeEl.hidden = true;
    } else {
      modalKickerEl.textContent = 'EXERCÍCIO · OUVIDO + VELOCIDADE';
      modalTitleEl.textContent = 'Pronto para ouvir?';
      modalCopyEl.textContent = 'O alvo fica oculto. Encontre o encaixe pelo ouvido e segure a batida.';
      modalTimeEl.hidden = true;
    }
  };
  const render = () => {
    const difference = bpm - config.target;
    const absolute = Math.abs(difference);
    const feedback = getBpmFeedback({ bpm, running, done, expired, encouragement });
    const fraction = (bpm - config.min) / (config.max - config.min);
    valueEl.innerHTML = `${bpm.toFixed(1)} <small>BPM</small>`;
    sliderEl.setAttribute('aria-valuenow', bpm.toFixed(1));
    sliderEl.setAttribute('aria-valuetext', `${bpm.toFixed(1)} BPM`);
    knobEl.style.left = `${fraction * 100}%`;
    if (done) {
      targetEl.textContent = `${config.target} BPM`;
      targetDeckEl.innerHTML = `${config.target.toFixed(1)} <small>BPM</small>`;
    } else {
      targetEl.textContent = 'OUÇA';
      targetDeckEl.innerHTML = 'OUÇA <small>MASTER</small>';
    }
    // During the attempt, the ear is the instrument: numerical proximity stays hidden.
    meterEl.style.width = done ? '100%' : '0%';
    meterEl.dataset.tone = done ? 'success' : 'neutral';
    diffEl.textContent = done ? 'PULSOS ENCAIXADOS' : 'OUÇA O ENCAIXE';
    feedbackEl.textContent = expired ? feedback.title : '';
    feedbackEl.dataset.tone = feedback.tone;
    const remaining = getRemainingSeconds();
    timerEl.textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
    timerEl.dataset.urgent = remaining <= 5 && running ? '1' : '0';
    root.querySelector('[data-bpm-state]').textContent = done ? 'SYNCED' : running ? 'PLAYING' : 'LISTEN';
    stopEl.hidden = !running;
    renderModal();
  };
  const logAttempt = result => onAttempt?.({
    exercise: 'beatmatch-bpm',
    attempt: attemptNumber,
    bpm: Number(bpm.toFixed(1)),
    elapsedSeconds: completionSeconds,
    result,
    recordedAt: new Date().toISOString(),
  });
  const finishAttempt = result => {
    completionSeconds = Math.max(1, Math.floor((performance.now() - startedAt) / 1000));
    done = result === 'success';
    expired = result !== 'success';
    running = false;
    if (result !== 'success') encouragement = ENCOURAGEMENTS[(attemptNumber - 1) % ENCOURAGEMENTS.length];
    logAttempt(result);
    stopAudio();
    modalDismissed = false;
    render();
    if (done) onComplete?.();
  };
  const stopAudio = () => {
    clearInterval(timer); cancelAnimationFrame(raf); timer = 0; raf = 0;
    if (audio) {
      audio.engineA?.stop();
      audio.engineB?.stop();
      audio.deckA?.destroy();
      audio.deckB?.destroy();
      audio.master?.disconnect?.();
      audio = null;
    }
  };
  const startAudio = () => {
    const context = audioContext();
    if (!context) { feedbackEl.textContent = 'Seu navegador não oferece áudio para este exercício.'; return; }
    const master = context.createGain(); master.gain.value = 0.65; master.connect(context.destination);
    const firstBeat = context.currentTime + 0.08;
    const deckA = createDjDeck(context, { side: 'A', master });
    const deckB = createDjDeck(context, { side: 'B', master });
    // The exercise uses synthetic clicks, but the decks still own the musical state.
    deckA.loadBuffer({ duration: Infinity }, 'REFERENCE', '', config.target);
    deckB.loadBuffer({ duration: Infinity }, 'ADJUST', '', bpm);
    deckB.setPitch((bpm / config.target) - 1);
    let phaseAligned = false;
    const updateGrid = (cells, index) => cells.forEach((cell, cellIndex) => { cell.dataset.on = cellIndex === index % 4 ? '1' : '0'; });
    const engineA = createBeatEngine({
      context,
      bpm: () => config.target,
      sound: 'reference',
      onTick: ({ beat: currentBeat }) => updateGrid(beatA, currentBeat),
    });
    const engineB = createBeatEngine({
      context,
      bpm: () => bpm,
      sound: 'adjustable',
      onTick: ({ beat: currentBeat }) => updateGrid(beatB, phaseAligned ? engineA.getBeat() : currentBeat),
    });
    audio = { context, master, deckA, deckB, engineA, engineB, firstBeat };
    context.resume();
    engineA.start({ firstBeat });
    engineB.start({ firstBeat });
    raf = requestAnimationFrame(function animate() {
      if (!audio) return;
      if (getRemainingSeconds() <= 0) {
        finishAttempt('timeout');
        return;
      }
      const diff = bpm - config.target;
      const inTolerance = Math.abs(diff) <= config.tolerance;
      if (inTolerance && !phaseAligned) {
        const nextReferenceBeat = engineA.getState().nextBeatTime ?? (context.currentTime + 0.08);
        const nextReferenceIndex = engineA.getBeat() + 1;
        engineB.stop();
        engineB.start({ firstBeat: nextReferenceBeat, beat: nextReferenceIndex });
        phaseAligned = true;
      } else if (!inTolerance) {
        phaseAligned = false;
      }
      const phaseDelta = Math.abs(engineA.getPhase() - engineB.getPhase());
      phaseInSync = phaseAligned && Math.min(phaseDelta, 1 - phaseDelta) <= 0.08;
      // The learner is the judge. The exercise never declares success by itself;
      // only the explicit "PARAR E CONFERIR" action can validate the attempt.
      render();
      raf = requestAnimationFrame(animate);
    });
  };
  const setBpm = value => {
    bpm = +clamp(value, config.min, config.max).toFixed(1);
    if (audio?.deckB) audio.deckB.setPitch((bpm / config.target) - 1);
    tracker.reset();
    render();
  };
  nudgeEls.forEach(button => button.addEventListener('click', () => setBpm(bpm + Number(button.dataset.bpmNudge))));
  const updateFromPointer = event => { const rect = sliderEl.getBoundingClientRect(); setBpm(config.min + ((event.clientX - rect.left) / rect.width) * (config.max - config.min)); };
  sliderEl.addEventListener('pointerdown', event => { sliderEl.setPointerCapture?.(event.pointerId); updateFromPointer(event); });
  sliderEl.addEventListener('pointermove', event => { if (sliderEl.hasPointerCapture?.(event.pointerId)) updateFromPointer(event); });
  sliderEl.addEventListener('keydown', event => { const step = event.shiftKey ? 1 : 0.1; if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') { event.preventDefault(); setBpm(bpm - step); } if (event.key === 'ArrowRight' || event.key === 'ArrowUp') { event.preventDefault(); setBpm(bpm + step); } });
  const resetAttempt = () => {
    done = false;
    expired = false;
    running = false;
    modalDismissed = false;
    bpm = nextAttemptBpm();
    startedAt = 0;
    completionSeconds = 0;
    phaseInSync = false;
    encouragement = ENCOURAGEMENTS[(attemptIndex - 1) % ENCOURAGEMENTS.length];
    tracker.reset();
    render();
  };
  const beginAttempt = () => {
    done = false;
    expired = false;
    modalDismissed = false;
    running = true;
    attemptNumber += 1;
    phaseInSync = false;
    startedAt = performance.now();
    startAudio();
    render();
  };
  stopEl.addEventListener('click', () => {
    if (!running) return;
    finishAttempt(isBpmExact({ bpm, target: config.target }) && phaseInSync ? 'success' : 'stopped_early');
  });
  modalStartEl.addEventListener('click', beginAttempt);
  modalRetryEl.addEventListener('click', resetAttempt);
  modalContinueEl.addEventListener('click', () => {
    modalDismissed = true;
    render();
    onContinue?.();
  });
  render();
  return () => { stopAudio(); root.innerHTML = ''; };
}
