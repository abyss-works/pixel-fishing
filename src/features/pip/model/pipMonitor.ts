// 브라우저 Document PiP 미니 모니터 순수 모델 (React 비의존).
import { eventFishById } from '../../../game/content/eventFish';
import { fishById, type FormId } from '../../../game/content/fish';
import { RARITY } from '../../../game/content/rarity';
import { spotById } from '../../../game/content/spots';
import { zoneById } from '../../../game/content/zones';
import { effectiveLookForRegion, type Look } from '../../../game/content/wardrobe';
import type { FishArtSubject } from '../../../game/rendering/pixel/fishArt';
import type { ActionResult } from '../../../game/rules/actions';
import { priceOf, type GameState } from '../../../game/rules/logic';
import {
  buildWidgetCatchItem,
  resolveSpotSeaTheme,
  type WidgetCatchItem,
  type WidgetCatchValue,
} from '../../../game/rules/widget';
import { BASE_PACKS, REGION_PACKS, type SceneRef } from '../../../game/world';
import type { SpotState } from '../../../game/world/currentSpot';

export const PIP_BASE_WIDTH = 420;
export const PIP_BASE_HEIGHT = 156;
export const PIP_DIORAMA_HEIGHT = 90;
export const PIP_AUTOCLOSE_GRACE_MS = 250;
export const PIP_SCALE_PRESETS = [85, 100, 125] as const;
export const PIP_RECENT_CATCH_LIMIT = 4;
export const PIP_JUMP_DURATION_S = 0.6;
export const PIP_JUMP_HEIGHT_PX = 14;
export const PIP_LOG_EXIT_MS = 240;
export const PIP_SCALE_STORAGE_KEY = 'pf-pip-scale';
export const PIP_GAME_DAY_DURATION_MS = 60 * 60 * 1000;

export type PipScalePreset = (typeof PIP_SCALE_PRESETS)[number];
export type PipBagTone = 'gold' | 'warn' | 'danger';

export interface PipCatchItem extends WidgetCatchItem {
  rarityLabel: string;
  fishSubject: FishArtSubject;
  form: FormId;
}

export interface PipSpotInfo {
  spotId: string;
  spotName: string;
  seaTheme: string;
  inRegion: boolean;
}

export interface PipLeapTrigger {
  seq: number;
  item: PipCatchItem;
}

export interface PipLeapFrame {
  active: boolean;
  offsetWorldPx: number;
  flipped: boolean;
  progress: number;
}

export interface PipMonitorState {
  recentCatches: PipCatchItem[];
  leapTrigger: PipLeapTrigger | null;
  catchFxSeq: number;
  exitingLogItem: PipCatchItem | null;
  nextLeapSeq: number;
}

export type PipMonitorAction =
  | { type: 'hydrate'; recentCatches: readonly PipCatchItem[] }
  | { type: 'catch'; item: PipCatchItem }
  | { type: 'clear_exiting_log' }
  | { type: 'reset_fx' };

export const initialPipMonitorState: PipMonitorState = {
  recentCatches: [],
  leapTrigger: null,
  catchFxSeq: 0,
  exitingLogItem: null,
  nextLeapSeq: 0,
};

/** 포획 액션 결과에서 PiP 표시용 어획 항목을 조립한다 */
export function buildPipCatchItem(
  result: Extract<ActionResult, { type: 'catch' }>,
  caughtAtMs: number,
): PipCatchItem | null {
  if (!result?.info || !result.fishId || !result.uid) return null;
  const form: FormId = result.info.form;
  const regular = fishById(result.fishId);
  if (regular) {
    const value: WidgetCatchValue = { kind: 'gold', amount: priceOf(regular, form) };
    const base = buildWidgetCatchItem({
      eventId: result.uid,
      fish: regular,
      form,
      sizeCm: result.info.size,
      value,
      isBig: result.info.isBig,
      caughtAtMs,
    });
    return {
      ...base,
      rarityLabel: RARITY[regular.rarity].name,
      fishSubject: regular,
      form,
    };
  }

  const ef = eventFishById(result.fishId);
  if (!ef) return null;
  const rawScore = form === 'variant' ? ef.variant.score : ef.score;
  const value: WidgetCatchValue = Number.isFinite(rawScore) && rawScore > 0
    ? { kind: 'score', amount: rawScore }
    : { kind: 'none' };
  const base = buildWidgetCatchItem({
    eventId: result.uid,
    fish: ef,
    form,
    sizeCm: result.info.size,
    value,
    isBig: result.info.isBig,
    caughtAtMs,
  });
  const fishSubject: FishArtSubject = {
    id: ef.id,
    shape: ef.shape,
    color: ef.color,
    variant: { name: ef.variant.name, color: ef.variant.color, lore: ef.variant.lore },
    rarity: ef.rarity,
  };
  return {
    ...base,
    rarityLabel: RARITY[ef.rarity].name,
    fishSubject,
    form,
  };
}

