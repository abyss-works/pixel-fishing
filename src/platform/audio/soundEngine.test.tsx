import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SOUND_SETTINGS,
  getSoundSettings,
  reloadSoundSettings,
  resetSoundSettings,
  setBgmEnabled,
  setBgmVolume,
  setSfxEnabled,
  setSfxVolume,
  SOUND_KEYS,
} from '../api/sound';
import {
  BGM_ASSET_PATH,
  BGM_RESUME_FADE_IN_SEC,
  SoundEngine,
} from './soundEngine';
import { BGM_GAIN_SCALE, SFX_BUS_CONFIG, SFX_GAIN_SCALE } from './sfxSynth';
import type { SfxKey } from './sfxSynth';

class FakeAudioParam {
  value = 0;
  calls: Array<{ method: string; args: unknown[] }> = [];

  setValueAtTime(value: number, time: number): this {
    this.value = value;
    this.calls.push({ method: 'setValueAtTime', args: [value, time] });
    return this;
  }

  linearRampToValueAtTime(value: number, time: number): this {
    this.value = value;
    this.calls.push({ method: 'linearRampToValueAtTime', args: [value, time] });
    return this;
  }

  exponentialRampToValueAtTime(value: number, time: number): this {
    this.value = value;
    this.calls.push({ method: 'exponentialRampToValueAtTime', args: [value, time] });
    return this;
  }

  cancelScheduledValues(time: number): this {
    this.calls.push({ method: 'cancelScheduledValues', args: [time] });
    return this;
  }
}

class FakeAudioNode {
  connections: unknown[] = [];
  disconnected = false;

  connect(dest: unknown): unknown {
    this.connections.push(dest);
    return dest;
  }

  disconnect(): void {
    this.disconnected = true;
  }
}

class FakeGainNode extends FakeAudioNode {
  gain = new FakeAudioParam();
}

class FakeBiquadFilterNode extends FakeAudioNode {
  type: BiquadFilterType = 'lowpass';
  frequency = new FakeAudioParam();
  Q = new FakeAudioParam();
  gain = new FakeAudioParam();
}

class FakeCompressorNode extends FakeAudioNode {
  threshold = new FakeAudioParam();
  ratio = new FakeAudioParam();
}

class FakeConvolverNode extends FakeAudioNode {
  buffer: FakeAudioBuffer | null = null;
}

class FakeAudioBuffer {
  duration: number;
  length: number;
  numberOfChannels: number;
  sampleRate: number;
  private channels: Float32Array[];

  constructor(channels: number, length: number, sampleRate: number, duration?: number) {
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = duration ?? length / sampleRate;
    this.channels = Array.from({ length: channels }, () => new Float32Array(length));
  }

  getChannelData(ch: number): Float32Array {
    return this.channels[ch];
  }
}

class FakeScheduledSourceNode extends FakeAudioNode {
  startedAt: number | null = null;
  startedOffset: number | null = null;
  stopped = false;
  onended: ((ev: Event) => void) | null = null;
  buffer: FakeAudioBuffer | null = null;
  loop = false;
  type: OscillatorType = 'sine';
  frequency = new FakeAudioParam();

  start(when = 0, offset = 0): void {
    this.startedAt = when;
    this.startedOffset = offset;
  }

  stop(): void {
    this.stopped = true;
  }
}

class FakeAudioContext {
  state: AudioContextState | 'interrupted' = 'running';
  currentTime = 10;
  sampleRate = 48000;
  destination = new FakeAudioNode();
  onstatechange: (() => void) | null = null;

  gains: FakeGainNode[] = [];
  filters: FakeBiquadFilterNode[] = [];
  convolvers: FakeConvolverNode[] = [];
  compressors: FakeCompressorNode[] = [];
  oscillators: FakeScheduledSourceNode[] = [];
  bufferSources: FakeScheduledSourceNode[] = [];

