import { getSoundSettings, subscribeSoundSettings } from '../adapters/sound';
import type { SoundSettings } from '../api/types';
import {
  BGM_GAIN_SCALE,
  buildSfxMasterChain,
  SFX_COOLDOWN_MS,
  SFX_GAIN_SCALE,
  synthesizeSfx,
} from './sfxSynth';
import type { SfxKey } from './sfxSynth';

export type { SfxKey } from './sfxSynth';

export const BGM_ASSET_PATH = '/audio/bgm-pixel-voyage.mp3';
export const BGM_CROSSFADE_SEC = 2.5;
export const BGM_RESUME_FADE_IN_SEC = 0.3;
const MAX_CONSECUTIVE_RESUME_FAILURES = 3;

export type SoundEngineState =
  | 'uninitialized'
  | 'running'
  | 'bg-muted'
  | 'suspended-awaiting-gesture'
  | 'closed';

interface BgmVoice {
  src: AudioBufferSourceNode;
  gain: GainNode;
  startCtxTime: number;
  startOffset: number;
  manualStop: boolean;
}

type AudioContextStateWithInterrupted = AudioContextState | 'interrupted';

export interface SoundEngineDeps {
  createAudioContext?: () => AudioContext | null;
  fetchImpl?: typeof fetch;
  now?: () => number;
  isHidden?: () => boolean;
  initialSettings?: SoundSettings;
}

function defaultCreateAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const win = window as Window & {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const Ctor = win.AudioContext ?? win.webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

function defaultIsHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/**
 * 단일 Web Audio 래퍼 — AudioContext 생명주기 상태 머신, 지연 BGM 로딩 및 이중 버퍼 크로스페이드,
 * 백그라운드 전면 음소거와 iOS Safari 제스처 복구를 조율한다.
 */
export class SoundEngine {
  private state: SoundEngineState = 'uninitialized';
  private settings: SoundSettings;
  private ctx: AudioContext | null = null;
  private bgmMaster: GainNode | null = null;
  private sfxMaster: GainNode | null = null;

  private bgmBuffer: AudioBuffer | null = null;
  private bgmFetchPromise: Promise<AudioBuffer | null> | null = null;
  private activeVoice: BgmVoice | null = null;
  private nextVoice: BgmVoice | null = null;
  private crossfading = false;
  private crossfadeEndCtxTime = 0;
  private pausedOffset = 0;
  private pausedByVisibility = false;
  private playGen = 0;
  private rafId: number | null = null;

  private activeSfxNodes = new Set<AudioScheduledSourceNode>();
  private lastSfxAt = new Map<SfxKey, number>();
  private consecutiveResumeFailures = 0;
  private gestureListening = false;
  private lifecycleAttached = false;
  private windowBlurred = false;
  private disposed = false;

  private readonly createAudioContext: () => AudioContext | null;
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly now: () => number;
  private readonly isHidden: () => boolean;

  constructor(deps: SoundEngineDeps = {}) {
    this.createAudioContext = deps.createAudioContext ?? defaultCreateAudioContext;
    this.fetchImpl = deps.fetchImpl ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined);
    this.now = deps.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.isHidden = deps.isHidden ?? defaultIsHidden;
    this.settings = deps.initialSettings ? { ...deps.initialSettings } : { ...getSoundSettings() };
    this.attachLifecycleListeners();
  }

  getState(): SoundEngineState {
    return this.state;
  }

  getSettings(): SoundSettings {
    return this.settings;
  }

  /** 저장된 기기 설정 변경을 엔진에 즉시 반영한다 */
  syncSettings(next: SoundSettings): void {
    if (this.disposed) return;
    const prev = this.settings;
    this.settings = { ...next };

    if (!next.sfxEnabled && prev.sfxEnabled) {
      this.silenceSfx();
    }
    if (!next.bgmEnabled && prev.bgmEnabled) {
      this.stopBgm(true);
    }

    this.syncChannelGains();

    if (next.bgmEnabled && !this.isBackgrounded()) {
      if (!this.activeVoice && !this.bgmFetchPromise) {
        void this.ensureAndPlayBgm(false);
      } else if (this.state === 'bg-muted') {
        this.handleForegroundReturn();
      }
    }
  }

  /** 효과음 재생 요청 — 꺼짐·백그라운드·쿨다운·미해제 컨텍스트 상태에서는 재생하지 않고 대기열도 남기지 않는다 */
  playSfx(key: SfxKey, arg?: number): boolean {
    if (this.disposed) return false;
    if (!this.settings.sfxEnabled || this.settings.sfxVolume <= 0) return false;
    if (this.isBackgrounded() || this.state === 'bg-muted') return false;

    const nowMs = this.now();
    const lastMs = this.lastSfxAt.get(key);
    if (lastMs !== undefined && nowMs - lastMs < SFX_COOLDOWN_MS[key]) {
      return false;
    }

    const ctx = this.ensureContext();
    if (!ctx || !this.sfxMaster) return false;

    if (ctx.state !== 'running') {
      this.handleInterruptedOrSuspended(ctx);
      return false;
    }

    this.lastSfxAt.set(key, nowMs);
    this.sfxMaster.gain.setValueAtTime(this.getSfxTargetGain(), ctx.currentTime);
    synthesizeSfx(
      {
        ctx,
        sfxMaster: this.sfxMaster,
        trackNode: node => this.trackSfxNode(node),
      },
      key,
      arg,
    );
    return true;
  }

  /** 수동 제스처 또는 테스트용으로 현재 상태를 정리하고 리스너를 해제한다 */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopBgm(true);
    this.silenceSfx();
    this.detachGestureListeners();
    this.detachLifecycleListeners();
    this.teardownContext('closed');
  }

  private isBackgrounded(): boolean {
    return this.isHidden() || this.windowBlurred;
  }

  private getBgmTargetGain(): number {
    if (this.isBackgrounded() || this.state === 'bg-muted' || !this.settings.bgmEnabled) return 0;
    return this.settings.bgmVolume * BGM_GAIN_SCALE;
  }

  private getSfxTargetGain(): number {
    if (this.isBackgrounded() || this.state === 'bg-muted' || !this.settings.sfxEnabled) return 0;
    return this.settings.sfxVolume * SFX_GAIN_SCALE;
  }

  private syncChannelGains(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.bgmMaster) {
      this.bgmMaster.gain.cancelScheduledValues(t);
      this.bgmMaster.gain.setValueAtTime(this.getBgmTargetGain(), t);
    }
    if (this.sfxMaster) {
      this.sfxMaster.gain.cancelScheduledValues(t);
      this.sfxMaster.gain.setValueAtTime(this.getSfxTargetGain(), t);
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.disposed) return null;
    if (this.ctx && (this.ctx.state as AudioContextStateWithInterrupted) !== 'closed') {
      return this.ctx;
    }

    const ctx = this.createAudioContext();
    if (!ctx) return null;

    this.ctx = ctx;
    this.consecutiveResumeFailures = 0;

    this.bgmMaster = ctx.createGain();
    this.bgmMaster.gain.setValueAtTime(this.getBgmTargetGain(), ctx.currentTime);
    this.bgmMaster.connect(ctx.destination);

    this.sfxMaster = buildSfxMasterChain(ctx, this.getSfxTargetGain());
    ctx.onstatechange = () => this.onContextStateChange(ctx);

    const ctxState = ctx.state as AudioContextStateWithInterrupted;
    if (ctxState === 'closed') {
      this.teardownContext('closed');
      return null;
    }

    if (ctxState === 'running') {
      this.state = this.isBackgrounded() ? 'bg-muted' : 'running';
    } else if (this.isBackgrounded()) {
      this.state = 'bg-muted';
    } else {
      this.state = 'suspended-awaiting-gesture';
      this.attachGestureListeners();
    }
    return this.ctx;
  }

  private onContextStateChange(ctx: AudioContext): void {
    if (this.ctx !== ctx || this.disposed) return;
    const nextState = ctx.state as AudioContextStateWithInterrupted;
    if (nextState === 'closed') {
      this.teardownContext('closed');
      if (this.settings.bgmEnabled && !this.isBackgrounded()) {
        this.attachGestureListeners();
      }
      return;
    }
    if (this.isBackgrounded() || this.state === 'bg-muted') return;

    if (nextState === 'running') {
      this.consecutiveResumeFailures = 0;
      this.state = 'running';
      this.detachGestureListeners();
      if (this.settings.bgmEnabled && !this.activeVoice) {
        void this.ensureAndPlayBgm(this.pausedByVisibility);
      }
      return;
    }

    if (nextState === 'suspended' || nextState === 'interrupted') {
      this.state = 'suspended-awaiting-gesture';
      this.attachGestureListeners();
    }
  }

  private handleInterruptedOrSuspended(ctx: AudioContext): void {
    if (this.isBackgrounded()) {
      this.state = 'bg-muted';
      return;
    }
    this.state = 'suspended-awaiting-gesture';
    this.attachGestureListeners();
    void this.attemptResume(ctx);
  }

  private attemptResume(ctx: AudioContext): Promise<boolean> {
    if (this.ctx !== ctx || this.disposed) return Promise.resolve(false);
    if ((ctx.state as AudioContextStateWithInterrupted) === 'closed') {
      this.teardownContext('closed');
      return Promise.resolve(false);
    }
    if (ctx.state === 'running') {
      this.consecutiveResumeFailures = 0;
      if (!this.isBackgrounded()) {
        this.state = 'running';
        this.detachGestureListeners();
      }
      return Promise.resolve(true);
    }

    try {
      return Promise.resolve(ctx.resume()).then(
        () => {
          if (this.ctx !== ctx || this.disposed) return false;
          if (ctx.state === 'running') {
            this.consecutiveResumeFailures = 0;
            if (!this.isBackgrounded()) {
              this.state = 'running';
              this.detachGestureListeners();
              return true;
            }
            return false;
          }
          if (!this.isBackgrounded()) {
            this.state = 'suspended-awaiting-gesture';
            this.attachGestureListeners();
          }
          return false;
        },
        () => {
          if (this.ctx !== ctx || this.disposed) return false;
          this.consecutiveResumeFailures += 1;
          if (this.consecutiveResumeFailures >= MAX_CONSECUTIVE_RESUME_FAILURES) {
            this.teardownContext('closed');
            if (this.settings.bgmEnabled && !this.isBackgrounded()) {
              this.attachGestureListeners();
            }
          } else if (!this.isBackgrounded()) {
            this.state = 'suspended-awaiting-gesture';
            this.attachGestureListeners();
          }
          return false;
        },
      );
    } catch {
      this.consecutiveResumeFailures += 1;
      if (this.consecutiveResumeFailures >= MAX_CONSECUTIVE_RESUME_FAILURES) {
        this.teardownContext('closed');
      } else if (!this.isBackgrounded()) {
        this.state = 'suspended-awaiting-gesture';
        this.attachGestureListeners();
      }
      return Promise.resolve(false);
    }
  }

  private teardownContext(targetState: 'uninitialized' | 'closed'): void {
    this.stopVoices();
    this.silenceSfx();
    this.cancelTick();
    const oldCtx = this.ctx;
    this.ctx = null;
    this.bgmMaster = null;
    this.sfxMaster = null;
    this.state = targetState;
    if (oldCtx) {
      oldCtx.onstatechange = null;
      if ((oldCtx.state as AudioContextStateWithInterrupted) !== 'closed') {
        try {
          void Promise.resolve(oldCtx.close()).catch(() => {});
        } catch {
          /* 이미 닫혔거나 닫기를 지원하지 않는 환경 */
        }
      }
    }
  }

  private async ensureBgmBuffer(ctx: AudioContext): Promise<AudioBuffer | null> {
    if (this.bgmBuffer) return this.bgmBuffer;
    if (this.bgmFetchPromise) return this.bgmFetchPromise;
    if (!this.fetchImpl) return null;

    const promise = (async () => {
      try {
        const res = await this.fetchImpl!(BGM_ASSET_PATH);
        if (!res.ok) return null;
        const arr = await res.arrayBuffer();
        const decoded = await new Promise<AudioBuffer>((resolve, reject) => {
          const maybe = ctx.decodeAudioData(arr, resolve, reject);
          if (maybe && typeof (maybe as Promise<AudioBuffer>).then === 'function') {
            (maybe as Promise<AudioBuffer>).then(resolve, reject);
          }
        });
        this.bgmBuffer = decoded;
        return decoded;
      } catch {
        return null;
      } finally {
        this.bgmFetchPromise = null;
      }
    })();

    this.bgmFetchPromise = promise;
    return promise;
  }

  private async ensureAndPlayBgm(fadeIn: boolean): Promise<void> {
    if (this.disposed || !this.settings.bgmEnabled || this.isBackgrounded()) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const gen = ++this.playGen;
    const buffer = await this.ensureBgmBuffer(ctx);
    if (!buffer || this.disposed || this.playGen !== gen || !this.settings.bgmEnabled) return;
    if (this.isBackgrounded() || this.state === 'bg-muted') {
      this.pausedByVisibility = true;
      return;
    }

    if (ctx.state !== 'running') {
      const resumed = await this.attemptResume(ctx);
      if (!resumed || this.disposed || this.playGen !== gen || !this.settings.bgmEnabled || this.isBackgrounded()) {
        return;
      }
    }

    this.startBgmVoiceAt(buffer, this.pausedOffset, fadeIn);
  }

  private startBgmVoiceAt(buffer: AudioBuffer, offset: number, fadeIn: boolean): void {
    if (!this.ctx || !this.bgmMaster) return;
    this.stopVoices();
    const now = this.ctx.currentTime;
    const targetGain = this.getBgmTargetGain();
    this.bgmMaster.gain.cancelScheduledValues(now);
    if (fadeIn && targetGain > 0) {
      this.bgmMaster.gain.setValueAtTime(0, now);
      this.bgmMaster.gain.linearRampToValueAtTime(targetGain, now + BGM_RESUME_FADE_IN_SEC);
    } else {
      this.bgmMaster.gain.setValueAtTime(targetGain, now);
    }

    this.activeVoice = this.spawnVoice(buffer, offset, 1);
    this.pausedOffset = offset;
    this.pausedByVisibility = false;
    this.scheduleTick();
  }

  private spawnVoice(buffer: AudioBuffer, offset: number, initialGain: number): BgmVoice {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = false;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(initialGain, now);
    src.connect(gain);
    gain.connect(this.bgmMaster!);

    const dur = Math.max(0.1, buffer.duration);
    const safeOffset = Math.max(0, Math.min(offset, Math.max(0, dur - 0.05)));
    const voice: BgmVoice = {
      src,
      gain,
      startCtxTime: now,
      startOffset: safeOffset,
      manualStop: false,
    };

    src.onended = () => {
      if (voice.manualStop || this.disposed) return;
      if (
        this.activeVoice === voice
        && this.settings.bgmEnabled
        && !this.isBackgrounded()
        && this.state === 'running'
      ) {
        if (this.nextVoice) {
          this.promoteNextVoice();
        } else if (this.bgmBuffer) {
          this.startBgmVoiceAt(this.bgmBuffer, 0, false);
        }
      }
    };

    src.start(now, safeOffset);
    return voice;
  }

  private getCurrentPosition(): number {
    if (!this.activeVoice || !this.ctx || !this.bgmBuffer) return this.pausedOffset;
    const dur = this.bgmBuffer.duration || 90;
    const elapsed = Math.max(0, this.ctx.currentTime - this.activeVoice.startCtxTime);
    return Math.min(dur, this.activeVoice.startOffset + elapsed);
  }

  private beginCrossfade(): void {
    if (
      this.crossfading
      || !this.activeVoice
      || !this.bgmBuffer
      || !this.ctx
      || !this.settings.bgmEnabled
      || this.isBackgrounded()
      || this.state !== 'running'
    ) {
      return;
    }
    const now = this.ctx.currentTime;
    const dur = this.bgmBuffer.duration;
    const pos = this.getCurrentPosition();
    const remain = Math.max(0.15, dur - pos);
    const fadeDur = Math.min(BGM_CROSSFADE_SEC, remain);

    this.crossfading = true;
    this.crossfadeEndCtxTime = now + fadeDur;

    const outGain = this.activeVoice.gain.gain;
    outGain.cancelScheduledValues(now);
    outGain.setValueAtTime(1, now);
    outGain.linearRampToValueAtTime(0, now + fadeDur);

    const nextV = this.spawnVoice(this.bgmBuffer, 0, 0);
    const inGain = nextV.gain.gain;
    inGain.cancelScheduledValues(now);
    inGain.setValueAtTime(0, now);
    inGain.linearRampToValueAtTime(1, now + fadeDur);
    this.nextVoice = nextV;
  }

  private promoteNextVoice(): void {
    if (!this.nextVoice) {
      this.crossfading = false;
      return;
    }
    this.disposeVoice(this.activeVoice);
    this.activeVoice = this.nextVoice;
    this.nextVoice = null;
    this.crossfading = false;
    this.crossfadeEndCtxTime = 0;
  }

  private disposeVoice(v: BgmVoice | null): void {
    if (!v) return;
    v.manualStop = true;
    try { v.src.stop(); } catch { /* noop */ }
    try { v.src.disconnect(); } catch { /* noop */ }
    try { v.gain.disconnect(); } catch { /* noop */ }
  }

  private stopVoices(): void {
    this.disposeVoice(this.activeVoice);
    this.disposeVoice(this.nextVoice);
    this.activeVoice = null;
    this.nextVoice = null;
    this.crossfading = false;
    this.crossfadeEndCtxTime = 0;
  }

  private stopBgm(resetOffset: boolean): void {
    this.playGen += 1;
    this.stopVoices();
    this.cancelTick();
    if (resetOffset) {
      this.pausedOffset = 0;
      this.pausedByVisibility = false;
    }
  }

  private scheduleTick(): void {
    if (this.rafId !== null || typeof requestAnimationFrame !== 'function') return;
    const step = () => {
      this.rafId = null;
      if (this.disposed || !this.activeVoice || !this.ctx || !this.bgmBuffer || this.state !== 'running') {
        return;
      }
      if (this.crossfading && this.ctx.currentTime >= this.crossfadeEndCtxTime) {
        this.promoteNextVoice();
      } else if (!this.crossfading && this.bgmBuffer.duration > 0) {
        const remain = this.bgmBuffer.duration - this.getCurrentPosition();
        const crossfadeThreshold = Math.min(BGM_CROSSFADE_SEC, Math.max(0.15, this.bgmBuffer.duration * 0.25));
        if (remain <= crossfadeThreshold && remain > 0.05) {
          this.beginCrossfade();
        }
      }
      this.scheduleTick();
    };
    this.rafId = requestAnimationFrame(step);
  }

  private cancelTick(): void {
    if (this.rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private trackSfxNode(node: AudioScheduledSourceNode): void {
    this.activeSfxNodes.add(node);
    const prevEnded = node.onended;
    node.onended = (ev: Event) => {
      this.activeSfxNodes.delete(node);
      if (typeof prevEnded === 'function') {
        prevEnded.call(node, ev);
      }
    };
  }

  /** 진행 중이거나 예약된 모든 효과음·쿨다운을 즉시 폐기한다 */
  private silenceSfx(): void {
    for (const node of this.activeSfxNodes) {
      try { node.stop(); } catch { /* noop */ }
      try { node.disconnect(); } catch { /* noop */ }
    }
    this.activeSfxNodes.clear();
    this.lastSfxAt.clear();
    if (this.sfxMaster && this.ctx) {
      const t = this.ctx.currentTime;
      this.sfxMaster.gain.cancelScheduledValues(t);
      this.sfxMaster.gain.setValueAtTime(0, t);
    }
  }

  private handleBackgroundMute(): void {
    if (this.disposed) return;
    if (this.state === 'uninitialized' || this.state === 'closed') {
      this.lastSfxAt.clear();
      return;
    }

    if (this.activeVoice) {
      this.pausedOffset = this.getCurrentPosition();
      this.pausedByVisibility = true;
    }
    this.state = 'bg-muted';
    this.stopBgm(false);
    this.silenceSfx();
    if (this.bgmMaster && this.ctx) {
      const t = this.ctx.currentTime;
      this.bgmMaster.gain.cancelScheduledValues(t);
      this.bgmMaster.gain.setValueAtTime(0, t);
    }
  }

  private handleForegroundReturn(): void {
    if (this.disposed || this.isBackgrounded()) return;

    if (this.state === 'closed') {
      if (this.settings.bgmEnabled) {
        this.attachGestureListeners();
      }
      return;
    }

    if (this.state !== 'bg-muted') return;

    const ctx = this.ctx;
    if (!ctx) {
      this.state = 'uninitialized';
      return;
    }

    if ((ctx.state as AudioContextStateWithInterrupted) === 'closed') {
      this.teardownContext('closed');
      if (this.settings.bgmEnabled) {
        this.attachGestureListeners();
      }
      return;
    }

    const prevPausedByVis = this.pausedByVisibility;
    this.state = ctx.state === 'running' ? 'running' : 'suspended-awaiting-gesture';
    this.syncChannelGains();

    void this.attemptResume(ctx).then(resumed => {
      if (!resumed || this.disposed || this.isBackgrounded()) return;
      if (this.settings.bgmEnabled) {
        if (this.bgmBuffer) {
          this.startBgmVoiceAt(this.bgmBuffer, this.pausedOffset, prevPausedByVis);
        } else {
          void this.ensureAndPlayBgm(prevPausedByVis);
        }
      }
    });
  }

  private readonly onVisibilityChange = (): void => {
    if (this.isHidden()) {
      this.handleBackgroundMute();
    } else {
      this.handleForegroundReturn();
    }
  };

  private readonly onPageHide = (): void => {
    this.handleBackgroundMute();
  };

  private readonly onPageShow = (): void => {
    if (!this.isBackgrounded()) {
      this.handleForegroundReturn();
    }
  };

  private readonly onWindowBlur = (): void => {
    this.windowBlurred = true;
    this.handleBackgroundMute();
  };

  private readonly onWindowFocus = (): void => {
    this.windowBlurred = false;
    if (!this.isBackgrounded()) {
      this.handleForegroundReturn();
    }
  };

  private readonly onUserGesture = (): void => {
    if (this.disposed || this.isHidden()) return;
    this.windowBlurred = false;
    if (this.state === 'bg-muted') {
      this.handleForegroundReturn();
      return;
    }
    if (this.state === 'closed' || !this.ctx) {
      this.detachGestureListeners();
      if (this.settings.bgmEnabled) {
        void this.ensureAndPlayBgm(this.pausedByVisibility);
      }
      return;
    }
    if (this.state === 'suspended-awaiting-gesture') {
      const ctx = this.ctx;
      const prevPaused = this.pausedByVisibility;
      void this.attemptResume(ctx).then(resumed => {
        if (!resumed || this.disposed || this.isBackgrounded()) return;
        if (this.settings.bgmEnabled && !this.activeVoice) {
          if (this.bgmBuffer) {
            this.startBgmVoiceAt(this.bgmBuffer, this.pausedOffset, prevPaused);
          } else {
            void this.ensureAndPlayBgm(prevPaused);
          }
        }
      });
    }
  };

  private attachLifecycleListeners(): void {
    if (this.lifecycleAttached) return;
    this.lifecycleAttached = true;
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', this.onPageHide);
      window.addEventListener('pageshow', this.onPageShow);
      window.addEventListener('focus', this.onWindowFocus);
      window.addEventListener('blur', this.onWindowBlur);
    }
  }

  private detachLifecycleListeners(): void {
    if (!this.lifecycleAttached) return;
    this.lifecycleAttached = false;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.onPageHide);
      window.removeEventListener('pageshow', this.onPageShow);
      window.removeEventListener('focus', this.onWindowFocus);
      window.removeEventListener('blur', this.onWindowBlur);
    }
  }

  private attachGestureListeners(): void {
    if (this.gestureListening || this.disposed) return;
    this.gestureListening = true;
    if (typeof window !== 'undefined') {
      window.addEventListener('pointerdown', this.onUserGesture, { capture: true, passive: true });
      window.addEventListener('keydown', this.onUserGesture, { capture: true, passive: true });
    }
  }

  private detachGestureListeners(): void {
    if (!this.gestureListening) return;
    this.gestureListening = false;
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', this.onUserGesture, { capture: true });
      window.removeEventListener('keydown', this.onUserGesture, { capture: true });
    }
  }
}

export const soundEngine = new SoundEngine();

let syncUnsubscribe: (() => void) | null = null;

/** 기기 설정 저장소 변경을 단일 오디오 엔진에 구독해 동기화한다 */
export function ensureSoundEngineSync(): void {
  if (syncUnsubscribe) return;
  soundEngine.syncSettings(getSoundSettings());
  syncUnsubscribe = subscribeSoundSettings(() => {
    soundEngine.syncSettings(getSoundSettings());
  });
}

/** 테스트 격리용 — 구독을 끊고 엔진을 재생성 없이 초기 상태로 되돌리거나 재동기화한다 */
export function resetSoundEngineSync(): void {
  if (syncUnsubscribe) {
    syncUnsubscribe();
    syncUnsubscribe = null;
  }
  soundEngine.syncSettings(getSoundSettings());
}
