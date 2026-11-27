// Web Audio API 절차적 효과음 합성기 — 따뜻한 저중음역 중심의 19종 효과음과 마스터 오디오 체인 구성.

export type SfxKey =
  | 'cast'
  | 'bite'
  | 'hitGood'
  | 'hitPerfect'
  | 'lineSnap'
  | 'catchSplash'
  | 'catchEpic'
  | 'catchLegend'
  | 'catchMutation'
  | 'namedSpawn'
  | 'namedHit'
  | 'namedMiss'
  | 'namedClear'
  | 'namedEscape'
  | 'shopSell'
  | 'gearUpgrade'
  | 'rewardClaim'
  | 'eventSettle'
  | 'buttonClick';

export const BGM_GAIN_SCALE = 0.42;
export const SFX_GAIN_SCALE = 1.45;

export const SFX_BUS_CONFIG = {
  lowpassHz: 3600,
  lowpassQ: 0.65,
  presenceHz: 1650,
  presenceGainDb: 2.5,
  presenceQ: 0.8,
  roomSec: 0.9,
  roomCutoffHz: 1450,
  dryGain: 1.0,
  wetGain: 0.22,
  compressorThreshold: -14,
  compressorRatio: 5,
} as const;

export const SFX_COOLDOWN_MS: Record<SfxKey, number> = {
  cast: 100,
  bite: 120,
  hitGood: 80,
  hitPerfect: 80,
  lineSnap: 120,
  catchSplash: 100,
  catchEpic: 140,
  catchLegend: 150,
  catchMutation: 150,
  namedSpawn: 150,
  namedHit: 80,
  namedMiss: 100,
  namedClear: 150,
  namedEscape: 150,
  shopSell: 100,
  gearUpgrade: 120,
  rewardClaim: 120,
  eventSettle: 140,
  buttonClick: 90,
};

export interface SfxPlaybackEnv {
  ctx: AudioContext;
  sfxMaster: AudioNode;
  trackNode: (node: AudioScheduledSourceNode) => void;
}

export function createRoomImpulse(ctx: AudioContext, durSec: number, cutoffHz: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * durSec));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let lp = 0;
    const alpha = Math.min(1, (2 * Math.PI * cutoffHz) / ctx.sampleRate);
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, 2.6);
      const white = (Math.random() * 2 - 1) * env;
      lp = lp + alpha * (white - lp);
      data[i] = lp * 0.45;
    }
  }
  return buf;
}

/** SFX 마스터 버스 체인(3600Hz LPF → 1650Hz +2.5dB EQ → 드라이/0.9s 룸 잔향 → 컴프레서)을 구축한다 */
export function buildSfxMasterChain(ctx: AudioContext, initialGain: number): GainNode {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.setValueAtTime(SFX_BUS_CONFIG.compressorThreshold, ctx.currentTime);
  comp.ratio.setValueAtTime(SFX_BUS_CONFIG.compressorRatio, ctx.currentTime);
  comp.connect(ctx.destination);

  const warmBusLpf = ctx.createBiquadFilter();
  warmBusLpf.type = 'lowpass';
  warmBusLpf.frequency.setValueAtTime(SFX_BUS_CONFIG.lowpassHz, ctx.currentTime);
  warmBusLpf.Q.setValueAtTime(SFX_BUS_CONFIG.lowpassQ, ctx.currentTime);

  const presenceEq = ctx.createBiquadFilter();
  presenceEq.type = 'peaking';
  presenceEq.frequency.setValueAtTime(SFX_BUS_CONFIG.presenceHz, ctx.currentTime);
  presenceEq.Q.setValueAtTime(SFX_BUS_CONFIG.presenceQ, ctx.currentTime);
  presenceEq.gain.setValueAtTime(SFX_BUS_CONFIG.presenceGainDb, ctx.currentTime);

  const dryGain = ctx.createGain();
  dryGain.gain.setValueAtTime(SFX_BUS_CONFIG.dryGain, ctx.currentTime);

  const sfxMaster = ctx.createGain();
  sfxMaster.gain.setValueAtTime(initialGain, ctx.currentTime);
  sfxMaster.connect(warmBusLpf);
  warmBusLpf.connect(presenceEq);

  presenceEq.connect(dryGain);
  dryGain.connect(comp);

  if (typeof ctx.createConvolver === 'function') {
    const convolver = ctx.createConvolver();
    convolver.buffer = createRoomImpulse(ctx, SFX_BUS_CONFIG.roomSec, SFX_BUS_CONFIG.roomCutoffHz);
    const wetGain = ctx.createGain();
    wetGain.gain.setValueAtTime(SFX_BUS_CONFIG.wetGain, ctx.currentTime);
    presenceEq.connect(convolver);
    convolver.connect(wetGain);
    wetGain.connect(comp);
  }

  return sfxMaster;
}

