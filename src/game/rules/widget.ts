// 데스크톱 낚시 모니터 위젯 공유 계약 — 게임 규칙·콘텐츠·서버 API가 같은 타입과 매핑을 쓴다.
// 상대 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버가 직접 불러온다.

import { fishById } from '../content/fish.js';
import type { FormId } from '../content/fish.js';
import { eventFishById } from '../content/eventFish.js';
import type { LocationRef } from '../content/places.js';
import { RARITY } from '../content/rarity.js';
import type { RarityId } from '../content/rarity.js';
import { EVENT_SPOTS, SPOTS, spotById } from '../content/spots.js';
import type { Spot, SpotId } from '../content/spots.js';
import { fmtGold, fmtNum, fmtSize } from '../../shared/lib/format.js';

/** 위젯 네이티브 클라이언트 식별 HTTP 헤더 이름 */
export const WIDGET_CLIENT_HEADER = 'x-widget-client';
/** 위젯 네이티브 클라이언트 식별 헤더 기대값 */
export const WIDGET_CLIENT_VALUE = 'desktop';
/** 위젯 네이티브 클라이언트 버전 HTTP 헤더 이름 */
export const WIDGET_VERSION_HEADER = 'x-widget-version';
/** 현재 서버가 허용하는 최소 위젯 클라이언트 semver */
export const WIDGET_MIN_CLIENT_VERSION = '0.1.0';

/** 무포획 시 대기(idle) 상태로 전환하는 기준 시간(ms) */
export const WIDGET_IDLE_TIMEOUT_MS = 90_000;
/** 프록시 읽기 유휴 제한(60초) 미만으로 보내는 SSE keepalive 주기(ms) */
export const WIDGET_SSE_KEEPALIVE_MS = 25_000;
/** 요약 응답에 담는 최근 포획 최대 개수(최신 카드 1 + 미니 일지 3) */
export const WIDGET_RECENT_CATCH_LIMIT = 4;

/** 1차 지원 바다 디오라마 테마 식별자 */
export type WidgetSeaTheme = 'deep';
export const DEFAULT_WIDGET_SEA_THEME: WidgetSeaTheme = 'deep';

type RegularSpotId = Exclude<SpotId, (typeof EVENT_SPOTS)[number]['id']>;

/** 전체 15개 정규 해역(이벤트 수역 제외)과 위젯 바다 테마 1:1 매핑 */
export const SPOT_SEA_THEME: Record<RegularSpotId, WidgetSeaTheme> = {
  pond: 'deep',
  river: 'deep',
  sea: 'deep',
  deep: 'deep',
  dragonhole: 'deep',
  coron: 'deep',
  barrierreef: 'deep',
  indian: 'deep',
  southindian: 'deep',
  mozstrait: 'deep',
  comorodeep: 'deep',
  benguela: 'deep',
  sthelena: 'deep',
  azores: 'deep',
  bermuda: 'deep',
};

/** 해역 id로 위젯 바다 테마를 고른다. 모르거나 비어 있으면 'deep'으로 폴백한다 */
export function resolveSpotSeaTheme(spotId?: string | null): WidgetSeaTheme {
  if (spotId && Object.hasOwn(SPOT_SEA_THEME, spotId)) {
    return SPOT_SEA_THEME[spotId as RegularSpotId];
  }
  return DEFAULT_WIDGET_SEA_THEME;
}

export type WidgetRarity = RarityId;
export type WidgetFishingState = 'active' | 'idle';
export type WidgetAuthState =
  | 'authenticated'
  | 'auth_required'
  | 'unsupported_account'
  | 'consent_required'
  | 'account_restricted'
  | 'upgrade_required'
  | 'offline_error';
export type WidgetConnectionState = 'connected' | 'reconnecting' | 'auth_required';

export interface FallbackFishColors {
  body: string;
  fin: string;
  belly: string;
  eye: string;
}

export interface WidgetCatchItem {
  eventId: string;
  spriteKey: string;
  name: string;
  rarity: WidgetRarity;
  sizeText: string;
  priceText: string;
  isBig: boolean;
  isMutant: boolean;
  caughtAtMs: number;
  fallbackColors?: FallbackFishColors;
}

export interface WidgetBagSummary {
  count: number;
  cap: number;
  percent: number;
}

export interface WidgetSummary {
  authState: WidgetAuthState;
  connectionState: WidgetConnectionState;
  fishingState: WidgetFishingState;
  spotId: string;
  spotName: string;
  seaTheme: WidgetSeaTheme | string;
  bag: WidgetBagSummary;
  recentCatches: WidgetCatchItem[];
  serverTimeMs: number;
  lastCatchAtMs: number | null;
  gameHour: number;
  lastEventId: string | null;
}

