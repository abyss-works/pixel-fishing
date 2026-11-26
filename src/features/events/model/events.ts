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
import type { GameState } from '../../../game/rules/logic';
import type {
  EventChampionshipState,
  EventDrawState,
  EventLeaderboardRow,
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
  podium: readonly EventPodiumEntry[];
  rows: readonly EventRankRowView[];
  myRow: EventRankMeView | null;
  normalHat: EventHatBannerItem;
  variantHat: EventHatBannerItem;
  dex: readonly EventDexEntryView[];
}

export interface EventDrawDayView {
  day: string;
  label: string;
  fortuneName: string | null;
  fortuneShort: string | null;
  kind: NonNullable<EventDrawState['days'][number]['kind']> | null;
  index: 3 | 5 | null;
  score: number | null;
  attended: boolean;
}

export interface EventDrawView {
  title: string;
  summary: string;
  remainingText: string;
  totalScore: number;
  attendedDays: number;
  rank: number | null;
  won: boolean;
  podium: readonly EventPodiumEntry[];
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

/** HUD 이벤트 버튼 빨간 점 표시 여부 — 미수령 당첨이나 정산할 보상이 있으면 true */
export function hasEventsAlert(snap: EventsSnapshot | null, account: AccountLockState): boolean {
  if (account !== 'account' || !snap) return false;
  const trioReady = Boolean(snap.trio?.won && !snap.trio.claimedAt);
  const champReady = (snap.championship?.pendingGold ?? 0) > 0 || (snap.championship?.pendingFame ?? 0) > 0;
  return trioReady || champReady;
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

export function selectEventList(snap: EventsSnapshot, account: AccountLockState): EventListItemView[] {
  return snap.events.map(ev => {
    const badges: EventBadgeView[] = [];
    let hasAlert = false;
    if (ev.kind === 'trio') {
      const s = snap.trio;
      if (s?.won) {
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
    return {
      id: ev.id,
      kind: ev.kind,
      title: ev.title,
      summary: ev.description || KIND_DEFAULT_SUMMARY[ev.kind],
      remainingText: remainingDaysText(ev.endsAt, snap.now),
      badges,
      hasAlert,
      glyph: KIND_GLYPH[ev.kind],
    };
  });
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
  podium: EventPodiumEntry[];
  rows: EventRankRowView[];
  myRow: EventRankMeView | null;
} {
  const sorted = [...top].sort((a, b) => a.rank - b.rank);
  const byPlace = new Map<number, EventLeaderboardRow>();
  for (const r of sorted) {
    if (r.rank >= 1 && r.rank <= 3 && !byPlace.has(r.rank)) byPlace.set(r.rank, r);
  }
  // 시상대는 2위 - 1위 - 3위 순서로 가운데 1위가 가장 높게 선다
  const order: (2 | 1 | 3)[] = [2, 1, 3];
  const podium: EventPodiumEntry[] = [];
  for (const place of order) {
    const row = byPlace.get(place);
    if (!row) continue;
    podium.push({
      place,
      nickname: row.nickname ?? '이름 없음',
      score: row.score,
      look: row.look ?? DEFAULT_LOOK,
      me: row.me,
    });
  }
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

export function selectEventDrawView(
  ev: LiveEventSummary,
  state: EventDrawState | null,
  now: string,
  myNickname: string | null = null,
): EventDrawView {
  const totalScore = state?.totalScore ?? 0;
  const board = buildLeaderboardSections(state?.top ?? [], state?.rank ?? null, totalScore, myNickname);
  const days: EventDrawDayView[] = (state?.days ?? []).map(d => {
    const hasFortune = d.kind !== null && d.index !== null;
    const f = hasFortune ? { day: d.day, kind: d.kind!, index: d.index! } : null;
    return {
      day: d.day,
      label: formatShortDay(d.day),
      fortuneName: f ? fortuneName(f) : null,
      fortuneShort: f ? fortuneShortName(f) : null,
      kind: d.kind,
      index: d.index,
      score: d.score,
      attended: d.score !== null,
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
