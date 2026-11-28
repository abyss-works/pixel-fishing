import { boatNameOf } from '../../../game/content/boats';
import {
  EVENT1_TRIO_TARGETS,
  EVENT2_SETTLEMENT_RATES,
  EVENT2_STANDARD_SPEC,
  EVENT_FISH,
  EVENT_HAT_IDS,
  eventFishById,
  type EventFish,
} from '../../../game/content/eventFish';
import { fishById, type Fish, type FormId } from '../../../game/content/fish';
import type { RarityId } from '../../../game/content/rarity';
import { spotById, type Spot, type SpotId } from '../../../game/content/spots';
import { DEFAULT_LOOK, hatById, type Look } from '../../../game/content/wardrobe';
import { topZoneOfSpot, zoneById } from '../../../game/content/zones';
import type { GameState } from '../../../game/rules/logic';
import { gameDayOf } from '../../../game/rules/time';
import type {
  EventChampionshipState,
  EventDrawState,
  EventLeaderboardRow,
  EventLuckDayStamp,
  EventTrioState,
  EventsSnapshot,
  LiveEventKind,
  LiveEventSummary,
} from '../../../platform/api';
import type { AccountLockState } from '../../display/model/menuLock';
import { UNVERIFIED_LOCK_TEXT } from '../../display/model/menuLock';
import { fortuneName, fortuneShortName } from '../../fortune/model/fortune';

export interface EventBadgeView {
  label: string;
  tone: 'gold' | 'accent' | 'dim';
}

export interface EventListItemView {
  id: string;
  kind: LiveEventKind;
  title: string;
  summary: string;
  remainingText: string;
  badges: readonly EventBadgeView[];
  hasAlert: boolean;
  glyph: 'trophy' | 'fish' | 'clover';
}

export interface EventTrioSlotView {
  fishId: string;
  fish: Fish | null;
  name: string;
  rarity: RarityId;
  form: FormId;
  formLabel: string;
  habitatLabel: string;
  completed: boolean;
  completedAt: string | null;
}

export interface EventTrioView {
  title: string;
  summary: string;
  remainingText: string;
  statusLabel: string;
  statusTone: 'gold' | 'accent';
  doneCount: number;
  totalCount: number;
  slots: readonly EventTrioSlotView[];
  completed: boolean;
  won: boolean;
  rewardPin: string | null;
  expiryText: string | null;
}

export interface EventPodiumEntry {
  place: 1 | 2 | 3;
  nickname: string;
  score: number;
  look: Look;
  me: boolean;
}

export interface EventPodiumSlot {
  place: 1 | 2 | 3;
  entry: EventPodiumEntry | null;
}

export interface EventRankRowView {
  rank: number;
  nickname: string;
  score: number;
  me: boolean;
}

export interface EventRankMeView {
  rank: number;
  nickname: string;
  score: number;
}

export interface EventHatBannerItem {
  id: string;
  name: string;
  form: FormId;
  owned: boolean;
  count: number;
  total: number;
}

export interface EventDexEntryView {
  id: string;
  rarity: RarityId;
  fish: Fish;
  normalName: string;
  variantName: string;
  normalScore: number;
  variantScore: number;
  normalLore: string;
  variantLore: string;
  normalCount: number;
  variantCount: number;
  normalCaught: boolean;
  variantCaught: boolean;
}

export interface EventChampionshipView {
  title: string;
  summary: string;
  remainingText: string;
  inEventZone: boolean;
  rank: number | null;
  score: number;
  catches: number;
  pendingGold: number;
  pendingFame: number;
  canSettle: boolean;
  boatTier: number;
  boatName: string;
  idleRate: number;
  manualRate: number;
  fameRate: number;
  podium: readonly EventPodiumSlot[];
  rows: readonly EventRankRowView[];
  myRow: EventRankMeView | null;
  normalHat: EventHatBannerItem;
  variantHat: EventHatBannerItem;
  dex: readonly EventDexEntryView[];
}

export type EventDrawDayStatus = 'attended' | 'missed' | 'upcoming';

export interface EventDrawDayView {
  day: string;
  label: string;
  fortuneName: string | null;
  fortuneShort: string | null;
  kind: NonNullable<EventDrawState['days'][number]['kind']> | null;
  index: 3 | 5 | null;
  score: number | null;
  attended: boolean;
  status: EventDrawDayStatus;
}

