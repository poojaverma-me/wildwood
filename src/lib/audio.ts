"use client";

/** Tiny WebAudio sound kit: everything is synthesised, no audio files. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let rainGain: GainNode | null = null;
let fireGain: GainNode | null = null;
let windGain: GainNode | null = null;

function noiseBuffer(c: AudioContext, seconds = 2) {
  const b = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function loop(c: AudioContext, filterType: BiquadFilterType, freq: number, q = 0.7) {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 3);
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = filterType;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.value = 0;
  src.connect(f).connect(g).connect(master!);
  src.start();
  return g;
}

export function initAudio() {
  if (ctx) return;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.7;
  master.connect(ctx.destination);
  rainGain = loop(ctx, "highpass", 900);
  windGain = loop(ctx, "lowpass", 380);
  fireGain = loop(ctx, "bandpass", 1800, 1.4);
}

const ramp = (g: GainNode | null, v: number) => g && ctx && g.gain.setTargetAtTime(v, ctx.currentTime, 0.4);

export function setAmbience(rain: number, wind: number, fire: number) {
  ramp(rainGain, rain * 0.32);
  ramp(windGain, wind * 0.22);
  ramp(fireGain, fire * 0.08);
}

function burst(duration: number, freq: number, type: BiquadFilterType, gain: number, decay = duration) {
  if (!ctx || !master) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, duration);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + decay);
  src.connect(f).connect(g).connect(master);
  src.start();
  src.stop(t + duration);
}

function tone(freq: number, duration: number, gain = 0.15, type: OscillatorType = "sine", slideTo?: number) {
  if (!ctx || !master) return;
  const o = ctx.createOscillator();
  o.type = type;
  const g = ctx.createGain();
  const t = ctx.currentTime;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + duration);
  o.connect(g).connect(master);
  o.start();
  o.stop(t + duration);
}

export const sfx = {
  shot: () => {
    burst(0.35, 1400, "lowpass", 0.9, 0.3);
    tone(120, 0.18, 0.4, "triangle", 40);
  },
  empty: () => tone(1800, 0.04, 0.08, "square"),
  click: () => tone(2400, 0.03, 0.06, "square"),
  equip: () => {
    burst(0.12, 3000, "bandpass", 0.25, 0.1);
    setTimeout(() => tone(900, 0.05, 0.06, "square"), 90);
  },
  reload: () => {
    tone(700, 0.05, 0.08, "square");
    setTimeout(() => tone(500, 0.06, 0.1, "square"), 260);
  },
  heal: () => {
    tone(660, 0.18, 0.08);
    setTimeout(() => tone(990, 0.25, 0.07), 120);
  },
  ignite: () => burst(1.2, 600, "lowpass", 0.5, 1.1),
  chop: () => {
    burst(0.15, 500, "lowpass", 0.7, 0.12);
    tone(160, 0.12, 0.25, "triangle", 80);
  },
  glass: () => {
    burst(0.4, 5000, "highpass", 0.4, 0.35);
    tone(2600, 0.2, 0.05, "sine", 1800);
  },
  thunder: () => {
    setTimeout(() => burst(3.2, 220, "lowpass", 1.0, 3.0), 300 + Math.random() * 900);
  },
  voice: () => tone(1320, 0.08, 0.05),
};