function createNoiseBuffer(ctx: AudioContext, durSec: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * durSec));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    ch[i] = Math.random() * 2 - 1;
  }
  return buf;
}

function createPinkNoiseBuffer(ctx: AudioContext, durSec: number): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * durSec));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const ch = buf.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    ch[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  return buf;
}

interface ToneOpts {
  at?: number;
  dur?: number;
  type?: OscillatorType;
  freq: number;
  endFreq?: number;
  exp?: boolean;
  attack?: number;
  gain?: number;
  dest?: AudioNode;
}

function playTone(env: SfxPlaybackEnv, opts: ToneOpts): void {
  const { ctx, sfxMaster, trackNode } = env;
  const t = opts.at ?? ctx.currentTime;
  const dur = opts.dur ?? 0.2;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(opts.freq, t);
  if (opts.endFreq) {
    if (opts.exp) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.endFreq), t + dur);
    } else {
      osc.frequency.linearRampToValueAtTime(opts.endFreq, t + dur);
    }
  }
  const peak = opts.gain ?? 0.3;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(peak, t + (opts.attack ?? 0.01));
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain);
  gain.connect(opts.dest ?? sfxMaster);
  trackNode(osc);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

interface NoiseOpts {
  at?: number;
  dur?: number;
  pink?: boolean;
  filterType?: BiquadFilterType;
  freq?: number;
  endFreq?: number;
  q?: number;
  attack?: number;
  gain?: number;
  dest?: AudioNode;
}

function playNoise(env: SfxPlaybackEnv, opts: NoiseOpts): void {
  const { ctx, sfxMaster, trackNode } = env;
  const t = opts.at ?? ctx.currentTime;
  const dur = opts.dur ?? 0.2;
  const src = ctx.createBufferSource();
  src.buffer = opts.pink ? createPinkNoiseBuffer(ctx, dur) : createNoiseBuffer(ctx, dur);
  const filter = ctx.createBiquadFilter();
  filter.type = opts.filterType ?? 'bandpass';
  filter.frequency.setValueAtTime(opts.freq ?? 1200, t);
  if (opts.endFreq) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, opts.endFreq), t + dur);
  }
  filter.Q.setValueAtTime(opts.q ?? 1.2, t);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(opts.gain ?? 0.25, t + (opts.attack ?? 0.01));
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(opts.dest ?? sfxMaster);
  trackNode(src);
  src.start(t);
  src.stop(t + dur + 0.03);
}

function playWarmChimeNote(
  env: SfxPlaybackEnv,
  at: number,
  freq: number,
  dur: number,
  peakGain: number,
  bright: boolean,
): void {
  const lpf = env.ctx.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.setValueAtTime(bright ? 2250 : 1750, at);
  lpf.Q.setValueAtTime(0.7, at);
  lpf.connect(env.sfxMaster);

  playTone(env, { at, dur, type: 'sine', freq, attack: 0.008, gain: peakGain, dest: lpf });
  playTone(env, {
    at,
    dur: dur * 0.65,
    type: 'triangle',
    freq: freq * 2,
    attack: 0.007,
    gain: peakGain * (bright ? 0.27 : 0.18),
    dest: lpf,
  });
  playTone(env, {
    at,
    dur: dur * 0.85,
    type: 'sine',
    freq: freq * 0.5,
    attack: 0.011,
    gain: peakGain * 0.20,
    dest: lpf,
  });
}

