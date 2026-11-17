// 바운티 헌팅 의뢰 템플릿 — 해역별 의뢰 행을 추가해 확장한다.
// 어종 목록은 어종 데이터의 id를 참조한다(복제 금지). 수량과 보상 수치는 이 데이터가 정본이다.
// 보상 규칙: 구역 대표 방치 EV(구역 마지막 해역 딱렙)의 쉬움 1시간, 보통 2시간, 어려움 4시간,
// 네임드 8시간어치이며 5나 10 단위로 반올림한다. 값은 밸런스 도구로 산출한다.
import type { RarityId } from './rarity.js';

export type BountyZone = 'pacific' | 'seasia' | 'indian' | 'madagascar' | 'southatlantic';
export const BOUNTY_ZONES: readonly BountyZone[] = ['pacific', 'seasia', 'indian', 'madagascar', 'southatlantic'];
export type BountyDifficulty = 'easy' | 'normal' | 'hard' | 'named';

/** 라이선스 2단 — 난이도 3종과 네임드는 별개 축이다 */
export type BountyTier = 'basic' | 'named';

/** 의뢰의 갈래 — 일반 의뢰(난이도 3종)와 네임드 토벌. 하루 클리어 한도와 동시 수주를 갈래마다 따로 센다 */
export type BountyKind = 'general' | 'named';
export const BOUNTY_KINDS: readonly BountyKind[] = ['general', 'named'];
export const isBountyKind = (value: string): value is BountyKind => (BOUNTY_KINDS as readonly string[]).includes(value);

/** 의뢰 → 요구 라이선스. 네임드만 별도, 나머지는 기본 */
export const LICENSE_TIER_OF: Record<BountyDifficulty, BountyTier> = {
  easy: 'basic', normal: 'basic', hard: 'basic', named: 'named',
};

export interface BountyQuest {
  id: string;
  zone: BountyZone;
  difficulty: BountyDifficulty;
  /** 등급 의뢰의 대상 등급 — 네임드는 null(특정 어종 1종) */
  grade: RarityId | null;
  /** 네임드 전용 대상 어종 id — 수배 목록에서만 공개한다(도감 평시 미노출) */
  targetFish: string | null;
  count: number;   // 납품 수량 (spec 3절 수량표)
  reward: number;  // 납품 보상 골드 (spec 5절 보상표)
}

const Q = (
  zone: BountyZone, difficulty: BountyDifficulty,
  grade: RarityId | null, targetFish: string | null,
  count: number, reward: number,
): BountyQuest => ({
  id: difficulty === 'named' ? `${zone}-named-${targetFish}` : `${zone}-${difficulty}-${grade}`,
  zone, difficulty, grade, targetFish, count, reward,
});

export const BOUNTIES: readonly BountyQuest[] = [
  // 1-1 태평양 — 쉬움 15000 · 보통 25000 · 어려움 50000 · 네임드 100000
  Q('pacific', 'easy', 'common', null, 250, 15000),
  Q('pacific', 'easy', 'rare', null, 10, 15000),
  Q('pacific', 'easy', 'epic', null, 2, 15000),
  Q('pacific', 'normal', 'common', null, 500, 25000),
  Q('pacific', 'normal', 'rare', null, 20, 25000),
  Q('pacific', 'normal', 'epic', null, 5, 25000),
  Q('pacific', 'normal', 'legendary', null, 1, 25000),
  Q('pacific', 'hard', 'common', null, 1000, 50000),
  Q('pacific', 'hard', 'rare', null, 40, 50000),
  Q('pacific', 'hard', 'epic', null, 10, 50000),
  Q('pacific', 'hard', 'legendary', null, 2, 50000),
  Q('pacific', 'named', null, 'megalodon', 1, 100000),
  // 1-2 동남아 — 쉬움 60000 · 보통 100000 · 어려움 250000 · 네임드 500000
  Q('seasia', 'easy', 'common', null, 250, 60000),
  Q('seasia', 'easy', 'rare', null, 10, 60000),
  Q('seasia', 'easy', 'epic', null, 2, 60000),
  Q('seasia', 'normal', 'common', null, 500, 100000),
  Q('seasia', 'normal', 'rare', null, 20, 100000),
  Q('seasia', 'normal', 'epic', null, 5, 100000),
  Q('seasia', 'normal', 'legendary', null, 1, 100000),
  Q('seasia', 'hard', 'common', null, 1000, 250000),
  Q('seasia', 'hard', 'rare', null, 40, 250000),
  Q('seasia', 'hard', 'epic', null, 10, 250000),
  Q('seasia', 'hard', 'legendary', null, 2, 250000),
  Q('seasia', 'named', null, 'leviathan', 1, 500000),
  // 1-3 인도양 — 쉬움 200000 · 보통 350000 · 어려움 750000 · 네임드 1500000
  Q('indian', 'easy', 'common', null, 250, 200000),
  Q('indian', 'easy', 'rare', null, 10, 200000),
  Q('indian', 'easy', 'epic', null, 2, 200000),
  Q('indian', 'normal', 'common', null, 500, 350000),
  Q('indian', 'normal', 'rare', null, 20, 350000),
  Q('indian', 'normal', 'epic', null, 5, 350000),
  Q('indian', 'normal', 'legendary', null, 1, 350000),
  Q('indian', 'hard', 'common', null, 1000, 750000),
  Q('indian', 'hard', 'rare', null, 40, 750000),
  Q('indian', 'hard', 'epic', null, 10, 750000),
  Q('indian', 'hard', 'legendary', null, 2, 750000),
  Q('indian', 'named', null, 'ananta', 1, 1500000),
  // 1-4 마다가스카르 — 쉬움 700000 · 보통 1500000 · 어려움 3000000 · 네임드 5500000
  Q('madagascar', 'easy', 'common', null, 250, 700000),
  Q('madagascar', 'easy', 'rare', null, 10, 700000),
  Q('madagascar', 'easy', 'epic', null, 2, 700000),
  Q('madagascar', 'normal', 'common', null, 500, 1500000),
  Q('madagascar', 'normal', 'rare', null, 20, 1500000),
  Q('madagascar', 'normal', 'epic', null, 5, 1500000),
  Q('madagascar', 'normal', 'legendary', null, 1, 1500000),
  Q('madagascar', 'hard', 'common', null, 1000, 3000000),
  Q('madagascar', 'hard', 'rare', null, 40, 3000000),
  Q('madagascar', 'hard', 'epic', null, 10, 3000000),
  Q('madagascar', 'hard', 'legendary', null, 2, 3000000),
  Q('madagascar', 'named', null, 'elder-sixgill', 1, 5500000),
  // 1-5 남대서양 — 쉬움 3000000 · 보통 5500000 · 어려움 10000000 · 네임드 25000000
  Q('southatlantic', 'easy', 'common', null, 250, 3000000),
  Q('southatlantic', 'easy', 'rare', null, 10, 3000000),
  Q('southatlantic', 'easy', 'epic', null, 2, 3000000),
  Q('southatlantic', 'normal', 'common', null, 500, 5500000),
  Q('southatlantic', 'normal', 'rare', null, 20, 5500000),
  Q('southatlantic', 'normal', 'epic', null, 5, 5500000),
  Q('southatlantic', 'normal', 'legendary', null, 1, 5500000),
  Q('southatlantic', 'hard', 'common', null, 1000, 10000000),
  Q('southatlantic', 'hard', 'rare', null, 40, 10000000),
  Q('southatlantic', 'hard', 'epic', null, 10, 10000000),
  Q('southatlantic', 'hard', 'legendary', null, 2, 10000000),
  Q('southatlantic', 'named', null, 'adamastor', 1, 25000000),
  Q('southatlantic', 'named', null, 'jasconius', 1, 25000000),
];