export interface EventDrawView {
  title: string;
  summary: string;
  remainingText: string;
  totalScore: number;
  attendedDays: number;
  rank: number | null;
  won: boolean;
  podium: readonly EventPodiumSlot[];
  rows: readonly EventRankRowView[];
  myRow: EventRankMeView | null;
  days: readonly EventDrawDayView[];
}

export const EVENT2_STANDARD_SPEC_VIEW = {
  rodLevel: EVENT2_STANDARD_SPEC.rodLevel,
  power: EVENT2_STANDARD_SPEC.power,
  biteRangeText: `${EVENT2_STANDARD_SPEC.biteMinSec}~${EVENT2_STANDARD_SPEC.biteMaxSec}초`,
  idleBoost: EVENT2_STANDARD_SPEC.idleBoost,
  variantEv: EVENT2_STANDARD_SPEC.variantEv,
} as const;

export const EVENT_SCORE_TIERS: readonly { rarity: RarityId; score: number }[] = [
  { rarity: 'common', score: 10 },
  { rarity: 'rare', score: 30 },
  { rarity: 'epic', score: 100 },
  { rarity: 'legendary', score: 400 },
];

export const EVENTS_GATE_COPY = {
  guestTitle: '계정 연결 필요',
  guestDesc: '구글 계정을 연결하면 이벤트에 참여할 수 있어요.',
  guestAction: '구글 계정 연결',
  unverifiedDesc: UNVERIFIED_LOCK_TEXT,
} as const;

export const EVENT2_UPGRADE_TIP =
  '보상은 현재 배 단계에 따라 결정돼요. 골드가 쌓이는 대로 틈틈이 배를 업그레이드해 주세요.';

function toEventFishSpriteSubject(ef: EventFish): Fish {
  return {
    id: ef.id,
    name: ef.name,
    spot: 'championship' as SpotId,
    rarity: ef.rarity,
    price: ef.score,
    color: ef.color,
    shape: ef.shape,
    lore: ef.lore,
    variant: {
      name: ef.variant.name,
      color: ef.variant.color,
      lore: ef.variant.lore,
    },
  };
}

const EVENT_FISH_SUBJECTS: readonly { raw: EventFish; sprite: Fish }[] = EVENT_FISH.map(raw => ({
  raw,
  sprite: toEventFishSpriteSubject(raw),
}));

export function eventSpotById(id: SpotId): Spot | undefined {
  return spotById(id);
}

export function eventFishSubjectById(id: string): Fish | undefined {
  const ef = eventFishById(id);
  return ef ? toEventFishSpriteSubject(ef) : undefined;
}

/** KST 기준 남은 일수를 계산한다 */
export function remainingDaysText(endsAt: string, now: string): string {
  const endMs = Date.parse(endsAt);
  const nowMs = Date.parse(now);
  if (Number.isNaN(endMs) || Number.isNaN(nowMs)) return '';
  const diff = endMs - nowMs;
  if (diff <= 0) return '오늘 마감';
  const days = Math.ceil(diff / 86_400_000);
  return `${days}일 남음`;
}

/** ISO 시각을 한국 날짜 문구로 바꾼다 (예: 2026년 12월 31일까지) */
export function formatEventExpiryText(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const kst = new Date(ms + 9 * 3_600_000);
  return `${kst.getUTCFullYear()}년 ${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일까지`;
}

function formatShortDay(day: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  return `${Number(m[1])}/${Number(m[2])}`;
}

export type EventLifecycleStatus = 'active' | 'upcoming' | 'ended';

/** 이벤트 활성 여부와 시작·종료 시각 구간을 함께 판정한다 */
export function eventLifecycleStatus(
  ev: Pick<LiveEventSummary, 'active' | 'startsAt' | 'endsAt'>,
  nowMs: number = Date.now(),
): EventLifecycleStatus {
  if (!ev.active) return 'ended';
  const startMs = Date.parse(ev.startsAt);
  const endMs = Date.parse(ev.endsAt);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return 'ended';
  if (nowMs < startMs) return 'upcoming';
  if (nowMs >= endMs) return 'ended';
  return 'active';
}

