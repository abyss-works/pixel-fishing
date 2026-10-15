import { FISH, canFishSpot, judgeTiming } from '../rules/logic';
import type { CatchInfo, GameState, Judgment } from '../rules/logic';
import type { SpotId } from '../content/spots';
import { zoneOfSpot, topZoneOf } from '../content/zones';
import type { ZoneId } from '../content/zones';
import type { ActionResult, GameAction } from '../rules/actions';
import type { RejectReason } from '../rules/rules';
import { nextPhase, phaseDurationMs } from '../rules/fishing';
import type { FishingPhase } from '../rules/fishing';
import { moveSpeed, rodAxes, powerZones, effectiveBite, POWER_RULES } from '../rules/stats';
import { CAST_RANGE } from '../rules/balance';
import { when } from '../../shared/lib/when';
import { setCurrentSpot, setPlayerPos, setZone } from '../world/currentSpot.js';
import {
  REGION_PACKS, ZoneTracker, entryPoint, inTrigger, movePlayer,
  nearestSchoolInRange, zoneOf,
} from '../world';
import type { Point, RegionId, SceneRef, School } from '../world';
import type { RegionPack } from '../world/types';
import { renderRegion } from '../rendering/canvas/scenes/region.js';
import { DEFAULT_FISH_ART_STYLE } from '../rendering/pixel/fishArt/index.js';
import type { FishArtStyle } from '../rendering/pixel/fishArt/index.js';
import type { MaybePromise } from '../../shared/lib/when';

type CatchAction = Extract<GameAction, { type: 'catch' }>;
type CatchResult = Extract<ActionResult, { type: 'catch' }>;

export type FieldDispatchResult =
  | { status: 'ok'; result: ActionResult }
  | { status: 'rejected'; error: RejectReason };

export interface FieldSnapshot {
  phase: FishingPhase;
  fishId: string | null;
  catchInfo: CatchInfo | null;
}

export type FieldEvent =
  | { type: 'cast'; spot: SpotId }
  | { type: 'cast-denied'; reason: 'range' }
  | { type: 'cast-denied'; reason: 'boat'; spot: SpotId }
  | { type: 'line-cut' }
  | { type: 'movement-cancelled' }
  | { type: 'catch-rejected'; reason: RejectReason }
  | { type: 'catch'; judgment: Judgment; result: CatchResult }
  | { type: 'zone-blocked'; message: string }
  | { type: 'zone-entered'; zone: ZoneId }
  | { type: 'trigger-blocked'; message: string };

export interface FieldCallbacks {
  dispatch: (action: CatchAction) => MaybePromise<FieldDispatchResult>;
  onEvent: (event: FieldEvent) => void;
  onScene: (scene: SceneRef, message: string, entryPos?: Point) => void;
  onShop?: () => void;
  onWarmup?: () => void;
}

const MOVE_KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
};

export class GameFieldEngine {
  private readonly def: RegionPack;
  private game: GameState;
  private night = false;
  private callbacks: FieldCallbacks = {
    dispatch: () => ({ status: 'rejected', error: 'bad-request' }),
    onEvent: () => {},
    onScene: () => {},
  };
  private snapshot: FieldSnapshot = { phase: 'idle', fishId: null, catchInfo: null };
  private fishArt: FishArtStyle = DEFAULT_FISH_ART_STYLE;
  private readonly listeners = new Set<() => void>();
  private readonly pos: Point;
  private lastSpot: SpotId | null = null;
  private readonly tracker = new ZoneTracker();
  private readonly keys = new Set<string>();
  private biteStart = 0;
  /** catch 전이 시각 — 훅 점프 연출의 기준 */
  private catchStart = 0;
  /** 도감에 있는 어종 id — 어군 스프라이트의 색/실루엣 판정. game이 바뀔 때만 다시 만든다 */
  private phaseTimer: ReturnType<typeof setTimeout> | null = null;
  private lineCutTimer: ReturnType<typeof setTimeout> | null = null;
  private frameId: number | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private school: School | null = null;

  constructor(region: RegionId, game: GameState, initialPos?: Point) {
    this.def = REGION_PACKS[region];
    this.game = game;
    this.pos = { ...(initialPos ?? this.def.spawn) };
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  readonly getSnapshot = (): FieldSnapshot => this.snapshot;

  updateContext(game: GameState, night: boolean, callbacks: FieldCallbacks): void {
    this.game = game;
    this.night = night;
    this.callbacks = callbacks;
  }

  /** 물고기 그래픽 스타일 — 필드의 물고기 연출(훅 점프)이 이 어댑터로 그린다 */
  setFishArt(style: FishArtStyle): void {
    this.fishArt = style;
  }

  attachCanvas(canvas: HTMLCanvasElement | null): void {
    this.stopFrame();
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof requestAnimationFrame === 'undefined') return;

    this.ctx = ctx;
    this.initializePositionState();
    let last = performance.now();
    const frame = (now: number) => {
      this.frameId = null;
      if (this.ctx !== ctx) return;
      const shouldContinue = this.updateFrame(ctx, now, last);
      last = now;
      if (shouldContinue && this.ctx === ctx) this.frameId = requestAnimationFrame(frame);
    };
    this.frameId = requestAnimationFrame(frame);
  }

