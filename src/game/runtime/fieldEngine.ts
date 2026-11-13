import { FISH, canFishSpot, judgeTiming } from '../rules/logic';
import type { CatchInfo, GameState, Judgment } from '../rules/logic';
import type { SpotId } from '../content/spots';
import { zoneOfSpot, topZoneOf } from '../content/zones';
import type { ZoneId } from '../content/zones';
import type { ActionResult, GameAction } from '../rules/actions';
import type { RejectReason } from '../rules/rules';
import { nextPhase, phaseDurationMs, resultAtOf } from '../rules/fishing';
import type { FishingPhase } from '../rules/fishing';
import { moveSpeed, rodAxes, powerZones, effectiveBite, POWER_RULES } from '../rules/stats';
import { NO_COOK_EFFECTS, slotEffects } from '../rules/cooking';
import { CAST_RANGE } from '../rules/balance';
import { guestActionVerdict } from '../rules/guest';
import { BlockNotice } from './blockNotice';
import { when } from '../../shared/lib/when';
import { setCurrentSpot, setPlayerPos, setZone } from '../world/currentSpot.js';
import {
  REGION_PACKS, ZoneTracker, entryPoint, inTrigger, movePlayer,
  nearestSchoolInRange, zoneOf, closedSeaBlock,
} from '../world';
import type { Point, RegionId, SceneRef, School } from '../world';
import type { RegionPack } from '../world/types';
import { FIELD_VIEW } from '../world/fieldView.js';
import type { ViewSize } from '../world/fieldView.js';
import { renderRegion } from '../rendering/canvas/scenes/region.js';
import type { OtherShipView, Speech } from '../rendering/pixel/sprites/actors.js';
import { DEFAULT_FISH_ART_STYLE } from '../rendering/pixel/fishArt/index.js';
import type { FishArtStyle } from '../rendering/pixel/fishArt/index.js';
import type { MaybePromise } from '../../shared/lib/when';

type CatchAction = Extract<GameAction, { type: 'catch' }>;
type CatchResult = Extract<ActionResult, { type: 'catch' }>;

export type FieldDispatchResult =
  | { status: 'ok'; result: ActionResult }
  | { status: 'rejected'; error: RejectReason };

/** 실시간 채널이 프레임마다 넘기는 것 — 같은 바다의 다른 플레이어와 내 머리 위 말풍선 */
export interface LiveFrame { others: OtherShipView[]; bubble: Speech; idle: string | null }

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
  | { type: 'trigger-blocked'; message: string }
  /** 게스트가 마을 밖으로 나가는 트리거에 닿아 장소를 바꾸지 못하고 되밀렸다 */
  | { type: 'guest-blocked' };

export interface FieldCallbacks {
  dispatch: (action: CatchAction) => MaybePromise<FieldDispatchResult>;
  onEvent: (event: FieldEvent) => void;
  /** returnPos는 거점 진입 트리거에 닿기 직전의 자리 — 장소 이동이 거부되면 이 자리(트리거 밖)로 돌아온다 */
  onScene: (scene: SceneRef, message: string, entryPos?: Point, returnPos?: Point) => void;
  onWarmup?: () => void;
  /** 지금 계정이 게스트인가. 게스트는 규칙 판정이 허용하지 않는 장소로 가는 트리거에서 되밀린다 */
  guest?: boolean;
}

/**
 * 타이머가 목표 시각보다 늦게 깨어났을 때 다음 단계 기준 시각이 거슬러 올라갈 수 있는 한도(ms).
 * 숨은 탭의 1초 정렬 지연은 이 안에 들고, 멈춘 탭이 깨어나 단계를 연달아 넘기는 것은 막는다.
 */