export function isEventLiveNow(
  ev: Pick<LiveEventSummary, 'active' | 'startsAt' | 'endsAt'>,
  nowMs: number = Date.now(),
): boolean {
  return eventLifecycleStatus(ev, nowMs) === 'active';
}

function resolveNowMs(snap: Pick<EventsSnapshot, 'now'> | null | undefined, nowMs?: number): number {
  if (nowMs !== undefined) return nowMs;
  const parsed = snap?.now ? Date.parse(snap.now) : Number.NaN;
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

export function hasActiveEvents(snap: EventsSnapshot | null, nowMs?: number): boolean {
  if (!snap) return false;
  const resolved = resolveNowMs(snap, nowMs);
  return snap.events.some(ev => isEventLiveNow(ev, resolved));
}

function upcomingStartsText(startsAt: string, nowMs: number): string {
  const startMs = Date.parse(startsAt);
  if (Number.isNaN(startMs) || startMs <= nowMs) return '시작 전';
  const days = Math.ceil((startMs - nowMs) / 86_400_000);
  return `${days}일 후 시작`;
}

/** HUD 이벤트 버튼 빨간 점 표시 여부 — 미수령 당첨(교환권 확정)이나 정산할 보상이 있으면 true */
export function hasEventsAlert(
  snap: EventsSnapshot | null,
  account: AccountLockState,
  nowMs?: number,
): boolean {
  if (account !== 'account' || !snap) return false;
  return selectEventList(snap, account, nowMs).some(item => item.hasAlert);
}

const KIND_GLYPH: Record<LiveEventKind, EventListItemView['glyph']> = {
  trio: 'trophy',
  championship: 'fish',
  draw: 'clover',
};

const KIND_DEFAULT_SUMMARY: Record<LiveEventKind, string> = {
  trio: '목표 어종 3마리를 모두 낚으면 상품권 추첨에 자동 응모돼요.',
  championship: '분지 호수에서 전용 어종을 낚아 순위와 정산 보상을 노려 보세요.',
  draw: '매일의 운세 점수를 쌓아 행운왕 순위에 도전하세요.',
};

export function selectEventList(
  snap: EventsSnapshot,
  account: AccountLockState,
  nowMs?: number,
): EventListItemView[] {
  const resolvedNow = resolveNowMs(snap, nowMs);
  const nowIso = new Date(resolvedNow).toISOString();
  return snap.events.map(ev => {
    const status = eventLifecycleStatus(ev, resolvedNow);
    const badges: EventBadgeView[] = [];
    let hasAlert = false;
    let remainingText = '';

    if (status === 'upcoming') {
      badges.push({ label: '진행 예정', tone: 'dim' });
      remainingText = upcomingStartsText(ev.startsAt, resolvedNow);
    } else if (status === 'ended') {
      badges.push({ label: '종료', tone: 'dim' });
      remainingText = '';
      if (ev.kind === 'trio') {
        const s = snap.trio;
        if (s?.won && s.rewardPin) {
          badges.push({ label: '당첨 확정', tone: 'gold' });
          hasAlert = account === 'account' && !s.claimedAt;
        } else if (s?.completedAt) {
          badges.push({ label: '응모 완료', tone: 'accent' });
        }
      } else if (ev.kind === 'championship') {
        const s = snap.championship;
        if (s?.rank) badges.push({ label: `${s.rank}위`, tone: 'accent' });
        if ((s?.pendingGold ?? 0) > 0 || (s?.pendingFame ?? 0) > 0) {
          badges.push({ label: '정산 가능', tone: 'gold' });
          hasAlert = account === 'account';
        }
      } else {
        const s = snap.draw;
        if (s?.won) badges.push({ label: '당첨 확정', tone: 'gold' });
        else if (s?.rank) badges.push({ label: `${s.rank}위`, tone: 'accent' });
        if (s && s.attendedDays > 0) {
          badges.push({ label: `${s.attendedDays}일 출석`, tone: 'gold' });
        }
      }
    } else {
      remainingText = remainingDaysText(ev.endsAt, nowIso);
      if (ev.kind === 'trio') {
        const s = snap.trio;
        if (s?.won && s.rewardPin) {
          badges.push({ label: '당첨 확정', tone: 'gold' });
          hasAlert = account === 'account' && !s.claimedAt;
        } else if (s?.completedAt) {
          badges.push({ label: '응모 완료', tone: 'accent' });
        } else {
          const done = s ? s.slots.filter(slot => slot.completed).length : 0;
          const total = s ? s.slots.length : EVENT1_TRIO_TARGETS.length;
          badges.push({ label: `${done} / ${total}`, tone: 'gold' });
          badges.push({ label: '진행 중', tone: 'accent' });
        }
      } else if (ev.kind === 'championship') {
        const s = snap.championship;
        badges.push({ label: s?.rank ? `${s.rank}위` : '진행 중', tone: 'accent' });
        if ((s?.pendingGold ?? 0) > 0 || (s?.pendingFame ?? 0) > 0) {
          badges.push({ label: '정산 가능', tone: 'gold' });
          hasAlert = account === 'account';
        }
      } else {
        const s = snap.draw;
        badges.push({ label: s?.rank ? `${s.rank}위` : '진행 중', tone: 'accent' });
        if (s && s.attendedDays > 0) {
          badges.push({ label: `${s.attendedDays}일 출석`, tone: 'gold' });
        }
      }
    }

    return {
      id: ev.id,
      kind: ev.kind,
      title: ev.title,
      summary: ev.description || KIND_DEFAULT_SUMMARY[ev.kind],
      remainingText,
      badges,
      hasAlert,
      glyph: KIND_GLYPH[ev.kind],
    };
  });
}

/** 어종의 출현 구역과 수역, 밤 조건을 UI 문구 형식으로 조합한다 */
export function formatFishHabitat(fish: Fish | null): string {
  if (!fish) return '';
  const spotName = spotById(fish.spot)?.name;
  if (!spotName) return '';
  const topZoneId = topZoneOfSpot(fish.spot);
  const zoneShort = topZoneId ? zoneById(topZoneId)?.shortName : undefined;
  const needsPrefix =
    Boolean(zoneShort)
    && !spotName.includes(zoneShort!)
    && !(topZoneId === 'village' && spotName.startsWith('마을'));
  if (needsPrefix) {
    return fish.night ? `${zoneShort} (${spotName}, 밤)` : `${zoneShort} (${spotName})`;
  }
  return fish.night ? `${spotName} (밤)` : spotName;
}

export function selectEventTrioView(
  ev: LiveEventSummary,
  state: EventTrioState | null,
  now: string,
): EventTrioView {
  const rawSlots = state?.slots.length ? state.slots : EVENT1_TRIO_TARGETS.map(t => ({
    fishId: t.fishId,
    form: t.form,
    completed: false,
    completedAt: null,
  }));
  const slots: EventTrioSlotView[] = rawSlots.map(slot => {
    const fish = fishById(slot.fishId) ?? null;
    const form: FormId = slot.form === 'variant' ? 'variant' : 'normal';
    const name = fish ? (form === 'variant' ? fish.variant.name : fish.name) : slot.fishId;
    return {
      fishId: slot.fishId,
      fish,
      name,
      rarity: fish?.rarity ?? 'common',
      form,
      formLabel: form === 'variant' ? '돌연변이' : '일반',
      habitatLabel: formatFishHabitat(fish),
      completed: slot.completed,
      completedAt: slot.completedAt,
    };
  });
  const doneCount = slots.filter(s => s.completed).length;
  const totalCount = slots.length;
  const won = Boolean(state?.won);
  const completed = Boolean(state?.completedAt) || doneCount === totalCount;
  const statusLabel = won ? '당첨 확정' : completed ? '응모 완료' : `${doneCount} / ${totalCount}`;
  const statusTone: 'gold' | 'accent' = won || !completed ? 'gold' : 'accent';
  return {
    title: ev.title,
    summary: ev.description || KIND_DEFAULT_SUMMARY.trio,
    remainingText: remainingDaysText(ev.endsAt, now),
    statusLabel,
    statusTone,
    doneCount,
    totalCount,
    slots,
    completed,
    won,
    rewardPin: state?.rewardPin ?? null,
    expiryText: formatEventExpiryText(state?.rewardExpiresAt ?? null),
  };
}

function buildLeaderboardSections(
  top: readonly EventLeaderboardRow[],
  myRank: number | null,
  myScore: number,
  myNickname: string | null,
): {
  podium: EventPodiumSlot[];
  rows: EventRankRowView[];
  myRow: EventRankMeView | null;
} {
  const sorted = [...top].sort((a, b) => a.rank - b.rank);
  const byPlace = new Map<number, EventLeaderboardRow>();
  for (const r of sorted) {
    if (r.rank >= 1 && r.rank <= 3 && !byPlace.has(r.rank)) byPlace.set(r.rank, r);
  }
  // 시상대는 2위 - 1위 - 3위 순서로 가운데 1위가 가장 높게 서며, 빈 자리는 명시적 null 슬롯으로 둔다
  const order: (2 | 1 | 3)[] = [2, 1, 3];
  const podium: EventPodiumSlot[] = order.map(place => {
    const row = byPlace.get(place);
    return {
      place,
      entry: row
        ? {
            place,
            nickname: row.nickname ?? '이름 없음',
            score: row.score,
            look: row.look ?? DEFAULT_LOOK,
            me: row.me,
          }
        : null,
    };
  });
  const rows: EventRankRowView[] = sorted
    .filter(r => r.rank > 3)
    .map(r => ({
      rank: r.rank,
      nickname: r.nickname ?? '이름 없음',
      score: r.score,
      me: r.me,
    }));
  const meFromTop = sorted.find(r => r.me);
  const resolvedRank = meFromTop?.rank ?? myRank;
  const resolvedScore = meFromTop?.score ?? myScore;
  const resolvedNick = meFromTop?.nickname ?? myNickname ?? '나';
  const myRow = resolvedRank !== null
    ? { rank: resolvedRank, nickname: resolvedNick, score: resolvedScore }
    : null;
  return { podium, rows, myRow };
}

export function selectEventChampionshipView(
  ev: LiveEventSummary,
  state: EventChampionshipState | null,
  game: Pick<GameState, 'boat' | 'hats' | 'location'>,
  now: string,
  myNickname: string | null = null,
): EventChampionshipView {
  const tier = Math.max(0, Math.min(EVENT2_SETTLEMENT_RATES.idle.length - 1, game.boat));
  const pendingGold = state?.pendingGold ?? 0;
  const pendingFame = state?.pendingFame ?? 0;
  const score = state?.score ?? 0;
  const board = buildLeaderboardSections(state?.top ?? [], state?.rank ?? null, score, myNickname);

  const ownedHats = new Set([...game.hats, ...(state?.hatsGranted ?? [])]);
  const dexMap = state?.dex ?? {};
  const dex: EventDexEntryView[] = EVENT_FISH_SUBJECTS.map(({ raw, sprite }) => {
    const rec = dexMap[raw.id];
    const normalCount = rec?.normal ?? 0;
    const variantCount = rec?.variant ?? 0;
    return {
      id: raw.id,
      rarity: raw.rarity,
      fish: sprite,
      normalName: raw.name,
      variantName: raw.variant.name,
      normalScore: raw.score,
      variantScore: raw.variant.score,
      normalLore: raw.lore,
      variantLore: raw.variant.lore,
      normalCount,
      variantCount,
      normalCaught: normalCount > 0,
      variantCaught: variantCount > 0,
    };
  });

  const normalDone = dex.filter(d => d.normalCaught).length;
  const variantDone = dex.filter(d => d.variantCaught).length;
  const normalHatMeta = hatById(EVENT_HAT_IDS.normal);
  const variantHatMeta = hatById(EVENT_HAT_IDS.variant);

  return {
    title: ev.title,
    summary: ev.description || KIND_DEFAULT_SUMMARY.championship,
    remainingText: remainingDaysText(ev.endsAt, now),
    inEventZone: game.location.kind === 'region' && game.location.id === 'championship',
    rank: board.myRow?.rank ?? null,
    score,
    catches: state?.catches ?? 0,
    pendingGold,
    pendingFame,
    canSettle: pendingGold > 0 || pendingFame > 0,
    boatTier: tier,
    boatName: boatNameOf(tier),
    idleRate: EVENT2_SETTLEMENT_RATES.idle[tier],
    manualRate: EVENT2_SETTLEMENT_RATES.manual[tier],
    fameRate: EVENT2_SETTLEMENT_RATES.fame,
    podium: board.podium,
    rows: board.rows,
    myRow: board.myRow,
    normalHat: {
      id: EVENT_HAT_IDS.normal,
      name: normalHatMeta?.name ?? '천지 강태공 삿갓',
      form: 'normal',
      owned: ownedHats.has(EVENT_HAT_IDS.normal),
      count: normalDone,
      total: dex.length,
    },
    variantHat: {
      id: EVENT_HAT_IDS.variant,
      name: variantHatMeta?.name ?? '천년 비늘 왕관',
      form: 'variant',
      owned: ownedHats.has(EVENT_HAT_IDS.variant),
      count: variantDone,
      total: dex.length,
    },
    dex,
  };
}

const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function configEventDays(config?: Record<string, unknown> | null): string[] | null {
  const rawDays = config?.days;
  if (Array.isArray(rawDays) && rawDays.length > 0 && rawDays.every(d => typeof d === 'string' && DATE_RE.test(d))) {
    return [...new Set(rawDays)].sort();
  }
  return null;
}

function enumerateEventDays(startsAt: string, endsAt: string): string[] | null {
  const startMs = Date.parse(startsAt);
  const endMs = Date.parse(endsAt);
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) return null;
  const startDay = gameDayOf(new Date(startMs).toISOString());
  const lastDay = gameDayOf(new Date(endMs - 1).toISOString());
  let cursorMs = Date.parse(`${startDay}T00:00:00.000Z`);
  const lastMs = Date.parse(`${lastDay}T00:00:00.000Z`);
  if (Number.isNaN(cursorMs) || Number.isNaN(lastMs) || cursorMs > lastMs) return null;
  const out: string[] = [];
  while (cursorMs <= lastMs && out.length < 366) {
    out.push(new Date(cursorMs).toISOString().slice(0, 10));
    cursorMs += DAY_MS;
  }
  return out;
}