  resumeBehavior: 'resolve-running' | 'stay-suspended' | 'reject' = 'resolve-running';
  resumeCalls = 0;
  closeCalls = 0;
  decodeCalls = 0;
  decodedDuration = 90;

  createGain(): FakeGainNode {
    const node = new FakeGainNode();
    this.gains.push(node);
    return node;
  }

  createBiquadFilter(): FakeBiquadFilterNode {
    const node = new FakeBiquadFilterNode();
    this.filters.push(node);
    return node;
  }

  createConvolver(): FakeConvolverNode {
    const node = new FakeConvolverNode();
    this.convolvers.push(node);
    return node;
  }

  createDynamicsCompressor(): FakeCompressorNode {
    const node = new FakeCompressorNode();
    this.compressors.push(node);
    return node;
  }

  createOscillator(): FakeScheduledSourceNode {
    const node = new FakeScheduledSourceNode();
    this.oscillators.push(node);
    return node;
  }

  createBufferSource(): FakeScheduledSourceNode {
    const node = new FakeScheduledSourceNode();
    this.bufferSources.push(node);
    return node;
  }

  createBuffer(channels: number, length: number, sampleRate: number): FakeAudioBuffer {
    return new FakeAudioBuffer(channels, length, sampleRate);
  }

  async decodeAudioData(): Promise<FakeAudioBuffer> {
    this.decodeCalls += 1;
    return new FakeAudioBuffer(2, this.sampleRate * this.decodedDuration, this.sampleRate, this.decodedDuration);
  }

  async resume(): Promise<void> {
    this.resumeCalls += 1;
    if (this.resumeBehavior === 'reject') {
      throw new Error('resume blocked');
    }
    if (this.resumeBehavior === 'resolve-running') {
      this.state = 'running';
    }
  }

  async close(): Promise<void> {
    this.closeCalls += 1;
    this.state = 'closed';
  }
}

async function flushMicrotasks(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
  }
}

describe('sound adapter & API settings', () => {
  beforeEach(() => {
    localStorage.clear();
    resetSoundSettings();
  });

  afterEach(() => {
    localStorage.clear();
    resetSoundSettings();
  });

  it('기본값은 배경음·효과음 모두 꺼짐, 음량 0.5(50%)다', () => {
    expect(getSoundSettings()).toEqual(DEFAULT_SOUND_SETTINGS);
    expect(getSoundSettings()).toEqual({
      bgmEnabled: false,
      sfxEnabled: false,
      bgmVolume: 0.5,
      sfxVolume: 0.5,
    });
  });

  it('지정된 localStorage 키에 설정을 읽고 쓴다', () => {
    setBgmEnabled(true);
    setSfxEnabled(true);
    setBgmVolume(0.75);
    setSfxVolume(0.3);

    expect(localStorage.getItem(SOUND_KEYS.bgmEnabled)).toBe('on');
    expect(localStorage.getItem(SOUND_KEYS.sfxEnabled)).toBe('on');
    expect(localStorage.getItem(SOUND_KEYS.bgmVolume)).toBe('0.75');
    expect(localStorage.getItem(SOUND_KEYS.sfxVolume)).toBe('0.3');

    resetSoundSettings();
    reloadSoundSettings();
    expect(getSoundSettings()).toEqual({
      bgmEnabled: true,
      sfxEnabled: true,
      bgmVolume: 0.75,
      sfxVolume: 0.3,
    });
  });

  it('음량은 0~1 범위로 클램프하고 잘못된 저장값은 0.5로 복구한다', () => {
    setBgmVolume(1.8);
    setSfxVolume(-0.4);
    expect(getSoundSettings().bgmVolume).toBe(1);
    expect(getSoundSettings().sfxVolume).toBe(0);

    localStorage.setItem(SOUND_KEYS.bgmVolume, 'not-a-number');
    localStorage.setItem(SOUND_KEYS.sfxVolume, '');
    reloadSoundSettings();
    expect(getSoundSettings().bgmVolume).toBe(0.5);
    expect(getSoundSettings().sfxVolume).toBe(0.5);
  });
});

