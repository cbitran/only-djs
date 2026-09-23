function defaultFrame(callback) {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback);
  return setTimeout(() => callback(Date.now()), 16);
}

function defaultCancelFrame(id) {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
  else clearTimeout(id);
}

function setParam(param, value, time) {
  if (!param) return;
  if (typeof param.setTargetAtTime === 'function') param.setTargetAtTime(value, time, 0.01);
  else param.value = value;
}

export function createBeatEngine({
  context,
  bpm = 128,
  sound = 'click',
  isTarget = () => false,
  onTick = () => {},
  onTarget = () => {},
  onStop = () => {},
  scheduler = {},
} = {}) {
  if (!context) throw new TypeError('createBeatEngine requires an AudioContext-like object');

  const setIntervalFn = scheduler.setInterval ?? globalThis.setInterval;
  const clearIntervalFn = scheduler.clearInterval ?? globalThis.clearInterval;
  const requestFrameFn = scheduler.requestAnimationFrame ?? defaultFrame;
  const cancelFrameFn = scheduler.cancelAnimationFrame ?? defaultCancelFrame;
  const getBpmValue = () => Math.max(1, Number(typeof bpm === 'function' ? bpm() : bpm) || 128);

  let running = false;
  let firstBeat = null;
  let nextBeatTime = null;
  let beat = 0;
  let beatOrigin = 0;
  let intervalId = null;
  let frameId = null;
  let targetTimes = [];
  let output = null;

  const beatDuration = () => 60 / getBpmValue();
  const createOutput = () => {
    if (output) {
      setParam(output.gain, 0.35, context.currentTime);
      return output;
    }
    if (typeof context.createGain !== 'function') return output;
    output = context.createGain();
    output.gain.value = 0.35;
    output.connect?.(context.destination);
    return output;
  };
  const scheduleSound = (time, index) => {
    if (typeof sound === 'function' && sound({ time, beat: index, bpm: getBpmValue() }) === false) return;
    if (typeof context.createOscillator !== 'function') return;
    const destination = createOutput();
    if (!destination) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const accent = index % 4 === 0;
    oscillator.frequency.value = accent ? 1200 : 880;
    gain.gain.value = 0.0001;
    gain.gain.setValueAtTime?.(0.0001, time);
    gain.gain.exponentialRampToValueAtTime?.(accent ? 0.55 : 0.35, time + 0.001);
    gain.gain.exponentialRampToValueAtTime?.(0.0001, time + 0.055);
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(time);
    oscillator.stop(time + 0.06);
  };
  const scheduleAhead = () => {
    if (!running) return;
    const horizon = context.currentTime + 0.12;
    while (nextBeatTime <= horizon) {
      const event = { time: nextBeatTime, beat, bpm: getBpmValue() };
      scheduleSound(event.time, event.beat);
      if (isTarget(event)) {
        targetTimes.push(event.time);
        onTarget(event);
      }
      beat += 1;
      nextBeatTime += beatDuration();
    }
  };
  const animate = () => {
    if (!running) return;
    onTick({ time: context.currentTime, phase: engine.getPhase(), beat: engine.getBeat(), bpm: getBpmValue() });
    frameId = requestFrameFn(animate);
  };

  const engine = {
    start({ firstBeat: requestedFirstBeat, beat: requestedBeat = 0 } = {}) {
      engine.stop();
      running = true;
      firstBeat = requestedFirstBeat ?? context.currentTime + 0.08;
      nextBeatTime = firstBeat;
      beatOrigin = requestedBeat;
      beat = requestedBeat;
      targetTimes = [];
      createOutput();
      scheduleAhead();
      intervalId = setIntervalFn(scheduleAhead, 25);
      frameId = requestFrameFn(animate);
      return engine.getState();
    },
    stop() {
      const wasRunning = running;
      running = false;
      if (intervalId !== null) clearIntervalFn(intervalId);
      if (frameId !== null) cancelFrameFn(frameId);
      intervalId = null;
      frameId = null;
      if (output?.gain) setParam(output.gain, 0, context.currentTime);
      if (wasRunning) onStop();
      return engine.getState();
    },
    reset() {
      engine.stop();
      firstBeat = null;
      nextBeatTime = null;
      beat = 0;
      beatOrigin = 0;
      targetTimes = [];
      return engine.getState();
    },
    getPhase() {
      if (firstBeat === null) return 0;
      const elapsed = Math.max(0, context.currentTime - firstBeat);
      return (elapsed / beatDuration()) % 1;
    },
    getBeat() {
      if (firstBeat === null) return 0;
      return beatOrigin + Math.floor(Math.max(0, context.currentTime - firstBeat) / beatDuration());
    },
    getBpm: getBpmValue,
    getTargetTimes: () => [...targetTimes],
    getState: () => ({ running, firstBeat, nextBeatTime, beat, bpm: getBpmValue() }),
    destroy() {
      engine.stop();
      output?.disconnect?.();
      output = null;
      firstBeat = null;
      targetTimes = [];
    },
  };
  return engine;
}