function playDignifiedBrassVoice(
  env: SfxPlaybackEnv,
  dest: AudioNode,
  at: number,
  freq: number,
  attack: number,
  dur: number,
  peakGain: number,
): void {
  playTone(env, { at, dur, type: 'triangle', freq: freq * 0.998, attack, gain: peakGain, dest });
  playTone(env, { at, dur, type: 'sawtooth', freq: freq * 1.002, attack: attack * 1.05, gain: peakGain * 0.40, dest });
  playTone(env, { at, dur, type: 'sine', freq, attack, gain: peakGain * 0.52, dest });
}

function playResonantHarpNote(
  env: SfxPlaybackEnv,
  at: number,
  freq: number,
  dur: number,
  peakGain: number,
): void {
  const harpLpf = env.ctx.createBiquadFilter();
  harpLpf.type = 'lowpass';
  harpLpf.frequency.setValueAtTime(1750, at);
  harpLpf.Q.setValueAtTime(0.65, at);
  harpLpf.connect(env.sfxMaster);

  playTone(env, { at, dur, type: 'sine', freq, attack: 0.011, gain: peakGain, dest: harpLpf });
  playTone(env, { at, dur: dur * 0.55, type: 'triangle', freq: freq * 2, attack: 0.010, gain: peakGain * 0.23, dest: harpLpf });
}

function playWarmWoodNote(
  env: SfxPlaybackEnv,
  at: number,
  freq: number,
  dur: number,
  peakGain: number,
): void {
  const lpf = env.ctx.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.setValueAtTime(1650, at);
  lpf.Q.setValueAtTime(0.65, at);
  lpf.connect(env.sfxMaster);

  playTone(env, { at, dur, type: 'sine', freq, attack: 0.008, gain: peakGain, dest: lpf });
  playTone(env, { at, dur: dur * 0.45, type: 'triangle', freq: freq * 2, attack: 0.007, gain: peakGain * 0.22, dest: lpf });
  playTone(env, {
    at,
    dur: 0.045,
    type: 'sine',
    freq: freq * 0.5,
    endFreq: freq * 0.42,
    attack: 0.003,
    gain: peakGain * 0.22,
    dest: lpf,
  });
}

function playLegendChord(env: SfxPlaybackEnv): void {
  const { ctx, sfxMaster } = env;
  const now = ctx.currentTime;
  const brassLpf = ctx.createBiquadFilter();
  brassLpf.type = 'lowpass';
  brassLpf.Q.setValueAtTime(0.85, now);
  brassLpf.frequency.setValueAtTime(420, now);
  brassLpf.frequency.linearRampToValueAtTime(1800, now + 0.36);
  brassLpf.frequency.exponentialRampToValueAtTime(720, now + 2.40);
  brassLpf.connect(sfxMaster);

  playDignifiedBrassVoice(env, brassLpf, now, 73.42, 0.11, 2.45, 0.26);
  playDignifiedBrassVoice(env, brassLpf, now, 146.83, 0.12, 2.42, 0.23);

  const swellNotes = [
    { f: 220.00, delay: 0.035, g: 0.16 },
    { f: 293.66, delay: 0.070, g: 0.15 },
    { f: 369.99, delay: 0.105, g: 0.14 },
    { f: 440.00, delay: 0.135, g: 0.13 },
    { f: 659.25, delay: 0.165, g: 0.105 },
  ];
  for (const n of swellNotes) {
    playDignifiedBrassVoice(env, brassLpf, now + n.delay, n.f, 0.17, 2.30 - n.delay, n.g);
  }

  const harpNotes = [
    { f: 293.66, delay: 0.025, g: 0.155 },
    { f: 440.00, delay: 0.085, g: 0.145 },
    { f: 369.99, delay: 0.150, g: 0.135 },
    { f: 659.25, delay: 0.220, g: 0.11 },
  ];
  for (const h of harpNotes) {
    playResonantHarpNote(env, now + h.delay, h.f, 1.90, h.g);
  }
}