describe('SoundEngine 오디오 생명주기 및 합성 검증', () => {
  let contexts: FakeAudioContext[];
  let hidden: boolean;
  let nowMs: number;
  let fetchSpy: ReturnType<typeof vi.fn>;
  let engine: SoundEngine;

  beforeEach(() => {
    contexts = [];
    hidden = false;
    nowMs = 1000;
    fetchSpy = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(16),
    }));
    engine = new SoundEngine({
      createAudioContext: () => {
        const ctx = new FakeAudioContext();
        contexts.push(ctx);
        return ctx as unknown as AudioContext;
      },
      fetchImpl: fetchSpy as unknown as typeof fetch,
      now: () => nowMs,
      isHidden: () => hidden,
      hasFocus: () => true,
      initialSettings: { bgmEnabled: false, sfxEnabled: false, bgmVolume: 0.5, sfxVolume: 0.5 },
    });
  });

  afterEach(() => {
    engine.dispose();
  });

  it('배경음·효과음이 모두 꺼져 있으면 AudioContext를 열지 않고 BGM을 프리로드하지 않는다', () => {
    expect(engine.getState()).toBe('uninitialized');
    expect(engine.playSfx('cast')).toBe(false);
    expect(contexts).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('효과음만 켜면 BGM을 로드하지 않고 마스터 SFX 체인 규격으로 합성한다', () => {
    engine.syncSettings({ bgmEnabled: false, sfxEnabled: true, bgmVolume: 0.5, sfxVolume: 0.5 });
    expect(fetchSpy).not.toHaveBeenCalled();

    expect(engine.playSfx('hitGood')).toBe(true);
    expect(contexts).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();

    const ctx = contexts[0];
    // bgmMaster(gains[0]), dryGain(gains[1]), sfxMaster(gains[2]), wetGain(gains[3])
    expect(ctx.gains[0].gain.value).toBe(0);
    expect(ctx.gains[1].gain.value).toBe(SFX_BUS_CONFIG.dryGain);
    expect(ctx.gains[2].gain.value).toBeCloseTo(0.5 * SFX_GAIN_SCALE, 5);
    expect(ctx.gains[3].gain.value).toBe(SFX_BUS_CONFIG.wetGain);

    // SFX 마스터 필터 체인(3600Hz LPF + 1650Hz +2.5dB Q=0.8 EQ + 0.9s 컨볼버)
    expect(ctx.filters[0].type).toBe('lowpass');
    expect(ctx.filters[0].frequency.value).toBe(SFX_BUS_CONFIG.lowpassHz);
    expect(ctx.filters[1].type).toBe('peaking');
    expect(ctx.filters[1].frequency.value).toBe(SFX_BUS_CONFIG.presenceHz);
    expect(ctx.filters[1].gain.value).toBe(SFX_BUS_CONFIG.presenceGainDb);
    expect(ctx.filters[1].Q.value).toBe(SFX_BUS_CONFIG.presenceQ);
    expect(ctx.convolvers[0].buffer?.duration).toBeCloseTo(SFX_BUS_CONFIG.roomSec, 2);
  });

  it('배경음을 켤 때만 BGM을 지연 로드하고 디코딩 결과를 재사용한다', async () => {
    engine.syncSettings({ bgmEnabled: true, sfxEnabled: false, bgmVolume: 0.5, sfxVolume: 0.5 });
    await flushMicrotasks();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(BGM_ASSET_PATH);
    expect(contexts[0].decodeCalls).toBe(1);
    expect(contexts[0].gains[0].gain.value).toBeCloseTo(0.5 * BGM_GAIN_SCALE, 5);
    expect(contexts[0].bufferSources).toHaveLength(1);

    // 껐다 다시 켜도 네트워크 재요청이나 재디코딩 없이 캐시 버퍼를 쓴다
    engine.syncSettings({ bgmEnabled: false, sfxEnabled: false, bgmVolume: 0.5, sfxVolume: 0.5 });
    engine.syncSettings({ bgmEnabled: true, sfxEnabled: false, bgmVolume: 0.5, sfxVolume: 0.5 });
    await flushMicrotasks();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(contexts[0].decodeCalls).toBe(1);
    expect(contexts[0].bufferSources).toHaveLength(2);
  });

  it('visibilitychange hidden / pagehide 시 즉시 전면 음소거하고 SFX 큐·쿨다운을 폐기한다', async () => {
    engine.syncSettings({ bgmEnabled: true, sfxEnabled: true, bgmVolume: 0.5, sfxVolume: 0.5 });
    await flushMicrotasks();

    const ctx = contexts[0];
    expect(engine.playSfx('namedSpawn')).toBe(true);
    const activeOscCount = ctx.oscillators.length;
    expect(activeOscCount).toBeGreaterThan(0);
    const beforeMuteSourceCount = ctx.bufferSources.length;

    // 백그라운드 전환
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));

    expect(engine.getState()).toBe('bg-muted');
    expect(ctx.gains[0].gain.value).toBe(0);
    expect(ctx.gains[2].gain.value).toBe(0);
    expect(ctx.bufferSources.every(src => src.stopped)).toBe(true);
    expect(ctx.oscillators.every(osc => osc.stopped)).toBe(true);

    // 백그라운드 중 효과음 발동 전면 차단
    expect(engine.playSfx('catchLegend')).toBe(false);

    // 포그라운드 복귀 시 BGM 페이드 인 재개 + 이전 쿨다운 폐기 확인
    hidden = false;
    ctx.currentTime = 18;
    document.dispatchEvent(new Event('visibilitychange'));
    await flushMicrotasks();

    expect(engine.getState()).toBe('running');
    expect(ctx.bufferSources).toHaveLength(beforeMuteSourceCount + 1);
    const bgmGainCalls = ctx.gains[0].gain.calls;
    expect(bgmGainCalls.some(c => c.method === 'linearRampToValueAtTime' && Math.abs((c.args[1] as number) - (18 + BGM_RESUME_FADE_IN_SEC)) < 0.01)).toBe(true);

    // 쿨다운 맵이 백그라운드 전환 시 비워졌으므로 동일 시각에도 재발동 가능
    expect(engine.playSfx('namedSpawn')).toBe(true);
  });

  it('pagehide 에서도 즉시 bg-muted 로 전환하고 pageshow 복귀를 처리한다', async () => {
    engine.syncSettings({ bgmEnabled: true, sfxEnabled: true, bgmVolume: 0.5, sfxVolume: 0.5 });
    await flushMicrotasks();

    hidden = true;
    window.dispatchEvent(new Event('pagehide'));
    expect(engine.getState()).toBe('bg-muted');
    expect(contexts[0].gains[0].gain.value).toBe(0);

    hidden = false;
    window.dispatchEvent(new Event('pageshow'));
    await flushMicrotasks();
    expect(engine.getState()).toBe('running');
  });

  it('iOS Safari suspended/interrupted 복구 — 다음 포인터/키 제스처에서 resume 후 리스너를 정리한다', async () => {
    const customCtx = new FakeAudioContext();
    customCtx.state = 'suspended';
    customCtx.resumeBehavior = 'stay-suspended';

    const iosEngine = new SoundEngine({
      createAudioContext: () => customCtx as unknown as AudioContext,
      fetchImpl: fetchSpy as unknown as typeof fetch,
      now: () => nowMs,
      isHidden: () => false,
      hasFocus: () => true,
      initialSettings: { bgmEnabled: true, sfxEnabled: true, bgmVolume: 0.5, sfxVolume: 0.5 },
    });

    iosEngine.syncSettings({ bgmEnabled: true, sfxEnabled: true, bgmVolume: 0.5, sfxVolume: 0.5 });
    await flushMicrotasks();
    expect(iosEngine.getState()).toBe('suspended-awaiting-gesture');

    // 제스처가 아닌 동안 효과음 차단
    expect(iosEngine.playSfx('cast')).toBe(false);

    // 사용자 제스처(pointerdown) 발생 시 resume 성공
    customCtx.resumeBehavior = 'resolve-running';
    window.dispatchEvent(new Event('pointerdown'));
    await flushMicrotasks();

    expect(iosEngine.getState()).toBe('running');
    expect(customCtx.bufferSources).toHaveLength(1);
    expect(iosEngine.playSfx('cast')).toBe(true);

    const callsAfterResume = customCtx.resumeCalls;
    window.dispatchEvent(new Event('keydown'));
    await flushMicrotasks();
    expect(customCtx.resumeCalls).toBe(callsAfterResume);

    iosEngine.dispose();
  });

  it('연속 resume 실패 시 closed 상태로 정리하고 다음 제스처에서 새 AudioContext를 생성한다', async () => {
    const created: FakeAudioContext[] = [];
    const flakyEngine = new SoundEngine({
      createAudioContext: () => {
        const c = new FakeAudioContext();
        c.state = 'suspended';
        c.resumeBehavior = 'reject';
        created.push(c);
        return c as unknown as AudioContext;
      },
      fetchImpl: fetchSpy as unknown as typeof fetch,
      now: () => nowMs,
      isHidden: () => false,
      hasFocus: () => true,
      initialSettings: { bgmEnabled: false, sfxEnabled: true, bgmVolume: 0.5, sfxVolume: 0.5 },
    });

    flakyEngine.syncSettings({ bgmEnabled: false, sfxEnabled: true, bgmVolume: 0.5, sfxVolume: 0.5 });
    flakyEngine.playSfx('cast'); // 1회 실패
    await flushMicrotasks();
    expect(flakyEngine.getState()).toBe('suspended-awaiting-gesture');
    expect(created[0].resumeCalls).toBe(1);

    window.dispatchEvent(new Event('pointerdown')); // 2회 실패
    await flushMicrotasks();
    expect(flakyEngine.getState()).toBe('suspended-awaiting-gesture');
    expect(created[0].resumeCalls).toBe(2);

    window.dispatchEvent(new Event('keydown')); // 3회 실패 -> closed
    await flushMicrotasks();

    expect(created[0].resumeCalls).toBe(3);
    expect(flakyEngine.getState()).toBe('closed');
    expect(created).toHaveLength(1);

    // 다음 제스처(또는 재생) 시 새 AudioContext 재생성
    flakyEngine.playSfx('cast');
    expect(created).toHaveLength(2);
    flakyEngine.dispose();
  });

  it('ensureAndPlayBgm은 suspended 컨텍스트에서 attemptResume을 중복 호출하지 않고 실패 횟수를 1회씩만 올린다', async () => {
    const created: FakeAudioContext[] = [];
    const bgmEngine = new SoundEngine({
      createAudioContext: () => {
        const c = new FakeAudioContext();
        c.state = 'suspended';
        c.resumeBehavior = 'reject';
        created.push(c);
        return c as unknown as AudioContext;
      },
      fetchImpl: fetchSpy as unknown as typeof fetch,
      now: () => nowMs,
      isHidden: () => false,
      hasFocus: () => true,
      initialSettings: { bgmEnabled: false, sfxEnabled: false, bgmVolume: 0.5, sfxVolume: 0.5 },
    });

    bgmEngine.syncSettings({ bgmEnabled: true, sfxEnabled: false, bgmVolume: 0.5, sfxVolume: 0.5 });
    await flushMicrotasks();

    expect(created).toHaveLength(1);
    expect(created[0].resumeCalls).toBe(1);
    expect(bgmEngine.getState()).toBe('suspended-awaiting-gesture');

    window.dispatchEvent(new Event('pointerdown')); // 2회 실패
    await flushMicrotasks();
    expect(created[0].resumeCalls).toBe(2);
    expect(bgmEngine.getState()).toBe('suspended-awaiting-gesture');

    window.dispatchEvent(new Event('keydown')); // 3회 실패 -> closed
    await flushMicrotasks();
    expect(created[0].resumeCalls).toBe(3);
    expect(bgmEngine.getState()).toBe('closed');

    bgmEngine.dispose();
  });

  it('동일 효과음 짧은 연타는 쿨다운(80~150ms)으로 중복 클리핑을 막는다', () => {
    engine.syncSettings({ bgmEnabled: false, sfxEnabled: true, bgmVolume: 0.5, sfxVolume: 0.5 });

    expect(engine.playSfx('catchEpic')).toBe(true);
    nowMs += 50;
    expect(engine.playSfx('catchEpic')).toBe(false);
    nowMs += 100;
    expect(engine.playSfx('catchEpic')).toBe(true);
  });

  it('19종 효과음 키가 모두 오류 없이 합성된다', () => {
    engine.syncSettings({ bgmEnabled: false, sfxEnabled: true, bgmVolume: 0.5, sfxVolume: 0.5 });
    const keys: SfxKey[] = [
      'cast', 'bite', 'hitGood', 'hitPerfect', 'lineSnap', 'catchSplash',
      'catchEpic', 'catchLegend', 'catchMutation',
      'namedSpawn', 'namedHit', 'namedMiss', 'namedClear', 'namedEscape',
      'shopSell', 'gearUpgrade', 'rewardClaim', 'eventSettle', 'buttonClick',
    ];
    for (const key of keys) {
      expect(engine.playSfx(key, key === 'namedHit' ? 3 : undefined)).toBe(true);
    }
  });

  it('배경음 종료 2.5초 전에는 이중 버퍼 크로스페이드 다음 트랙을 시작한다', async () => {
    const rafQueue: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    engine.syncSettings({ bgmEnabled: true, sfxEnabled: false, bgmVolume: 0.5, sfxVolume: 0.5 });
    await flushMicrotasks();

    const ctx = contexts[0];
    expect(ctx.bufferSources).toHaveLength(1);

    // 트랙 시작 시각(10s) + 88s = 98s -> 남은 시간 2.0s (<= 2.5s) -> 크로스페이드 시작
    ctx.currentTime = 98;
    const step = rafQueue.shift();
    step?.(0);

    expect(ctx.bufferSources).toHaveLength(2);
    expect(ctx.bufferSources[1].startedOffset).toBe(0);

    vi.unstubAllGlobals();
  });

  it('창모드 포커스 이탈(blur) 시 즉시 bg-muted로 전환하고 BGM 재생 위치 저장·게인 0·SFX를 차단한다', async () => {
    engine.syncSettings({ bgmEnabled: true, sfxEnabled: true, bgmVolume: 0.5, sfxVolume: 0.5 });
    await flushMicrotasks();

    const ctx = contexts[0];
    expect(ctx.bufferSources).toHaveLength(1);
    expect(ctx.bufferSources[0].startedOffset).toBe(0);

    // 10s 시작 -> 22s 시점(재생 위치 12s)에 창 포커스 이탈
    ctx.currentTime = 22;
    expect(document.visibilityState).toBe('visible');
    window.dispatchEvent(new Event('blur'));

    expect(engine.getState()).toBe('bg-muted');
    expect(ctx.gains[0].gain.value).toBe(0);
    expect(ctx.gains[2].gain.value).toBe(0);
    expect(ctx.bufferSources[0].stopped).toBe(true);
    expect(engine.playSfx('cast')).toBe(false);

    // 여전히 포커스가 없는 상태에서 visibilitychange(visible)가 와도 BGM이 조기 재개되지 않는다
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    await flushMicrotasks();

    expect(engine.getState()).toBe('bg-muted');
    expect(ctx.bufferSources).toHaveLength(1);
    expect(ctx.gains[0].gain.value).toBe(0);
    expect(engine.playSfx('cast')).toBe(false);

    // 이후 창 focus 복귀 시 저장된 위치(12s)부터 BGM을 재개하고 SFX가 다시 동작한다
    ctx.currentTime = 30;
    window.dispatchEvent(new Event('focus'));
    await flushMicrotasks();

    expect(engine.getState()).toBe('running');
    expect(ctx.bufferSources).toHaveLength(2);
    expect(ctx.bufferSources[1].startedOffset).toBeCloseTo(12, 5);
    expect(ctx.gains[0].gain.value).toBeCloseTo(0.5 * BGM_GAIN_SCALE, 5);
    expect(engine.playSfx('cast')).toBe(true);
  });

  it('dispose() 호출 뒤에는 window blur 리스너가 정상 해제된다', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    engine.syncSettings({ bgmEnabled: true, sfxEnabled: true, bgmVolume: 0.5, sfxVolume: 0.5 });
    await flushMicrotasks();

    engine.dispose();

    expect(removeSpy).toHaveBeenCalledWith('blur', expect.any(Function));
    expect(engine.getState()).toBe('closed');
    window.dispatchEvent(new Event('blur'));
    expect(engine.getState()).toBe('closed');

    removeSpy.mockRestore();
  });

  it('초기 비포커스(hasFocus: false) 상태에서는 음소거로 시작하고 focus 복귀 시 재생을 재개한다', async () => {
    const blurredContexts: FakeAudioContext[] = [];
    const blurredEngine = new SoundEngine({
      createAudioContext: () => {
        const ctx = new FakeAudioContext();
        blurredContexts.push(ctx);
        return ctx as unknown as AudioContext;
      },
      fetchImpl: fetchSpy as unknown as typeof fetch,
      now: () => nowMs,
      isHidden: () => false,
      hasFocus: () => false,
      initialSettings: { bgmEnabled: false, sfxEnabled: false, bgmVolume: 0.5, sfxVolume: 0.5 },
    });

    blurredEngine.syncSettings({ bgmEnabled: true, sfxEnabled: true, bgmVolume: 0.5, sfxVolume: 0.5 });
    await flushMicrotasks();

    expect(blurredEngine.getState()).toBe('uninitialized');
    expect(blurredContexts).toHaveLength(0);
    expect(blurredEngine.playSfx('cast')).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('focus'));
    await flushMicrotasks();

    expect(blurredEngine.playSfx('cast')).toBe(true);
    expect(blurredEngine.getState()).toBe('running');
    expect(blurredContexts).toHaveLength(1);
    blurredEngine.dispose();
  });

  it('초기 포커스(hasFocus: true) 상태에서는 즉시 running으로 BGM과 SFX가 동작한다', async () => {
    const focusedContexts: FakeAudioContext[] = [];
    const focusedEngine = new SoundEngine({
      createAudioContext: () => {
        const ctx = new FakeAudioContext();
        focusedContexts.push(ctx);
        return ctx as unknown as AudioContext;
      },
      fetchImpl: fetchSpy as unknown as typeof fetch,
      now: () => nowMs,
      isHidden: () => false,
      hasFocus: () => true,
      initialSettings: { bgmEnabled: false, sfxEnabled: false, bgmVolume: 0.5, sfxVolume: 0.5 },
    });

    focusedEngine.syncSettings({ bgmEnabled: true, sfxEnabled: true, bgmVolume: 0.5, sfxVolume: 0.5 });
    await flushMicrotasks();

    expect(focusedEngine.getState()).toBe('running');
    expect(focusedContexts[0].bufferSources).toHaveLength(1);
    expect(focusedEngine.playSfx('cast')).toBe(true);
    focusedEngine.dispose();
  });
});