  handleKeyDown(code: string, preventDefault: () => void): boolean {
    if (code === 'Space') {
      preventDefault();
      this.action();
      return true;
    }
    if (!MOVE_KEYS[code]) return false;

    preventDefault();
    if (this.snapshot.phase !== 'idle') {
      this.cancelFishing();
      this.callbacks.onEvent({ type: 'movement-cancelled' });
    }
    this.keys.add(code);
    return true;
  }

  releaseKey(code: string): void {
    this.keys.delete(code);
  }

  cancelFishing(): void {
    this.school = null;
    this.transition('idle', null, null);
  }

  action(): void {
    if (this.snapshot.phase === 'bite') {
      const school = this.school;
      if (!school) return;
      const elapsed = (Date.now() - this.biteStart) / 1000 / rodAxes(this.game).sweep.value;
      const zones = powerZones(this.game, school.spot);
      if (zones.yellow === 0) this.callbacks.onEvent({ type: 'line-cut' });
      this.hookFish(judgeTiming(elapsed, zones.yellow / 100, zones.red / 100));
      return;
    }
    if (this.snapshot.phase === 'idle') this.tryCast(false);
  }

  dispose(): void {
    this.stopFrame();
    this.clearPhaseTimers();
    this.keys.clear();
    this.listeners.clear();
  }

  private initializePositionState(): void {
    const zone = zoneOf(this.def, this.pos.x, this.pos.y) ?? null;
    this.tracker.init(zone);
    const nearby = nearestSchoolInRange(this.def.schools, this.pos.x, this.pos.y, CAST_RANGE);
    this.lastSpot = nearby?.spot ?? null;
    setCurrentSpot(this.lastSpot);
    setZone(this.lastSpot ? zoneOfSpot(this.lastSpot) ?? null : (zone ? topZoneOf(zone) : null));
    setPlayerPos({ x: this.pos.x, y: this.pos.y });
  }

  private updateFrame(ctx: CanvasRenderingContext2D, now: number, last: number): boolean {
    const dt = Math.min((now - last) / 1000, 0.05);
    let dx = 0, dy = 0;
    for (const key of this.keys) {
      const direction = MOVE_KEYS[key];
      if (direction) { dx += direction[0]; dy += direction[1]; }
    }

    let movedFrom: Point | null = null;
    if ((dx || dy) && this.snapshot.phase === 'idle') {
      const speed = moveSpeed(this.game, this.def.movement, this.night).value;
      movedFrom = { ...this.pos };
      const next = movePlayer(this.def, this.pos, Math.sign(dx), Math.sign(dy), dt, speed);
      this.pos.x = next.x;
      this.pos.y = next.y;
      const nearby = nearestSchoolInRange(this.def.schools, this.pos.x, this.pos.y, CAST_RANGE);
      const spot = nearby?.spot ?? null;
      if (spot !== this.lastSpot) {
        this.lastSpot = spot;
        setCurrentSpot(spot);
      }
      setPlayerPos({ x: this.pos.x, y: this.pos.y });
    }

    const zone = zoneOf(this.def, this.pos.x, this.pos.y) ?? null;
    const step = this.tracker.step(zone, now, this.game.boat);
    if (step.revert) {
      if (movedFrom) {
        this.pos.x = movedFrom.x;
        this.pos.y = movedFrom.y;
        setPlayerPos({ x: this.pos.x, y: this.pos.y });
      }
      if (step.blocked) this.callbacks.onEvent({ type: 'zone-blocked', message: step.blocked });
    } else if (step.enteredTop) {
      this.callbacks.onEvent({ type: 'zone-entered', zone: step.enteredTop });
    }

    const focusZone = this.lastSpot ? zoneOfSpot(this.lastSpot) : null;
    setZone(focusZone ?? (zone ? topZoneOf(zone) : null));

    for (const trigger of this.def.triggers) {
      if (!inTrigger(this.pos, trigger.rect)) continue;
      if (trigger.action === 'base') {
        this.callbacks.onScene({ kind: 'base', id: trigger.base ?? this.def.base }, trigger.msg);
        return false;
      }
      if (trigger.action === 'travel') {
        if (this.game.boat >= trigger.requiredBoat) {
          const entry = entryPoint(REGION_PACKS[trigger.to], trigger, this.pos);
          this.callbacks.onScene({ kind: 'region', id: trigger.to }, trigger.msg, entry);
          return false;
        }
        if (movedFrom) {
          this.pos.x = movedFrom.x;
          this.pos.y = movedFrom.y;
        }
        this.callbacks.onEvent({ type: 'trigger-blocked', message: trigger.blockedMsg });
      } else if (trigger.action === 'shop') {
        if (movedFrom) {
          this.pos.x = movedFrom.x;
          this.pos.y = movedFrom.y;
        }
        this.callbacks.onShop?.();
      }
    }

    const axes = rodAxes(this.game);
    const zones = this.school ? powerZones(this.game, this.school.spot) : null;
    renderRegion(ctx, this.def, {
      player: this.pos,
      phase: this.snapshot.phase,
      school: this.school,
      boat: this.game.boat,
      biteT: this.snapshot.phase === 'bite'
        ? (Date.now() - this.biteStart) / 1000 / axes.sweep.value : null,
      zone: zones ? zones.yellow / 100 : 0,
      red: zones ? zones.red / 100 : 0,
      t: now / 1000,
      catchT: this.snapshot.phase === 'catch' ? (Date.now() - this.catchStart) / 1000 : null,
      catchFish: this.snapshot.fishId
        ? { id: this.snapshot.fishId, form: this.snapshot.catchInfo?.form ?? 'normal' } : null,
      fishArt: this.fishArt,
    });
    return true;
  }