/** 최근 포획 버퍼 앞에 새 포획을 추가하며 중복을 거르고 최대 4건을 유지한다 */
export function appendPipCatchBuffer(
  prev: readonly PipCatchItem[],
  incoming: PipCatchItem,
): PipCatchItem[] {
  if (prev.some(item => item.eventId === incoming.eventId)) {
    return prev as PipCatchItem[];
  }
  return [incoming, ...prev].slice(0, PIP_RECENT_CATCH_LIMIT);
}

/** 다음 배율 프리셋(85% -> 100% -> 125% -> 85%)을 돌려준다 */
export function nextPipScalePreset(current: number): PipScalePreset {
  if (current === 100) return 125;
  if (current === 125) return 85;
  return 100;
}

/** 저장된 배율 값을 허용된 프리셋(85, 100, 125)으로 정규화한다 */
export function parsePipScalePreset(raw: unknown): PipScalePreset {
  const num = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : Number.NaN;
  if (num === 85 || num === 100 || num === 125) return num;
  return 100;
}

/** 배율 프리셋에 따른 목표 뷰포트 크기(px)와 CSS zoom 배율을 계산한다 */
export function computeScaledPipSize(preset: PipScalePreset): {
  width: number;
  height: number;
  zoom: number;
} {
  const zoom = preset / 100;
  return {
    width: Math.ceil(PIP_BASE_WIDTH * zoom),
    height: Math.ceil(PIP_BASE_HEIGHT * zoom),
    zoom,
  };
}

/** 가방 채움 비율에 따른 세로 게이지 톤을 정한다 */
export function getPipBagTone(percent: number): PipBagTone {
  if (percent >= 95) return 'danger';
  if (percent >= 75) return 'warn';
  return 'gold';
}

/** 게임 시각을 [0, 24) 범위로 정규화한다 */
export function normalizePipGameHour(hourFloat: number): number {
  if (!Number.isFinite(hourFloat)) return 0;
  return ((hourFloat % 24) + 24) % 24;
}

/** 현재 벽시계(ms) 기준 연속 게임 시각([0, 24))을 계산한다 */
export function computePipWallClockGameHour(nowMs: number): number {
  const fraction = (((nowMs % PIP_GAME_DAY_DURATION_MS) + PIP_GAME_DAY_DURATION_MS) % PIP_GAME_DAY_DURATION_MS) / PIP_GAME_DAY_DURATION_MS;
  return fraction * 24;
}

/** 게임 시각을 HH:MM 문자열로 변환한다 */
export function formatPipGameClock(hourFloat: number): string {
  const normalized = normalizePipGameHour(hourFloat);
  let hh = Math.floor(normalized) % 24;
  let mm = Math.floor((normalized - Math.floor(normalized)) * 60);
  if (mm >= 60) {
    mm = 0;
    hh = (hh + 1) % 24;
  }
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** 0.6초 동안 최대 14 월드 픽셀 사인 호 도약과 0.3초 정점 통과 후 반전을 계산한다 */
export function computePipLeapFrame(elapsedSeconds: number): PipLeapFrame {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 || elapsedSeconds >= PIP_JUMP_DURATION_S) {
    return { active: false, offsetWorldPx: 0, flipped: false, progress: 0 };
  }
  const progress = elapsedSeconds / PIP_JUMP_DURATION_S;
  const offsetWorldPx = Math.round(Math.sin(progress * Math.PI) * PIP_JUMP_HEIGHT_PX);
  return {
    active: true,
    offsetWorldPx,
    flipped: elapsedSeconds > PIP_JUMP_DURATION_S / 2,
    progress,
  };
}

