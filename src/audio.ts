/**
 * Sound effects synthesized with the Web Audio API, so there are no sound files to load or
 * license. Browsers (especially iOS) only allow audio after a user gesture, so call
 * `unlockAudio()` from a tap handler; until then every effect is silently skipped.
 */

const MUTE_KEY = 'node-wars:muted';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = loadMuted();

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  if (master) master.gain.value = muted ? 0 : 0.5;
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    // ignore
  }
}

/** Create or resume the audio context. Safe to call on every tap. */
export function unlockAudio(): void {
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

interface Tone {
  freq: number;
  /** Frequency to slide to by the end of the note. */
  to?: number;
  start?: number;
  duration: number;
  type?: OscillatorType;
  volume?: number;
}

function play(tones: Tone[]): void {
  if (!ctx || !master || muted || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  for (const t of tones) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const begin = now + (t.start ?? 0);
    const end = begin + t.duration;
    osc.type = t.type ?? 'square';
    osc.frequency.setValueAtTime(t.freq, begin);
    if (t.to) osc.frequency.exponentialRampToValueAtTime(t.to, end);
    // Quick attack, smooth fade so nothing clicks.
    gain.gain.setValueAtTime(0.0001, begin);
    gain.gain.exponentialRampToValueAtTime(t.volume ?? 0.25, begin + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain).connect(master);
    osc.start(begin);
    osc.stop(end + 0.02);
  }
}

/** A short burst of noise, for booms. */
function noise(duration: number, volume: number, start = 0): void {
  if (!ctx || !master || muted || ctx.state !== 'running') return;
  const length = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2;
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  gain.gain.value = volume;
  src.buffer = buffer;
  src.connect(filter).connect(gain).connect(master);
  src.start(ctx.currentTime + start);
}

const lastPlayed = new Map<string, number>();

/** Skip a sound if it played less than `gap` seconds ago, so swarms don't spam it. */
function throttled(name: string, gap: number): boolean {
  const now = performance.now() / 1000;
  if (now - (lastPlayed.get(name) ?? -Infinity) < gap) return true;
  lastPlayed.set(name, now);
  return false;
}

export const sfx = {
  click() {
    play([{ freq: 660, duration: 0.05, type: 'triangle', volume: 0.15 }]);
  },
  send() {
    if (throttled('send', 0.08)) return;
    play([{ freq: 300, to: 700, duration: 0.12, type: 'triangle', volume: 0.18 }]);
  },
  capture() {
    if (throttled('capture', 0.15)) return;
    noise(0.25, 0.5);
    play([
      { freq: 523, duration: 0.1, type: 'square', volume: 0.12 },
      { freq: 784, start: 0.08, duration: 0.18, type: 'square', volume: 0.12 },
    ]);
  },
  lost() {
    if (throttled('lost', 0.2)) return;
    noise(0.35, 0.6);
    play([{ freq: 330, to: 140, duration: 0.35, type: 'sawtooth', volume: 0.14 }]);
  },
  failed() {
    if (throttled('failed', 0.3)) return;
    play([{ freq: 220, to: 160, duration: 0.18, type: 'triangle', volume: 0.18 }]);
  },
  danger() {
    if (throttled('danger', 1.5)) return;
    play([
      { freq: 880, duration: 0.08, type: 'square', volume: 0.1 },
      { freq: 880, start: 0.14, duration: 0.08, type: 'square', volume: 0.1 },
    ]);
  },
  victory() {
    const notes = [523, 659, 784, 1047];
    play(
      notes.map(
        (freq, i) =>
          ({ freq, start: i * 0.12, duration: i === 3 ? 0.5 : 0.14, volume: 0.15 }) as Tone,
      ),
    );
  },
  defeat() {
    const notes = [392, 330, 262];
    play(
      notes.map(
        (freq, i) =>
          ({ freq, start: i * 0.2, duration: 0.3, type: 'triangle', volume: 0.2 }) as Tone,
      ),
    );
  },
};
