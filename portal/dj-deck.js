const DEFAULT_EQ = Object.freeze({ low: 0, mid: 0, high: 0 });

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function setParam(param, value, time = 0) {
  if (!param) return;
  if (typeof param.setTargetAtTime === 'function') param.setTargetAtTime(value, time, 0.01);
  else param.value = value;
}

function disconnect(node) {
  try { node?.disconnect?.(); } catch { /* AudioNodes may already be disconnected. */ }
}

export function createDjDeck(context, { side = 'A', master = context.destination, baseBpm = 128 } = {}) {
  if (!context) throw new TypeError('createDjDeck requires an AudioContext-like object');

  const volume = context.createGain();
  const crossfade = context.createGain();
  const low = context.createBiquadFilter();
  const mid = context.createBiquadFilter();
  const high = context.createBiquadFilter();
  low.type = 'lowshelf';
  low.frequency.value = 320;
  mid.type = 'peaking';
  mid.frequency.value = 1000;
  mid.Q.value = 0.7;
  high.type = 'highshelf';
  high.frequency.value = 3200;
  volume.gain.value = 1;
  crossfade.gain.value = 1;
  low.connect(mid);
  mid.connect(high);
  high.connect(volume);
  volume.connect(crossfade);
  crossfade.connect(master);

  let buffer = null;
  let source = null;
  let status = 'empty';
  let offset = 0;
  let startedAt = null;
  let pitch = 0;
  let bend = 0;
  let volumeValue = 1;
  let eq = { ...DEFAULT_EQ };
  let metadata = { title: '', artist: '', bpm: baseBpm };

  const duration = () => Number.isFinite(buffer?.duration) ? buffer.duration : Infinity;
  const playbackRate = () => Math.max(0.01, (1 + pitch) * (1 + bend));
  const position = () => {
    if (!buffer) return 0;
    const liveOffset = status === 'playing' && startedAt !== null
      ? offset + (context.currentTime - startedAt) * playbackRate()
      : offset;
    return clamp(liveOffset, 0, duration());
  };
  const stopSource = () => {
    if (!source) return;
    try { source.stop(context.currentTime); } catch { /* source may have ended */ }
    disconnect(source);
    source = null;
  };
  const createSource = () => {
    const next = context.createBufferSource();
    next.buffer = buffer;
    next.playbackRate.value = playbackRate();
    next.connect(low);
    next.onended = () => {
      if (source === next && status === 'playing' && position() >= duration()) {
        offset = duration();
        status = 'ended';
        source = null;
      }
    };
    return next;
  };
  const refreshRate = () => {
    if (source?.playbackRate) source.playbackRate.value = playbackRate();
  };

  const deck = {
    loadBuffer(nextBuffer, title = '', artist = '', bpm = baseBpm) {
      stopSource();
      buffer = nextBuffer;
      offset = 0;
      startedAt = null;
      metadata = { title, artist, bpm: Number(bpm) || baseBpm };
      status = buffer ? 'ready' : 'empty';
      return deck.getState();
    },
    async play() {
      if (!buffer) return false;
      if (status === 'playing') return true;
      await context.resume?.();
      if (offset >= duration()) offset = 0;
      source = createSource();
      startedAt = context.currentTime;
      source.start(context.currentTime, offset);
      status = 'playing';
      return true;
    },
    pause() {
      if (status === 'playing') offset = position();
      stopSource();
      startedAt = null;
      if (buffer) status = offset >= duration() ? 'ended' : 'paused';
      return deck.getState();
    },
    stop() {
      stopSource();
      offset = 0;
      startedAt = null;
      status = buffer ? 'ready' : 'empty';
      return deck.getState();
    },
    async toggle() {
      if (status === 'playing') return deck.pause();
      return deck.play();
    },
    seek(seconds) {
      const nextPosition = clamp(Number(seconds) || 0, 0, duration());
      const wasPlaying = status === 'playing';
      if (wasPlaying) deck.pause();
      offset = nextPosition;
      if (wasPlaying) awaitablePlay(deck);
      return position();
    },
    position,
    setPitch(value) {
      if (status === 'playing') offset = position();
      pitch = clamp(Number(value) || 0, -0.5, 0.5);
      startedAt = status === 'playing' ? context.currentTime : startedAt;
      refreshRate();
    },
    getPitch: () => pitch,
    effectiveBpm: () => metadata.bpm * (1 + pitch) * (1 + bend),
    setVolume(value) {
      volumeValue = clamp(Number(value) || 0, 0, 1);
      setParam(volume.gain, volumeValue, context.currentTime);
    },
    setEq(values = {}) {
      eq = { ...eq, ...values };
      setParam(low.gain, Number(eq.low) || 0, context.currentTime);
      setParam(mid.gain, Number(eq.mid) || 0, context.currentTime);
      setParam(high.gain, Number(eq.high) || 0, context.currentTime);
    },
    setBend(value) {
      if (status === 'playing') offset = position();
      bend = clamp(Number(value) || 0, -0.1, 0.1);
      startedAt = status === 'playing' ? context.currentTime : startedAt;
      refreshRate();
    },
    getState() {
      return {
        side,
        status,
        title: metadata.title,
        artist: metadata.artist,
        bpm: metadata.bpm,
        duration: Number.isFinite(duration()) ? duration() : 0,
        position: position(),
        pitch,
        bend,
        volume: volumeValue,
        eq: { ...eq },
        source,
      };
    },
    destroy() {
      stopSource();
      disconnect(low); disconnect(mid); disconnect(high); disconnect(volume); disconnect(crossfade);
      status = 'destroyed';
      buffer = null;
      offset = 0;
      startedAt = null;
    },
  };
  return deck;
}

// Seeking while playing is intentionally fire-and-forget so seek remains a synchronous UI API.
function awaitablePlay(deck) {
  Promise.resolve(deck.play()).catch(() => {});
}