function playAbyssalMutationBed(env: SfxPlaybackEnv): void {
  const { ctx, sfxMaster, trackNode } = env;
  const now = ctx.currentTime;
  const dur = 2.45;

  const noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = createPinkNoiseBuffer(ctx, dur);

  const bpFilter = ctx.createBiquadFilter();
  bpFilter.type = 'bandpass';
  bpFilter.Q.setValueAtTime(2.6, now);
  bpFilter.frequency.setValueAtTime(280, now);
  bpFilter.frequency.linearRampToValueAtTime(1020, now + 0.78);
  bpFilter.frequency.exponentialRampToValueAtTime(320, now + 2.40);

  const softCap = ctx.createBiquadFilter();
  softCap.type = 'lowpass';
  softCap.frequency.setValueAtTime(2200, now);

  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(1.4, now);
  const lfoFreqGain = ctx.createGain();
  lfoFreqGain.gain.setValueAtTime(60, now);
  lfo.connect(lfoFreqGain);
  lfoFreqGain.connect(bpFilter.frequency);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.0001, now);
  noiseGain.gain.linearRampToValueAtTime(0.32, now + 0.36);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.40);

  noiseSrc.connect(bpFilter);
  bpFilter.connect(softCap);
  softCap.connect(noiseGain);
  noiseGain.connect(sfxMaster);

  trackNode(noiseSrc);
  trackNode(lfo);
  noiseSrc.start(now);
  noiseSrc.stop(now + dur + 0.04);
  lfo.start(now);
  lfo.stop(now + dur + 0.04);

  const droneLpf = ctx.createBiquadFilter();
  droneLpf.type = 'lowpass';
  droneLpf.frequency.setValueAtTime(480, now);
  droneLpf.connect(sfxMaster);

  playTone(env, { at: now, dur: 2.40, type: 'sine', freq: 110.0, endFreq: 108.0, attack: 0.30, gain: 0.26, dest: droneLpf });
  playTone(env, { at: now, dur: 2.40, type: 'triangle', freq: 113.5, endFreq: 111.5, attack: 0.34, gain: 0.18, dest: droneLpf });

  playTone(env, { at: now + 0.14, dur: 2.20, type: 'sine', freq: 311.13, endFreq: 304.0, attack: 0.38, gain: 0.070 });
  playTone(env, { at: now + 0.24, dur: 2.08, type: 'sine', freq: 466.16, endFreq: 458.0, attack: 0.42, gain: 0.048 });
}

type SfxHandler = (env: SfxPlaybackEnv, arg?: number) => void;

