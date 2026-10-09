// 현상금 의뢰 템플릿 — 해역 추가 = 여기 행 추가 (무결성은 bounties.test가 자동 검증).
// 어종 목록은 fish.ts의 id를 참조한다(복제 금지). 수치는 spec/bounty-hunting.md가
// 정본이다 — 여기 값을 바꾸는 게 아니라 spec 표를 먼저 고친다.
// 1-4 대서양은 템플릿 예시로만 둔다(노선 재검토 상태라 행을 심지 않는다).
// 1-2·1-3 네임드 어종은 미설계라 네임드 행은 1-1(메갈로돈)만 있다.
import type { RarityId } from './rarity.js';

export type BountyZone = 'pacific' | 'seasia' | 'indian';
export type BountyDifficulty = 'easy' | 'normal' | 'hard' | 'named';

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
  seasia: 15000,
  indian: 70000,
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
  // 1-1 태평양 — 쉬움 500 · 보통 1500 · 어려움 4000 · 네임드 8000
  Q('pacific', 'easy', 'common', null, 250, 500),
  Q('pacific', 'easy', 'rare', null, 10, 500),
  Q('pacific', 'easy', 'epic', null, 2, 500),
  Q('pacific', 'normal', 'common', null, 500, 1500),
  Q('pacific', 'normal', 'rare', null, 20, 1500),
  Q('pacific', 'normal', 'epic', null, 5, 1500),
  Q('pacific', 'normal', 'legendary', null, 1, 1500),
  Q('pacific', 'hard', 'common', null, 1000, 4000),
  Q('pacific', 'hard', 'rare', null, 40, 4000),
  Q('pacific', 'hard', 'epic', null, 10, 4000),
  Q('pacific', 'hard', 'legendary', null, 2, 4000),
  Q('pacific', 'named', null, 'megalodon', 1, 8000),
  // 1-2 동남아 — 쉬움 2000 · 보통 6000 · 어려움 15000 · 네임드 30000
  Q('seasia', 'easy', 'common', null, 250, 2000),
  Q('seasia', 'easy', 'rare', null, 10, 2000),
  Q('seasia', 'easy', 'epic', null, 2, 2000),
  Q('seasia', 'normal', 'common', null, 500, 6000),
  Q('seasia', 'normal', 'rare', null, 20, 6000),
  Q('seasia', 'normal', 'epic', null, 5, 6000),
  Q('seasia', 'normal', 'legendary', null, 1, 6000),
  Q('seasia', 'hard', 'common', null, 1000, 15000),
  Q('seasia', 'hard', 'rare', null, 40, 15000),
  Q('seasia', 'hard', 'epic', null, 10, 15000),
  Q('seasia', 'hard', 'legendary', null, 2, 15000),
  // 1-3 인도양 — 쉬움 8000 · 보통 25000 · 어려움 80000 · 네임드 160000
  Q('indian', 'easy', 'common', null, 250, 8000),
  Q('indian', 'easy', 'rare', null, 10, 8000),
  Q('indian', 'easy', 'epic', null, 2, 8000),
  Q('indian', 'normal', 'common', null, 500, 25000),
  Q('indian', 'normal', 'rare', null, 20, 25000),
  Q('indian', 'normal', 'epic', null, 5, 25000),
  Q('indian', 'normal', 'legendary', null, 1, 25000),
  Q('indian', 'hard', 'common', null, 1000, 80000),
  Q('indian', 'hard', 'rare', null, 40, 80000),
  Q('indian', 'hard', 'epic', null, 10, 80000),
  Q('indian', 'hard', 'legendary', null, 2, 80000),
];

const BOUNTY_BY_ID = new Map(BOUNTIES.map(q => [q.id, q]));

/** id → 의뢰 행. 없는 id는 undefined (수주·납품 검증의 단일 출처) */
export const bountyById = (id: string): BountyQuest | undefined => BOUNTY_BY_ID.get(id);