export function selectEventDrawView(
  ev: LiveEventSummary,
  state: EventDrawState | null,
  now: string,
  myNickname: string | null = null,
): EventDrawView {
  const totalScore = state?.totalScore ?? 0;
  const board = buildLeaderboardSections(state?.top ?? [], state?.rank ?? null, totalScore, myNickname);
  const stateDays = state?.days ?? [];
  const dayMap = new Map<string, EventLuckDayStamp>();
  for (const d of stateDays) dayMap.set(d.day, d);
  const enumeratedDays = configEventDays(ev.config) ?? enumerateEventDays(ev.startsAt, ev.endsAt);
  const mergedDays: readonly EventLuckDayStamp[] = enumeratedDays
    ? enumeratedDays.map(day => dayMap.get(day) ?? { day, kind: null, index: null, score: null })
    : stateDays;
  const parsedNow = Date.parse(now);
  const currentDay = Number.isNaN(parsedNow) ? null : gameDayOf(new Date(parsedNow).toISOString());
  const days: EventDrawDayView[] = mergedDays.map(d => {
    const hasFortune = d.kind !== null && d.index !== null;
    const f = hasFortune ? { day: d.day, kind: d.kind!, index: d.index! } : null;
    const status: EventDrawDayStatus =
      d.score !== null
        ? 'attended'
        : currentDay !== null && d.day >= currentDay
          ? 'upcoming'
          : 'missed';
    return {
      day: d.day,
      label: formatShortDay(d.day),
      fortuneName: f ? fortuneName(f) : null,
      fortuneShort: f ? fortuneShortName(f) : null,
      kind: d.kind,
      index: d.index,
      score: d.score,
      attended: status === 'attended',
      status,
    };
  });
  return {
    title: ev.title,
    summary: ev.description || KIND_DEFAULT_SUMMARY.draw,
    remainingText: remainingDaysText(ev.endsAt, now),
    totalScore,
    attendedDays: state?.attendedDays ?? 0,
    rank: board.myRow?.rank ?? null,
    won: Boolean(state?.won),
    podium: board.podium,
    rows: board.rows,
    myRow: board.myRow,
    days,
  };
}