const SFX_HANDLERS: Record<SfxKey, SfxHandler> = {
  cast(env) {
    const now = env.ctx.currentTime;
    const lpf = env.ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(1550, now);
    lpf.connect(env.sfxMaster);

    playNoise(env, { at: now, dur: 0.22, pink: true, filterType: 'bandpass', freq: 440, endFreq: 1250, q: 1.3, attack: 0.007, gain: 0.27, dest: lpf });
    playTone(env, { at: now + 0.16, dur: 0.18, type: 'sine', freq: 270, endFreq: 120, exp: true, attack: 0.007, gain: 0.30, dest: lpf });
    playNoise(env, { at: now + 0.17, dur: 0.14, pink: true, filterType: 'bandpass', freq: 720, endFreq: 300, q: 1.2, gain: 0.19, dest: lpf });
  },
  bite(env) {
    const now = env.ctx.currentTime;
    const lpf = env.ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(1650, now);
    lpf.connect(env.sfxMaster);

    playTone(env, { at: now, dur: 0.16, type: 'triangle', freq: 329.63, endFreq: 311.13, attack: 0.007, gain: 0.29, dest: lpf });
    playTone(env, { at: now, dur: 0.12, type: 'sine', freq: 164.81, attack: 0.007, gain: 0.24, dest: lpf });
    playTone(env, { at: now + 0.13, dur: 0.22, type: 'triangle', freq: 440.00, endFreq: 428.0, attack: 0.007, gain: 0.31, dest: lpf });
    playNoise(env, { at: now + 0.12, dur: 0.14, pink: true, filterType: 'bandpass', freq: 560, endFreq: 270, q: 1.4, gain: 0.18, dest: lpf });
  },
  hitGood(env) {
    const now = env.ctx.currentTime;
    playWarmChimeNote(env, now, 261.63, 0.24, 0.30, false);
    playWarmChimeNote(env, now + 0.085, 392.00, 0.34, 0.32, false);
  },
  hitPerfect(env) {
    const now = env.ctx.currentTime;
    playWarmChimeNote(env, now, 261.63, 0.28, 0.28, true);
    playWarmChimeNote(env, now + 0.075, 392.00, 0.34, 0.30, true);
    playWarmChimeNote(env, now + 0.15, 523.25, 0.52, 0.32, true);
    playTone(env, { at: now + 0.17, dur: 0.44, type: 'sine', freq: 783.99, attack: 0.02, gain: 0.095 });
    playTone(env, { at: now + 0.18, dur: 0.46, type: 'sine', freq: 1046.50, attack: 0.022, gain: 0.075 });
  },
  lineSnap(env) {
    const now = env.ctx.currentTime;
    const snapLpf = env.ctx.createBiquadFilter();
    snapLpf.type = 'lowpass';
    snapLpf.frequency.setValueAtTime(780, now);
    snapLpf.connect(env.sfxMaster);

    playNoise(env, { at: now, dur: 0.13, pink: true, filterType: 'bandpass', freq: 520, endFreq: 165, q: 1.2, attack: 0.006, gain: 0.29, dest: snapLpf });
    playTone(env, { at: now + 0.01, dur: 0.26, type: 'triangle', freq: 185, endFreq: 68, exp: true, attack: 0.006, gain: 0.31, dest: snapLpf });
    playTone(env, { at: now, dur: 0.11, type: 'sine', freq: 260, endFreq: 110, exp: true, attack: 0.006, gain: 0.18, dest: snapLpf });
  },
  catchSplash(env) {
    const now = env.ctx.currentTime;
    const lpf = env.ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(1450, now);
    lpf.connect(env.sfxMaster);

    playNoise(env, { at: now, dur: 0.34, pink: true, filterType: 'bandpass', freq: 980, endFreq: 300, q: 0.9, attack: 0.007, gain: 0.33, dest: lpf });
    playTone(env, { at: now + 0.04, dur: 0.20, type: 'sine', freq: 210, endFreq: 370, exp: true, attack: 0.008, gain: 0.25, dest: lpf });
    playTone(env, { at: now + 0.08, dur: 0.24, type: 'sine', freq: 145, endFreq: 95, gain: 0.22, dest: lpf });
  },
  catchEpic(env) {
    const now = env.ctx.currentTime;
    const epicLpf = env.ctx.createBiquadFilter();
    epicLpf.type = 'lowpass';
    epicLpf.Q.setValueAtTime(0.85, now);
    epicLpf.frequency.setValueAtTime(460, now);
    epicLpf.frequency.linearRampToValueAtTime(1450, now + 0.20);
    epicLpf.frequency.exponentialRampToValueAtTime(620, now + 1.15);
    epicLpf.connect(env.sfxMaster);

    playDignifiedBrassVoice(env, epicLpf, now, 146.83, 0.07, 1.16, 0.21);
    playDignifiedBrassVoice(env, epicLpf, now + 0.025, 220.00, 0.08, 1.12, 0.18);

    playResonantHarpNote(env, now + 0.025, 293.66, 1.06, 0.165);
    playResonantHarpNote(env, now + 0.07, 369.99, 1.04, 0.165);
    playResonantHarpNote(env, now + 0.115, 440.00, 1.06, 0.155);
  },
  catchLegend(env) {
    playLegendChord(env);
  },
  catchMutation(env) {
    playAbyssalMutationBed(env);
  },
  namedSpawn(env) {
    const now = env.ctx.currentTime;
    const hornLpf = env.ctx.createBiquadFilter();
    hornLpf.type = 'lowpass';
    hornLpf.Q.setValueAtTime(0.95, now);
    hornLpf.frequency.setValueAtTime(230, now);
    hornLpf.frequency.linearRampToValueAtTime(720, now + 0.72);
    hornLpf.frequency.exponentialRampToValueAtTime(300, now + 2.95);
    hornLpf.connect(env.sfxMaster);

    playDignifiedBrassVoice(env, hornLpf, now, 55.00, 0.28, 3.00, 0.30);
    playDignifiedBrassVoice(env, hornLpf, now + 0.04, 82.41, 0.30, 2.95, 0.23);
    playDignifiedBrassVoice(env, hornLpf, now + 0.10, 110.00, 0.34, 2.85, 0.21);
    playDignifiedBrassVoice(env, hornLpf, now + 0.18, 164.81, 0.36, 2.72, 0.16);

    playTone(env, { at: now, dur: 2.95, type: 'sine', freq: 58.0, endFreq: 54.5, attack: 0.36, gain: 0.24, dest: hornLpf });
    playNoise(env, { at: now, dur: 2.85, pink: true, filterType: 'bandpass', freq: 95, endFreq: 180, q: 1.7, attack: 0.44, gain: 0.25, dest: hornLpf });
  },
  namedHit(env, step) {
    const idx = Math.max(1, Math.min(5, step ?? 1));
    const now = env.ctx.currentTime;
    const impactLpf = env.ctx.createBiquadFilter();
    impactLpf.type = 'lowpass';
    impactLpf.frequency.setValueAtTime(620 + idx * 105, now);
    impactLpf.Q.setValueAtTime(0.8, now);
    impactLpf.connect(env.sfxMaster);

    playTone(env, { at: now, dur: 0.24, type: 'sine', freq: 95, endFreq: 38, exp: true, attack: 0.004, gain: 0.40, dest: impactLpf });
    playTone(env, { at: now, dur: 0.18, type: 'triangle', freq: 124, endFreq: 48, exp: true, attack: 0.004, gain: 0.26, dest: impactLpf });
    playTone(env, { at: now, dur: 0.05, type: 'triangle', freq: 320 + idx * 24, endFreq: 135, exp: true, attack: 0.003, gain: 0.17, dest: impactLpf });
    playNoise(env, { at: now, dur: 0.16, pink: true, filterType: 'lowpass', freq: 620 + idx * 95, endFreq: 160, q: 1.0, attack: 0.003, gain: 0.36, dest: impactLpf });

    const tensionFreq = 195 * (1 + (idx - 1) * 0.085);
    playTone(env, { at: now + 0.012, dur: 0.20, type: 'triangle', freq: tensionFreq, endFreq: tensionFreq * 0.72, exp: true, attack: 0.006, gain: 0.18 + idx * 0.022, dest: impactLpf });
    playNoise(env, { at: now + 0.035, dur: 0.24, pink: true, filterType: 'bandpass', freq: 300 + idx * 45, endFreq: 130, q: 1.3, attack: 0.015, gain: 0.20, dest: impactLpf });
  },
  namedMiss(env) {
    const now = env.ctx.currentTime;
    const missLpf = env.ctx.createBiquadFilter();
    missLpf.type = 'lowpass';
    missLpf.frequency.setValueAtTime(1450, now);
    missLpf.connect(env.sfxMaster);

    playNoise(env, { at: now, dur: 0.34, pink: true, filterType: 'bandpass', freq: 1080, endFreq: 260, q: 1.5, attack: 0.02, gain: 0.33, dest: missLpf });
    playTone(env, { at: now + 0.03, dur: 0.26, type: 'sine', freq: 155, endFreq: 76, exp: true, attack: 0.015, gain: 0.19, dest: missLpf });
  },
  namedClear(env) {
    const now = env.ctx.currentTime;
    const clearLpf = env.ctx.createBiquadFilter();
    clearLpf.type = 'lowpass';
    clearLpf.Q.setValueAtTime(0.85, now);
    clearLpf.frequency.setValueAtTime(420, now);
    clearLpf.frequency.linearRampToValueAtTime(1700, now + 0.45);
    clearLpf.frequency.exponentialRampToValueAtTime(680, now + 3.15);
    clearLpf.connect(env.sfxMaster);

    playTone(env, { at: now, dur: 0.42, type: 'sine', freq: 72, endFreq: 42, exp: true, attack: 0.008, gain: 0.31, dest: clearLpf });
    playDignifiedBrassVoice(env, clearLpf, now + 0.02, 73.42, 0.17, 3.18, 0.25);
    playDignifiedBrassVoice(env, clearLpf, now + 0.045, 110.00, 0.19, 3.12, 0.21);
    playDignifiedBrassVoice(env, clearLpf, now + 0.075, 146.83, 0.21, 3.06, 0.22);
    playDignifiedBrassVoice(env, clearLpf, now + 0.14, 220.00, 0.22, 2.95, 0.18);
    playDignifiedBrassVoice(env, clearLpf, now + 0.22, 293.66, 0.24, 2.85, 0.16);
    playDignifiedBrassVoice(env, clearLpf, now + 0.30, 369.99, 0.26, 2.75, 0.14);
    playDignifiedBrassVoice(env, clearLpf, now + 0.38, 440.00, 0.28, 2.65, 0.13);

    playResonantHarpNote(env, now + 0.24, 293.66, 2.40, 0.145);
    playResonantHarpNote(env, now + 0.36, 440.00, 2.30, 0.135);
  },
  namedEscape(env) {
    const now = env.ctx.currentTime;
    const escLpf = env.ctx.createBiquadFilter();
    escLpf.type = 'lowpass';
    escLpf.Q.setValueAtTime(0.9, now);
    escLpf.frequency.setValueAtTime(680, now);
    escLpf.frequency.exponentialRampToValueAtTime(210, now + 2.25);
    escLpf.connect(env.sfxMaster);

    playDignifiedBrassVoice(env, escLpf, now, 146.83, 0.09, 0.90, 0.21);
    playDignifiedBrassVoice(env, escLpf, now + 0.40, 110.00, 0.13, 1.15, 0.22);
    playDignifiedBrassVoice(env, escLpf, now + 0.90, 87.31, 0.16, 1.35, 0.23);
    playTone(env, { at: now + 0.18, dur: 2.10, type: 'sine', freq: 98.0, endFreq: 49.0, exp: true, attack: 0.16, gain: 0.25, dest: escLpf });
    playNoise(env, { at: now + 0.12, dur: 2.15, pink: true, filterType: 'bandpass', freq: 540, endFreq: 140, q: 1.5, attack: 0.20, gain: 0.22, dest: escLpf });
  },
  shopSell(env) {
    const now = env.ctx.currentTime;
    const coinLpf = env.ctx.createBiquadFilter();
    coinLpf.type = 'lowpass';
    coinLpf.frequency.setValueAtTime(1750, now);
    coinLpf.connect(env.sfxMaster);

    const hits = [
      { t: 0.00, f1: 520, f2: 780, thud: 135, g: 0.25 },
      { t: 0.070, f1: 470, f2: 705, thud: 120, g: 0.27 },
      { t: 0.155, f1: 435, f2: 652, thud: 110, g: 0.23 },
    ];
    for (const h of hits) {
      playTone(env, { at: now + h.t, dur: 0.06, type: 'sine', freq: h.thud, endFreq: 68, exp: true, attack: 0.003, gain: 0.21, dest: coinLpf });
      playTone(env, { at: now + h.t, dur: 0.16, type: 'triangle', freq: h.f1, endFreq: h.f1 * 0.97, attack: 0.003, gain: h.g, dest: coinLpf });
      playTone(env, { at: now + h.t, dur: 0.12, type: 'sine', freq: h.f2, attack: 0.003, gain: h.g * 0.56, dest: coinLpf });
    }
  },
  gearUpgrade(env) {
    const now = env.ctx.currentTime;
    const forgeLpf = env.ctx.createBiquadFilter();
    forgeLpf.type = 'lowpass';
    forgeLpf.frequency.setValueAtTime(1780, now);
    forgeLpf.Q.setValueAtTime(0.8, now);
    forgeLpf.connect(env.sfxMaster);

    playTone(env, { at: now, dur: 0.20, type: 'sine', freq: 115, endFreq: 48, exp: true, attack: 0.003, gain: 0.35, dest: forgeLpf });
    playNoise(env, { at: now, dur: 0.11, pink: true, filterType: 'bandpass', freq: 720, endFreq: 220, q: 1.1, attack: 0.003, gain: 0.30, dest: forgeLpf });
    playTone(env, { at: now + 0.012, dur: 0.68, type: 'triangle', freq: 293.66, attack: 0.006, gain: 0.27, dest: forgeLpf });
    playTone(env, { at: now + 0.016, dur: 0.72, type: 'sine', freq: 440.00, attack: 0.008, gain: 0.22, dest: forgeLpf });
    playTone(env, { at: now + 0.020, dur: 0.56, type: 'sine', freq: 587.33, attack: 0.010, gain: 0.15, dest: forgeLpf });
  },
  rewardClaim(env) {
    const now = env.ctx.currentTime;
    playWarmWoodNote(env, now, 261.63, 0.32, 0.27);
    playWarmWoodNote(env, now + 0.070, 329.63, 0.34, 0.27);
    playWarmWoodNote(env, now + 0.145, 392.00, 0.48, 0.29);
  },
  eventSettle(env) {
    const now = env.ctx.currentTime;
    playWarmWoodNote(env, now, 146.83, 0.95, 0.23);
    playWarmWoodNote(env, now + 0.025, 293.66, 0.65, 0.25);
    playWarmWoodNote(env, now + 0.10, 369.99, 0.65, 0.24);
    playWarmWoodNote(env, now + 0.175, 440.00, 0.72, 0.25);
    playWarmWoodNote(env, now + 0.25, 587.33, 0.85, 0.25);
  },
  buttonClick(env) {
    const now = env.ctx.currentTime;
    const clickLpf = env.ctx.createBiquadFilter();
    clickLpf.type = 'lowpass';
    clickLpf.frequency.setValueAtTime(1200, now);
    clickLpf.connect(env.sfxMaster);

    playTone(env, { at: now, dur: 0.04, type: 'sine', freq: 300, endFreq: 165, exp: true, attack: 0.002, gain: 0.14, dest: clickLpf });
    playTone(env, { at: now, dur: 0.025, type: 'triangle', freq: 520, endFreq: 280, exp: true, attack: 0.002, gain: 0.07, dest: clickLpf });
  },
};

export function synthesizeSfx(env: SfxPlaybackEnv, key: SfxKey, arg?: number): void {
  SFX_HANDLERS[key](env, arg);
}