export type WidgetSseEvent =
  | {
      type: 'summary_sync';
      eventId: string | null;
      summary: WidgetSummary;
    }
  | {
      type: 'catch';
      eventId: string;
      catchItem: WidgetCatchItem;
      bag: WidgetBagSummary;
      fishingState?: WidgetFishingState;
      spotId?: string;
      spotName?: string;
      seaTheme?: WidgetSeaTheme | string;
      serverTimeMs: number;
    }
  | {
      type: 'bag_sync';
      eventId: string;
      bag: WidgetBagSummary;
      serverTimeMs: number;
    }
  | {
      type: 'spot_changed';
      eventId: string;
      spotId: string;
      spotName: string;
      seaTheme: WidgetSeaTheme | string;
      serverTimeMs: number;
    }
  | {
      type: 'status_changed';
      eventId: string;
      fishingState: WidgetFishingState;
      serverTimeMs: number;
    };

export type WidgetSseEventType = WidgetSseEvent['type'];

const DEFAULT_RGB: readonly [number, number, number] = [0x4f, 0xc3, 0xf7];
const BELLY_TARGET_HEX = '#f2f7fb';
const DARK_INK_HEX = '#08111f';

function parseHexRgb(hex: string | undefined): readonly [number, number, number] {
  if (!hex) return DEFAULT_RGB;
  const normalized = hex.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return [
      parseInt(normalized.slice(1, 3), 16),
      parseInt(normalized.slice(3, 5), 16),
      parseInt(normalized.slice(5, 7), 16),
    ];
  }
  if (/^#[0-9a-fA-F]{3}$/.test(normalized)) {
    return [
      parseInt(normalized[1] + normalized[1], 16),
      parseInt(normalized[2] + normalized[2], 16),
      parseInt(normalized[3] + normalized[3], 16),
    ];
  }
  return DEFAULT_RGB;
}

