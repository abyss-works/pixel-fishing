// 바운티 헌팅 의뢰 템플릿 — 해역별 의뢰 행을 추가해 확장한다.
// 어종 목록은 어종 데이터의 id를 참조한다(복제 금지). 수량과 보상 수치는 이 데이터가 정본이다.
// 보상 스케일링 규칙: 난이도 보상 ≈ 그 난이도 의뢰들 판매가 평균의 15배(2026-10-17 하루 1회로 줄이며 5배 상향),
// 네임드 보상은 2026-10-17 기존의 10배다(구역 전설 수집·하루 1회 상한이 게이트).
import type { RarityId } from './rarity.js';

export type BountyZone = 'pacific' | 'seasia' | 'indian' | 'madagascar';
export type BountyDifficulty = 'easy' | 'normal' | 'hard' | 'named';

/** 라이선스 2단 — 난이도 3종과 네임드는 별개 축이다 */
export type BountyTier = 'basic' | 'named';

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

// spec 2절 — 라이선스 명성 (검증만, 차감 없음)
export const BOUNTY_LICENSE_FAME: Record<BountyZone, number> = {
  pacific: 1500,
  seasia: 20000,
  indian: 80000,
  madagascar: 300000,
};

const Q = (
  zone: BountyZone, difficulty: BountyDifficulty,
  grade: RarityId | null, targetFish: string | null,
  count: number, reward: number,
): BountyQuest => ({
  id: difficulty === 'named' ? `${zone}-named-${targetFish}` : `${zone}-${difficulty}-${grade}`,
  zone, difficulty, grade, targetFish, count, reward,
});

export const BOUNTIES: readonly BountyQuest[] = [
  // 1-1 태평양 — 쉬움 20000 · 보통 40000 · 어려움 80000 · 네임드 400000
  Q('pacific', 'easy', 'common', null, 250, 20000),
  Q('pacific', 'easy', 'rare', null, 10, 20000),
  Q('pacific', 'easy', 'epic', null, 2, 20000),
  Q('pacific', 'normal', 'common', null, 500, 40000),
  Q('pacific', 'normal', 'rare', null, 20, 40000),
  Q('pacific', 'normal', 'epic', null, 5, 40000),
  Q('pacific', 'normal', 'legendary', null, 1, 40000),
  Q('pacific', 'hard', 'common', null, 1000, 80000),
  Q('pacific', 'hard', 'rare', null, 40, 80000),
  Q('pacific', 'hard', 'epic', null, 10, 80000),
  Q('pacific', 'hard', 'legendary', null, 2, 80000),
  Q('pacific', 'named', null, 'megalodon', 1, 400000),
  // 1-2 동남아 — 쉬움 80000 · 보통 150000 · 어려움 300000 · 네임드 1500000
  Q('seasia', 'easy', 'common', null, 250, 80000),
  Q('seasia', 'easy', 'rare', null, 10, 80000),
  Q('seasia', 'easy', 'epic', null, 2, 80000),
  Q('seasia', 'normal', 'common', null, 500, 150000),
  Q('seasia', 'normal', 'rare', null, 20, 150000),
  Q('seasia', 'normal', 'epic', null, 5, 150000),
  Q('seasia', 'normal', 'legendary', null, 1, 150000),
  Q('seasia', 'hard', 'common', null, 1000, 300000),
  Q('seasia', 'hard', 'rare', null, 40, 300000),
  Q('seasia', 'hard', 'epic', null, 10, 300000),
  Q('seasia', 'hard', 'legendary', null, 2, 300000),
  Q('seasia', 'named', null, 'leviathan', 1, 1500000),
  // 1-3 인도양 — 쉬움 150000 · 보통 350000 · 어려움 700000 · 네임드 3500000
  Q('indian', 'easy', 'common', null, 250, 150000),
  Q('indian', 'easy', 'rare', null, 10, 150000),
  Q('indian', 'easy', 'epic', null, 2, 150000),
  Q('indian', 'normal', 'common', null, 500, 350000),
  Q('indian', 'normal', 'rare', null, 20, 350000),
  Q('indian', 'normal', 'epic', null, 5, 350000),
  Q('indian', 'normal', 'legendary', null, 1, 350000),
  Q('indian', 'hard', 'common', null, 1000, 700000),
  Q('indian', 'hard', 'rare', null, 40, 700000),
  Q('indian', 'hard', 'epic', null, 10, 700000),
  Q('indian', 'hard', 'legendary', null, 2, 700000),
  Q('indian', 'named', null, 'ananta', 1, 3500000),
  // 1-4 마다가스카르 — 쉬움 225000 · 보통 500000 · 어려움 1000000 · 네임드 5000000
  Q('madagascar', 'easy', 'common', null, 250, 225000),
  Q('madagascar', 'easy', 'rare', null, 10, 225000),
  Q('madagascar', 'easy', 'epic', null, 2, 225000),
  Q('madagascar', 'normal', 'common', null, 500, 500000),
  Q('madagascar', 'normal', 'rare', null, 20, 500000),
  Q('madagascar', 'normal', 'epic', null, 5, 500000),
  Q('madagascar', 'normal', 'legendary', null, 1, 500000),
  Q('madagascar', 'hard', 'common', null, 1000, 1000000),
  Q('madagascar', 'hard', 'rare', null, 40, 1000000),
  Q('madagascar', 'hard', 'epic', null, 10, 1000000),
  Q('madagascar', 'hard', 'legendary', null, 2, 1000000),
  Q('madagascar', 'named', null, 'elder-sixgill', 1, 5000000),
];

const BOUNTY_BY_ID = new Map(BOUNTIES.map(q => [q.id, q]));

/** id → 의뢰 행. 없는 id는 undefined (수주·납품 검증의 단일 출처) */
export const bountyById = (id: string): BountyQuest | undefined => BOUNTY_BY_ID.get(id);

/** 일일 의뢰 — 사람·날짜·해역·난이도당 1행. 해시 결정이라 DB 저장 없이
 *  클라·서버가 같은 값을 뽑는다. 난이도 내에서는 동일 확률이다. */
export function dailyQuestFor(
  zone: BountyZone, difficulty: BountyDifficulty, uid: string, day: string,
): BountyQuest | undefined {
  const pool = BOUNTIES.filter(q => q.zone === zone && q.difficulty === difficulty);
  if (pool.length === 0) return undefined;
  const s = `${uid}|${day}|${zone}|${difficulty}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return pool[h % pool.length];
}

/** 수배 창구가 있는 항구 → 담당 해역. 고향(home)은 없다 (spec 4절) */
export const BOUNTY_PORT_ZONE = {
  harbor: 'pacific',
  manila: 'seasia',
  colombo: 'indian',
  toamasina: 'madagascar',
} as const satisfies Record<string, BountyZone>;

export type BountyPort = keyof typeof BOUNTY_PORT_ZONE;

/** 수배 창구가 있는 항구인가 — 시설 화면과 수주 검증이 같은 표를 본다 */
export const isBountyPort = (port: string): port is BountyPort => port in BOUNTY_PORT_ZONE;

/** 담당 해역 — 수주 항구가 아니면 undefined (고향·필드) */
export const zoneOfPort = (port: string): BountyZone | undefined =>
  (BOUNTY_PORT_ZONE as Record<string, BountyZone>)[port];