  private tryCast(silent: boolean): void {
    const nearby = nearestSchoolInRange(this.def.schools, this.pos.x, this.pos.y, CAST_RANGE);
    if (!nearby) {
      if (!silent) this.callbacks.onEvent({ type: 'cast-denied', reason: 'range' });
      return;
    }
    if (!canFishSpot(this.game, nearby.spot)) {
      if (!silent) this.callbacks.onEvent({ type: 'cast-denied', reason: 'boat', spot: nearby.spot });
      return;
    }

    this.school = nearby;
    this.transition('wait', null, null);
    this.callbacks.onWarmup?.();
    if (!silent) this.callbacks.onEvent({ type: 'cast', spot: nearby.spot });
  }

  private hookFish(judgment: Judgment): void {
    const school = this.school;
    if (!school || this.snapshot.phase !== 'bite') return;
    this.transition('catch');
    when(this.callbacks.dispatch({ type: 'catch', spot: school.spot, judgment }), result => {
      if (result.status === 'rejected') {
        this.cancelFishing();
        this.callbacks.onEvent({ type: 'catch-rejected', reason: result.error });
        return;
      }
      if (result.result.type !== 'catch') return;
      this.transition('catch', result.result.fishId, result.result.info);
      this.callbacks.onEvent({ type: 'catch', judgment, result: result.result });
    });
  }

  private transition(
    phase: FishingPhase,
    fishId: string | null = this.snapshot.fishId,
    catchInfo: CatchInfo | null = this.snapshot.catchInfo,
  ): void {
    if (phase === 'catch') this.catchStart = Date.now();
    this.snapshot = { phase, fishId, catchInfo };
    this.publish();
    this.schedulePhaseTimers();
  }

  private publish(): void {
    for (const listener of this.listeners) listener();
  }

  private schedulePhaseTimers(): void {
    this.clearPhaseTimers();
    const phase = this.snapshot.phase;
    if (phase === 'idle' || (phase === 'catch' && !this.snapshot.fishId)) return;
    if (phase === 'bite') this.biteStart = Date.now();

    const school = this.school;
    let ms: number;
    if (phase === 'wait' && school) {
      const bite = effectiveBite(this.game, school.spot);
      const random = Math.random();
      ms = (bite.min.value + random * (bite.max.value - bite.min.value)) * 1000;
    } else {
      const fish = this.snapshot.fishId
        ? FISH.find(candidate => candidate.id === this.snapshot.fishId)
        : undefined;
      ms = phaseDurationMs(phase, this.game.rod, undefined, fish?.rarity);
    }

    this.phaseTimer = setTimeout(() => {
      this.phaseTimer = null;
      if (phase === 'bite') { this.hookFish('auto'); return; }
      if (phase === 'catch') {
        this.transition(nextPhase(phase), null, null);
        return;
      }
      this.transition(nextPhase(phase));
    }, ms);

    if (phase === 'wait' && school && powerZones(this.game, school.spot).mult > 1) {
      this.lineCutTimer = setTimeout(() => {
        this.lineCutTimer = null;
        this.callbacks.onEvent({ type: 'line-cut' });
      }, POWER_RULES.lineCutMs);
    }
  }

  private clearPhaseTimers(): void {
    if (this.phaseTimer !== null) clearTimeout(this.phaseTimer);
    if (this.lineCutTimer !== null) clearTimeout(this.lineCutTimer);
    this.phaseTimer = null;
    this.lineCutTimer = null;
  }

  private stopFrame(): void {
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.frameId = null;
    this.ctx = null;
  }
}