function formatRgbHex(rgb: readonly [number, number, number]): string {
  const clampByte = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${rgb.map(v => clampByte(v).toString(16).padStart(2, '0')).join('')}`;
}

function mixRgb(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  ratioB: number,
): readonly [number, number, number] {
  const t = Math.max(0, Math.min(1, ratioB));
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function relativeLuminance(rgb: readonly [number, number, number]): number {
  return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
}

export interface WidgetFishSubject {
  id: string;
  name: string;
  rarity: RarityId;
  color: string;
  variant: {
    name: string;
    color: string;
  };
}

/** 정규 어종과 이벤트 전용 어종을 통틀어 위젯 표시용 어종 메타를 조회한다 */
export function widgetFishById(id: unknown): WidgetFishSubject | undefined {
  return fishById(id) ?? eventFishById(id);
}

export const WIDGET_EMPTY_VALUE_TEXT = '-';

export type WidgetCatchValue =
  | { kind: 'gold'; amount: number }
  | { kind: 'score'; amount: number }
  | { kind: 'text'; text: string }
  | { kind: 'none' };

/** 위젯 포획 가치 모델을 표시 문자열로 직렬화한다 */
export function formatWidgetCatchValue(value: WidgetCatchValue): string {
  switch (value.kind) {
    case 'gold':
      return Number.isFinite(value.amount) && value.amount >= 0 ? fmtGold(value.amount) : WIDGET_EMPTY_VALUE_TEXT;
    case 'score':
      return Number.isFinite(value.amount) && value.amount > 0 ? `${fmtNum(value.amount)}점` : WIDGET_EMPTY_VALUE_TEXT;
    case 'text':
      return value.text.trim() || WIDGET_EMPTY_VALUE_TEXT;
    case 'none':
      return WIDGET_EMPTY_VALUE_TEXT;
  }
}

/** 이벤트 포획 payload에서 위젯 가치 표현을 결정한다 (priceText > score > priceGold > none) */
export function resolveEventCatchValue(
  payload: { priceText?: unknown; score?: unknown; priceGold?: unknown } | null | undefined,
): WidgetCatchValue {
  if (typeof payload?.priceText === 'string' && payload.priceText.trim().length > 0) {
    return { kind: 'text', text: payload.priceText.trim() };
  }
  if (typeof payload?.score === 'number' && Number.isFinite(payload.score) && payload.score > 0) {
    return { kind: 'score', amount: payload.score };
  }
  if (typeof payload?.priceGold === 'number' && Number.isFinite(payload.priceGold) && payload.priceGold >= 0) {
    return { kind: 'gold', amount: payload.priceGold };
  }
  return { kind: 'none' };
}

/** 수역 id로 정규 수역·이벤트 수역 메타를 함께 조회한다 */
export function findWidgetSpot(spotId: string | null | undefined): Spot | undefined {
  return spotId ? spotById(spotId as SpotId) : undefined;
}

const EVENT_SPOT_IDS = new Set<string>(EVENT_SPOTS.map(s => s.id));

/** 현재 위치·실시간 접속 구역·최근 출조 수역을 우선순위에 따라 위젯 대표 수역으로 해석한다 */
export function resolveWidgetSpot(input: {
  location: LocationRef;
  presenceRegion?: string | null;
  lastSpot?: string | null;
  recentCatchSpot?: string | null;
}): Spot {
  if (input.location.kind === 'region' && EVENT_SPOT_IDS.has(input.location.id)) {
    const spot = findWidgetSpot(input.location.id);
    if (spot) return spot;
  }
  if (typeof input.presenceRegion === 'string' && EVENT_SPOT_IDS.has(input.presenceRegion)) {
    const spot = findWidgetSpot(input.presenceRegion);
    if (spot) return spot;
  }
  const last = findWidgetSpot(input.lastSpot);
  if (last) return last;
  const recent = findWidgetSpot(input.recentCatchSpot);
  if (recent) return recent;
  if (input.location.kind === 'region' && input.location.id === 'world') {
    return findWidgetSpot('sea') ?? SPOTS[0];
  }
  return SPOTS[0];
}

/** 내장 스프라이트가 없는 위젯 클라이언트용 공용 실루엣 hex 팔레트를 파생한다 */
export function deriveFishFallbackColors(fish: WidgetFishSubject, isMutant = false): FallbackFishColors {
  const bodyHexRaw = isMutant ? (fish.variant?.color ?? fish.color) : fish.color;
  const bodyRgb = parseHexRgb(bodyHexRaw);
  const body = formatRgbHex(bodyRgb);
  const bodyLum = relativeLuminance(bodyRgb);

  const bellyRgb = mixRgb(bodyRgb, parseHexRgb(BELLY_TARGET_HEX), 0.78);
  const belly = formatRgbHex(bellyRgb);

  const finRgb = bodyLum < 0.14
    ? mixRgb(bodyRgb, parseHexRgb(BELLY_TARGET_HEX), 0.35)
    : mixRgb(bodyRgb, parseHexRgb(DARK_INK_HEX), 0.28);
  const fin = formatRgbHex(finRgb);

  let eye = DARK_INK_HEX;
  if (bodyLum < 0.35) {
    const accentRgb = parseHexRgb(RARITY[fish.rarity]?.color);
    const accentLum = relativeLuminance(accentRgb);
    eye = Math.abs(accentLum - bodyLum) >= 0.22 ? formatRgbHex(accentRgb) : BELLY_TARGET_HEX;
  }

  return { body, fin, belly, eye };
}

/** 가방 마릿수를 내림 정수 백분율(0~100)로 계산한다 */
export function computeBagPercent(count: number, cap: number): number {
  if (!Number.isFinite(count) || !Number.isFinite(cap) || cap <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor((count / cap) * 100)));
}

/** 위젯 가방 요약 객체를 조립한다 */
export function buildWidgetBagSummary(count: number, cap: number): WidgetBagSummary {
  return {
    count,
    cap,
    percent: computeBagPercent(count, cap),
  };
}

/** 포획 결과에서 위젯용 포획 카드/미니 일지 항목을 조립한다 */
export function buildWidgetCatchItem(input: {
  eventId: string;
  fish: WidgetFishSubject;
  form: FormId;
  sizeCm: number;
  priceGold?: number;
  value?: WidgetCatchValue;
  isBig: boolean;
  caughtAtMs: number;
}): WidgetCatchItem {
  const isMutant = input.form === 'variant';
  const resolvedValue: WidgetCatchValue = input.value
    ?? (typeof input.priceGold === 'number' ? { kind: 'gold', amount: input.priceGold } : { kind: 'none' });
  return {
    eventId: input.eventId,
    spriteKey: input.fish.id,
    name: isMutant ? input.fish.variant.name : input.fish.name,
    rarity: input.fish.rarity,
    sizeText: fmtSize(input.sizeCm),
    priceText: formatWidgetCatchValue(resolvedValue),
    isBig: input.isBig,
    isMutant,
    caughtAtMs: input.caughtAtMs,
    fallbackColors: deriveFishFallbackColors(input.fish, isMutant),
  };
}

interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  pre: readonly string[];
}

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

function parseSemver(raw: string | null | undefined): ParsedSemver | null {
  if (typeof raw !== 'string') return null;
  const m = SEMVER_RE.exec(raw.trim());
  if (!m) return null;
  const pre = m[4] ? m[4].split('.') : [];
  if (pre.some(part => part.length === 0)) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    pre,
  };
}

function comparePreRelease(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const partA = a[i];
    const partB = b[i];
    if (partA === undefined) return -1;
    if (partB === undefined) return 1;
    if (partA === partB) continue;
    const numA = /^\d+$/.test(partA);
    const numB = /^\d+$/.test(partB);
    if (numA && numB) return Number(partA) - Number(partB);
    if (numA) return -1;
    if (numB) return 1;
    return partA < partB ? -1 : 1;
  }
  return 0;
}

/** 위젯 클라이언트 버전 문자열이 최소 지원 버전 이상인지 semver 규칙으로 판정한다 */
export function isMinWidgetVersionSupported(
  version: string | null | undefined,
  minVersion: string = WIDGET_MIN_CLIENT_VERSION,
): boolean {
  const actual = parseSemver(version);
  const minimum = parseSemver(minVersion);
  if (!actual || !minimum) return false;
  if (actual.major !== minimum.major) return actual.major > minimum.major;
  if (actual.minor !== minimum.minor) return actual.minor > minimum.minor;
  if (actual.patch !== minimum.patch) return actual.patch > minimum.patch;
  return comparePreRelease(actual.pre, minimum.pre) >= 0;
}