const MAX_CATCH_UP_MS = 1000;

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
  /** 구역 경계와 열지 않은 바다에 막힌 안내의 재알림 판정 */
  private readonly zoneNotice = new BlockNotice();
  /** 배가 모자라 트리거에서 되밀린 안내의 재알림 판정 */
  private readonly triggerNotice = new BlockNotice();
  /** 게스트 출항 트리거에서 되밀린 알림의 재알림 판정 */
  private readonly guestNotice = new BlockNotice();
  private readonly keys = new Set<string>();
  /** 모바일 원 패드의 이동 방향(길이 1). 패드가 없으면 null */
  private padDir: Point | null = null;
  /** 잠금 중에는 이동, 트리거 판정, 낚시 시작 같은 게임 조작이 멈춘다 */
  private controlLocked = false;
  private biteStart = 0;
  /** 챔질 요청의 세대 번호. 챔질을 보내거나 낚시를 접을 때마다 올라, 이전 요청의 응답이 지금 던짐에 적용되지 않게 한다 */
  private hookSeq = 0;
  /** 이번 던짐에서 마지막으로 낸 캐치의 판정 — 입질 대기가 방치(auto) 사이클인지 가른다. 줄을 거두거나 새로 던지면 null */
  private lastJudgment: Judgment | null = null;
  /**
   * 현재 단계가 시작된 기준 시각(Date.now). 타이머로 넘어온 단계는 발화 시각이 아니라 이전 단계의 목표 시각이다.
   * 단, 타이머가 늦게 깨어났으면 발화 시각에서 MAX_CATCH_UP_MS를 뺀 시각까지만 거슬러 올라간다.
   * 획득 단계는 서버 결과가 도착한 시각이다
   */
  private phaseStartAt = 0;
  /** 타이머가 넘기는 다음 단계의 기준 시각 = max(목표 시각, 발화 시각 - 1000ms). 사용자 입력이나 줄 거두기로 바뀌는 단계에서는 null */
  private chainStartAt: number | null = null;
  /** 이번 던짐의 첫 결과가 나온 시각(Date.now). 결과 전이거나 줄을 거두었으면 null */
  private resultAt: number | null = null;
  /** catch 전이 시각 — 훅 점프 연출의 기준 */
  private catchStart = 0;
  /** 도감에 있는 어종 id — 어군 스프라이트의 색/실루엣 판정. game이 바뀔 때만 다시 만든다 */
  private phaseTimer: ReturnType<typeof setTimeout> | null = null;
  private lineCutTimer: ReturnType<typeof setTimeout> | null = null;
  private frameId: number | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private school: School | null = null;
  /** 이 지역의 현재 어군 — 대양은 세션의 배치 날짜로 정해지므로 호스트가 넘겨준다 */
  private schools: School[];
  /** 같은 바다의 다른 플레이어와 내 말풍선 — 실시간 채널이 프레임마다 보간한 위치와 함께 돌려준다 */
  private liveSource: ((now: number) => LiveFrame) | null = null;
  /** 카메라 시야 크기 — 모바일은 스테이지 비율로 호스트가 정해 준다 */
  private view: ViewSize = FIELD_VIEW;

  constructor(region: RegionId, game: GameState, schools: School[], initialPos?: Point) {
    this.def = REGION_PACKS[region];
    this.game = game;
    this.schools = schools;
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

  /** 카메라 시야 크기 — 캔버스 크기와 짝이다 */
  setView(view: ViewSize): void {
    this.view = view;
  }

  /** 물고기 그래픽 스타일 — 필드의 물고기 연출(훅 점프)이 이 어댑터로 그린다 */
  setFishArt(style: FishArtStyle): void {
    this.fishArt = style;
  }

  /** 지금 내 위치(복사본) */
  getPosition(): Point {
    return { x: this.pos.x, y: this.pos.y };
  }

  /** 이번 던짐의 첫 결과 시각 — 방치 시간의 시작. 줄을 거두면 null */
  getResultAt(): number | null {
    return this.resultAt;
  }

  /** 찌가 떠 있는 자리 — 낚싯줄을 드리운 동안 던진 어군의 위치. 드리우지 않았으면 null */
  getBobber(): Point | null {
    if (this.snapshot.phase === 'idle' || !this.school) return null;
    return { x: this.school.x, y: this.school.y };
  }

  /** 다른 플레이어 위치와 내 말풍선의 출처를 정한다. null이면 그리지 않는다 */
  setLiveSource(source: ((now: number) => LiveFrame) | null): void {
    this.liveSource = source;
  }

  /** 어군 교체 — 배치 날짜가 서버 값으로 바뀌면 사거리 내 어군을 다시 판정한다 */
  setSchools(schools: School[]): void {
    if (this.schools === schools) return;
    this.schools = schools;
    this.refreshNearby();
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

  /**
   * 조작 잠금 — 켜면 눌린 키와 패드 방향을 비우고, 잠금 중에는 이동, 트리거 판정(onScene), 낚시 시작을 하지 않는다.
   * 렌더와 다른 플레이어 표시 같은 프레임 루프의 나머지는 계속 돈다.
   */
  setControlLocked(locked: boolean): void {
    this.controlLocked = locked;
    if (!locked) return;
    this.keys.clear();
    this.padDir = null;
  }

  /**
   * 플레이어를 지정한 좌표로 옮긴다 — 낚시 중이면 줄을 거두고, 구역 추적과 사거리 어군을 새 자리 기준으로 다시 잡는다.
   * 도착 자리가 트리거 안이어도 별도 처리 없이 생성 시 시작 위치와 같게 다음 프레임에 트리거를 판정한다.
   */
  placePlayer(pos: Point): void {
    if (this.snapshot.phase !== 'idle') this.cancelFishing();
    this.pos.x = pos.x;
    this.pos.y = pos.y;
    this.initializePositionState();
  }

  handleKeyDown(code: string, preventDefault: () => void): boolean {
    if (code === 'Space') {
      preventDefault();
      this.action();
      return true;
    }
    if (!MOVE_KEYS[code]) return false;

    preventDefault();
    if (this.controlLocked) return true;
    if (this.snapshot.phase !== 'idle') {
      this.cancelFishing();
      this.callbacks.onEvent({ type: 'movement-cancelled' });
    }
    this.keys.add(code);
    return true;
  }

  /** 원 패드의 이동 방향 — 키 이동처럼 낚시를 접고 움직이며, (0, 0)이나 null이면 멈춘다 */
  setMoveDirection(dir: Point | null): void {
    if (this.controlLocked) return;
    const moving = dir !== null && (dir.x !== 0 || dir.y !== 0);
    this.padDir = moving ? dir : null;
    if (!moving && this.keys.size === 0) this.releaseNotices();
    if (moving && this.snapshot.phase !== 'idle') {
      this.cancelFishing();
      this.callbacks.onEvent({ type: 'movement-cancelled' });
    }
  }

  releaseKey(code: string): void {
    this.keys.delete(code);
    if (this.keys.size === 0 && !this.padDir) this.releaseNotices();
  }

  /** 이동 입력이 끊겼다. 다음에 막히면 새 시도로 보고 안내를 다시 낸다 */
  private releaseNotices(): void {
    this.zoneNotice.release();
    this.triggerNotice.release();
    this.guestNotice.release();
  }

  cancelFishing(): void {
    this.hookSeq += 1;
    this.school = null;
    this.lastJudgment = null;
    this.transition('idle', null, null);
  }

  action(): void {
    if (this.controlLocked) return;
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
    this.padDir = null;
    this.listeners.clear();
  }

  private initializePositionState(): void {
    const zone = zoneOf(this.def, this.pos.x, this.pos.y) ?? null;
    this.tracker.init(zone);
    this.releaseNotices();
    this.refreshNearby();
    setZone(this.lastSpot ? zoneOfSpot(this.lastSpot) ?? null : (zone ? topZoneOf(zone) : null));
    setPlayerPos({ x: this.pos.x, y: this.pos.y });
  }

  /** 현재 자리에서 사거리 내 어군을 다시 구해 스토어에 반영한다 (스토어가 같은 값은 거른다) */
  private refreshNearby(): void {
    const nearby = nearestSchoolInRange(this.schools, this.pos.x, this.pos.y, CAST_RANGE);
    this.lastSpot = nearby?.spot ?? null;
    setCurrentSpot(this.lastSpot);
  }

  private updateFrame(ctx: CanvasRenderingContext2D, now: number, last: number): boolean {
    const dt = Math.min((now - last) / 1000, 0.05);
    if (this.controlLocked) return this.renderFrame(ctx, now);
    let dx = 0, dy = 0;
    for (const key of this.keys) {
      const direction = MOVE_KEYS[key];
      if (direction) { dx += direction[0]; dy += direction[1]; }
    }

    let movedFrom: Point | null = null;
    let closedMessage: string | null = null;
    // 키 이동은 방향 부호(대각선 포함)로, 원 패드는 끄는 각도 그대로의 단위 벡터로 움직인다
    const pad = this.padDir;
    const attempting = Boolean(dx || dy || pad) && this.snapshot.phase === 'idle';
    if (attempting) {
      const speed = moveSpeed(this.game, this.def.movement, this.night).value;
      movedFrom = { ...this.pos };
      const dirX = pad ? pad.x : Math.sign(dx), dirY = pad ? pad.y : Math.sign(dy);
      closedMessage = closedSeaBlock(this.def, this.pos, dirX, dirY, dt, speed);
      const next = movePlayer(this.def, this.pos, dirX, dirY, dt, speed);
      this.pos.x = next.x;
      this.pos.y = next.y;
      this.refreshNearby();
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
    } else if (step.enteredTop) {
      this.callbacks.onEvent({ type: 'zone-entered', zone: step.enteredTop });
    }

    // 막힌 시도는 경계에 닿는 순간 한 번만 알린다 — 막힌 채 키를 누르고 있는 동안은 프레임 간격과 무관하게 반복하지 않고,
    // 입력이 끊겼다 다시 시작되거나 막힌 자리에서 충분히 떨어졌다 다시 닿을 때 다시 알린다.
    if (!attempting) this.releaseNotices();
    const blockedMessage = closedMessage ?? (step.revert ? step.blocked : null);
    if (this.zoneNotice.step(blockedMessage !== null, this.pos) && blockedMessage) {
      this.callbacks.onEvent({ type: 'zone-blocked', message: blockedMessage });
    }

    const focusZone = this.lastSpot ? zoneOfSpot(this.lastSpot) : null;
    setZone(focusZone ?? (zone ? topZoneOf(zone) : null));

    let guestBlocked = false;
    let triggerBlocked: string | null = null;
    for (const trigger of this.def.triggers) {
      if (!inTrigger(this.pos, trigger.rect)) continue;
      if (trigger.action === 'base') {
        this.callbacks.onScene({ kind: 'base', id: trigger.base ?? this.def.base }, trigger.msg, undefined, movedFrom ?? undefined);
        return false;
      }
      if (trigger.action === 'travel') {
        if (this.game.boat >= trigger.requiredBoat) {
          const to: SceneRef = { kind: 'region', id: trigger.to };
          if (this.callbacks.guest && guestActionVerdict({ type: 'travel', to }) !== 'ok') {
            if (movedFrom) {
              this.pos.x = movedFrom.x;
              this.pos.y = movedFrom.y;
            }
            guestBlocked = true;
            continue;
          }
          const entry = entryPoint(REGION_PACKS[trigger.to], trigger, this.pos);
          this.callbacks.onScene(to, trigger.msg, entry);
          return false;
        }
        if (movedFrom) {
          this.pos.x = movedFrom.x;
          this.pos.y = movedFrom.y;
        }
        triggerBlocked = trigger.blockedMsg;
      }
    }
    if (this.guestNotice.step(guestBlocked, this.pos)) this.callbacks.onEvent({ type: 'guest-blocked' });
    if (this.triggerNotice.step(triggerBlocked !== null, this.pos) && triggerBlocked !== null) {
      this.callbacks.onEvent({ type: 'trigger-blocked', message: triggerBlocked });
    }

    return this.renderFrame(ctx, now);
  }

  private renderFrame(ctx: CanvasRenderingContext2D, now: number): boolean {
    const axes = rodAxes(this.game);
    const zones = this.school ? powerZones(this.game, this.school.spot) : null;
    renderRegion(ctx, this.def, {
      player: this.pos,
      schools: this.schools,
      phase: this.snapshot.phase,
      school: this.school,
      boat: this.game.boat,
      look: this.game.look,
      biteT: this.snapshot.phase === 'bite'
        ? (Date.now() - this.biteStart) / 1000 / axes.sweep.value : null,
      zone: zones ? zones.yellow / 100 : 0,
      red: zones ? zones.red / 100 : 0,
      t: now / 1000,
      catchT: this.snapshot.phase === 'catch' ? (Date.now() - this.catchStart) / 1000 : null,
      catchFish: this.snapshot.fishId
        ? { id: this.snapshot.fishId, form: this.snapshot.catchInfo?.form ?? 'normal' } : null,
      fishArt: this.fishArt,
      view: this.view,
      ...(this.liveSource?.(now) ?? { others: [], bubble: null, idle: null }),
    });
    return true;
  }

  private tryCast(silent: boolean): void {
    const nearby = nearestSchoolInRange(this.schools, this.pos.x, this.pos.y, CAST_RANGE);
    if (!nearby) {
      if (!silent) this.callbacks.onEvent({ type: 'cast-denied', reason: 'range' });
      return;
    }
    if (!canFishSpot(this.game, nearby.spot)) {
      if (!silent) this.callbacks.onEvent({ type: 'cast-denied', reason: 'boat', spot: nearby.spot });
      return;
    }

    this.school = nearby;
    this.lastJudgment = null;
    this.transition('wait', null, null);
    this.callbacks.onWarmup?.();
    if (!silent) this.callbacks.onEvent({ type: 'cast', spot: nearby.spot });
  }

  private hookFish(judgment: Judgment): void {
    const school = this.school;
    if (!school || this.snapshot.phase !== 'bite') return;
    this.lastJudgment = judgment;
    this.hookSeq += 1;
    const seq = this.hookSeq;
    this.transition('catch');
    when(this.callbacks.dispatch({ type: 'catch', spot: school.spot, judgment }), result => {
      // 낚시를 접은 뒤 도착한 응답은 낚시 단계에 적용하지 않는다. 포획이 확정된 응답의 획득 안내만 낸다
      if (seq !== this.hookSeq) {
        if (result.status === 'ok' && result.result.type === 'catch') {
          this.callbacks.onEvent({ type: 'catch', judgment, result: result.result });
        }
        return;
      }
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
    const resultArrived = phase === 'catch' && this.snapshot.fishId === null && fishId !== null;
    if (resultArrived) {
      // 획득 카운트다운은 서버 결과가 도착한 시각부터 센다
      this.phaseStartAt = Date.now();
    } else if (phase !== this.snapshot.phase) {
      this.phaseStartAt = this.chainStartAt ?? Date.now();
    }
    this.chainStartAt = null;
    this.resultAt = resultAtOf(this.resultAt, phase, Date.now());
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
    if (phase === 'bite') this.biteStart = this.phaseStartAt;

    const school = this.school;
    let ms: number;
    if (phase === 'wait' && school) {
      // 도시락 입질 단축은 방치 사이클(직전 캐치가 auto)의 대기에만 넣는다. 수동 낚시와 첫 대기에는 넣지 않는다
      const cook = this.lastJudgment === 'auto'
        ? slotEffects(this.game, new Date(Date.now()).toISOString(), 'auto') : NO_COOK_EFFECTS;
      const bite = effectiveBite(this.game, school.spot, cook);
      const random = Math.random();
      ms = (bite.min.value + random * (bite.max.value - bite.min.value)) * 1000;
    } else {
      const fish = this.snapshot.fishId
        ? FISH.find(candidate => candidate.id === this.snapshot.fishId)
        : undefined;
      ms = phaseDurationMs(phase, this.game.rod, undefined, fish?.rarity);
    }

    // 숨은 탭은 타이머를 늦게 깨우므로, 단계 길이는 시작 기준 절대 시각에서 남은 만큼으로 잡는다
    const dueAt = this.phaseStartAt + ms;
    this.phaseTimer = setTimeout(() => {
      this.phaseTimer = null;
      this.chainStartAt = Math.max(dueAt, Date.now() - MAX_CATCH_UP_MS);
      if (phase === 'bite') { this.hookFish('auto'); return; }
      if (phase === 'catch') {
        this.transition(nextPhase(phase), null, null);
        return;
      }
      this.transition(nextPhase(phase));
    }, Math.max(0, dueAt - Date.now()));

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