/** 최신 포획 카드와 미니 일지 행에 표시할 툴팁 문구를 만든다 */
export function formatPipCatchTip(item: PipCatchItem): string {
  const tags: string[] = [];
  if (item.isBig) tags.push('월척');
  if (item.isMutant) tags.push('돌연변이');
  const tagText = tags.length > 0 ? ` (${tags.join(', ')})` : '';
  return `${item.name}${tagText} / ${item.rarityLabel} / ${item.sizeText} / ${item.priceText}`;
}

/** 현재 씬·어군·세이브 위치로 PiP 상단 해역 칩 표시 정보를 해석한다 */
export function resolvePipSpotInfo(input: {
  scene: SceneRef;
  currentSpot: Pick<SpotState, 'spot' | 'zone'>;
  game: Pick<GameState, 'location'>;
}): PipSpotInfo {
  const { scene, currentSpot, game } = input;
  if (scene.kind === 'region') {
    if (scene.id === 'championship') {
      const eventSpot = spotById('championship');
      return {
        spotId: 'championship',
        spotName: eventSpot?.name ?? REGION_PACKS.championship.info.shortName,
        seaTheme: resolveSpotSeaTheme('championship'),
        inRegion: true,
      };
    }
    const activeSpot = currentSpot.spot ? spotById(currentSpot.spot) : undefined;
    const activeZone = currentSpot.zone ? zoneById(currentSpot.zone) : undefined;
    const spotName = activeSpot?.name
      ?? activeZone?.shortName
      ?? activeZone?.name
      ?? REGION_PACKS[scene.id].info.shortName;
    const spotId = currentSpot.spot ?? scene.id;
    return {
      spotId,
      spotName,
      seaTheme: resolveSpotSeaTheme(currentSpot.spot),
      inRegion: true,
    };
  }

  const baseName = BASE_PACKS[scene.id]?.name ?? '거점';
  const fallbackSpot = game.location.kind === 'region' ? game.location.id : null;
  return {
    spotId: scene.id,
    spotName: baseName,
    seaTheme: resolveSpotSeaTheme(fallbackSpot),
    inRegion: false,
  };
}

/** 현재 씬에서 아바타가 착용하는 실효 외형(지역 강제 모자 포함)을 반환한다 */
export function resolvePipAvatarLook(look: Look, scene: SceneRef): Look {
  return scene.kind === 'region' ? effectiveLookForRegion(look, scene.id) : look;
}

/** PiP 최근 포획 목록과 도약·슬라이드 연출 상태를 원자적으로 전이한다 */
export function pipMonitorReducer(
  state: PipMonitorState,
  action: PipMonitorAction,
): PipMonitorState {
  switch (action.type) {
    case 'hydrate':
      return {
        ...state,
        recentCatches: action.recentCatches.slice(0, PIP_RECENT_CATCH_LIMIT),
        leapTrigger: null,
        catchFxSeq: 0,
        exitingLogItem: null,
      };

    case 'catch': {
      const nextCatches = appendPipCatchBuffer(state.recentCatches, action.item);
      if (nextCatches === state.recentCatches) {
        return state;
      }
      const nextSeq = state.nextLeapSeq + 1;
      const exitingLogItem = state.recentCatches[PIP_RECENT_CATCH_LIMIT - 1] ?? null;
      return {
        recentCatches: nextCatches,
        leapTrigger: { seq: nextSeq, item: action.item },
        catchFxSeq: state.catchFxSeq + 1,
        exitingLogItem,
        nextLeapSeq: nextSeq,
      };
    }

    case 'clear_exiting_log':
      if (!state.exitingLogItem) return state;
      return { ...state, exitingLogItem: null };

    case 'reset_fx':
      if (!state.leapTrigger && !state.exitingLogItem) return state;
      return { ...state, leapTrigger: null, exitingLogItem: null };
  }
}
