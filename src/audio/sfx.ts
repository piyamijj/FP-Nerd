/** Dosyasız, WebAudio ile üretilen ses efektleri. */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function unlockAudio() {
  ac();
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
  if (master) master.gain.value = on ? 0.5 : 0;
}

export function isSoundEnabled() {
  return enabled;
}

function noiseBurst(duration: number, gain: number, lowpass: number, highpass = 0) {
  const c = ac();
  if (!c || !master || !enabled) return;
  const frames = Math.floor(c.sampleRate * duration);
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    const t = i / frames;
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.5);
  }
  const src = c.createBufferSource();
  src.buffer = buffer;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = lowpass;
  const g = c.createGain();
  g.gain.value = gain;
  let node: AudioNode = src;
  if (highpass > 0) {
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = highpass;
    src.connect(hp);
    node = hp;
  }
  node.connect(lp);
  lp.connect(g);
  g.connect(master);
  src.start();
}

function tone(freq: number, duration: number, gain: number, type: OscillatorType = 'sine', delay = 0, slideTo?: number) {
  const c = ac();
  if (!c || !master || !enabled) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

export const sfx = {
  dice() {
    noiseBurst(0.08, 0.25, 5200, 900);
    setTimeout(() => noiseBurst(0.07, 0.2, 4200, 700), 70);
    setTimeout(() => noiseBurst(0.09, 0.16, 3400, 500), 150);
  },
  roll() {
    for (let i = 0; i < 7; i++) {
      setTimeout(() => noiseBurst(0.05, 0.12 + Math.random() * 0.06, 2600 + Math.random() * 2600, 600), i * 45);
    }
  },
  move() {
    tone(196, 0.09, 0.16, 'triangle', 0, 150);
    noiseBurst(0.05, 0.16, 2600, 700);
  },
  hit() {
    tone(96, 0.22, 0.3, 'sine', 0, 62);
    noiseBurst(0.14, 0.28, 1400, 220);
  },
  off() {
    tone(520, 0.12, 0.1, 'sine', 0, 330);
    noiseBurst(0.07, 0.1, 3000, 1200);
  },
  select() {
    tone(880, 0.035, 0.05, 'sine');
  },
  click() {
    tone(620, 0.05, 0.07, 'triangle', 0, 540);
  },
  win() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => tone(n, 0.34, 0.13, 'sine', i * 0.1));
    tone(1567.98, 0.5, 0.07, 'sine', 0.42);
  },
  lose() {
    const notes = [440, 392, 329.63];
    notes.forEach((n, i) => tone(n, 0.32, 0.1, 'sine', i * 0.12));
  },
};

export function haptic(ms = 10) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* yok say */
  }
}