/** 의뢰 → 갈래. 네임드만 따로이고 나머지 난이도는 일반 의뢰다 */
export const bountyKindOf = (quest: Pick<BountyQuest, 'difficulty'>): BountyKind =>
  quest.difficulty === 'named' ? 'named' : 'general';

const BOUNTY_BY_ID = new Map(BOUNTIES.map(q => [q.id, q]));

/** id → 의뢰 행. 없는 id는 undefined (수주·납품 검증의 단일 출처) */
export const bountyById = (id: string): BountyQuest | undefined => BOUNTY_BY_ID.get(id);

/** 일일 의뢰 — 일반 난이도의 사람·날짜·해역·난이도당 1행. 네임드는 해시로 뽑지 않는다(offeredQuestsFor). 해시 결정이라 DB 저장 없이
 *  클라·서버가 같은 값을 뽑는다. 난이도 내에서는 동일 확률이다. */
export function dailyQuestFor(
  zone: BountyZone, difficulty: Exclude<BountyDifficulty, 'named'>, uid: string, day: string,
): BountyQuest | undefined {
  const pool = BOUNTIES.filter(q => q.zone === zone && q.difficulty === difficulty);
  if (pool.length === 0) return undefined;
  const s = `${uid}|${day}|${zone}|${difficulty}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return pool[h % pool.length];
}

/** 수배판에 내는 의뢰 — 일반 난이도는 일일 의뢰 한 건이고, 네임드는 구역의 네임드마다 한 항목을 모두 낸다.
 *  네임드가 둘인 구역(남대서양)은 두 항목을 내고 플레이어가 그 안에서 고른다 */
export function offeredQuestsFor(
  zone: BountyZone, difficulty: BountyDifficulty, uid: string, day: string,
): BountyQuest[] {
  if (difficulty === 'named') return BOUNTIES.filter(q => q.zone === zone && q.difficulty === 'named');
  const daily = dailyQuestFor(zone, difficulty, uid, day);
  return daily ? [daily] : [];
}

/** 그날 그 사람에게 수배판이 낸 의뢰인가 — 수주 검증이 쓰는 단일 판정 */
export const isQuestOffered = (quest: BountyQuest, uid: string, day: string): boolean =>
  offeredQuestsFor(quest.zone, quest.difficulty, uid, day).some(q => q.id === quest.id);

/** 수배 창구가 있는 항구 → 담당 해역. 고향(home)은 없다 (spec 4절) */
export const BOUNTY_PORT_ZONE = {
  harbor: 'pacific',
  manila: 'seasia',
  colombo: 'indian',
  toamasina: 'madagascar',
  walvisbay: 'southatlantic',
} as const satisfies Record<string, BountyZone>;

export type BountyPort = keyof typeof BOUNTY_PORT_ZONE;

/** 수배 창구가 있는 항구인가 — 시설 화면과 수주 검증이 같은 표를 본다 */
export const isBountyPort = (port: string): port is BountyPort => port in BOUNTY_PORT_ZONE;

/** 담당 해역 — 수주 항구가 아니면 undefined (고향·필드) */
export const zoneOfPort = (port: string): BountyZone | undefined =>
  (BOUNTY_PORT_ZONE as Record<string, BountyZone>)[port];

const PORT_OF_ZONE = new Map<BountyZone, BountyPort>(
  (Object.keys(BOUNTY_PORT_ZONE) as BountyPort[]).map(port => [BOUNTY_PORT_ZONE[port], port]),
);

/** 해역의 수배 창구 항구 — zoneOfPort의 역. 창구가 없는 해역이면 undefined */
export const portOfZone = (zone: BountyZone): BountyPort | undefined => PORT_OF_ZONE.get(zone);
