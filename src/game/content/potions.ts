// 물약 카탈로그 — 특수 소비 아이템 정의와 조회 헬퍼의 단일 정본.
// 행을 더하면 아이템 카탈로그와 가방·사용 규칙이 함께 인식한다.
// 상대경로 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버의 import 그래프에 포함된다.
import type { DisplayGradeId } from './rarity.js';

/** 물약이 올리는 운 배율 대상 — 운세의 보너스 대상과 같은 3종 */
export type PotionLuckTarget = 'rarity' | 'sell' | 'named';

export interface PotionEffects {
  /** 대상별 운 배율 가산값 (예: 0.05 = +5%p) */
  luck?: Readonly<Partial<Record<PotionLuckTarget, number>>>;
}

export interface Potion {
  id: string;
  name: string;
  grade: DisplayGradeId;
  description: string;
  duration: 'game-day';
  effects: PotionEffects;
}

export const POTIONS: readonly Potion[] = [
  {
    id: 'luck-small',
    name: '작은 행운 물약',
    grade: 'special',
    description: '사용하면 한국 시간 새벽 4시까지 모든 운 배율이 +5%p 올라요.',
    duration: 'game-day',
    effects: {
      luck: { rarity: 0.05, sell: 0.05, named: 0.05 },
    },
  },
];

export const POTION_BY_ID: ReadonlyMap<string, Potion> = new Map(POTIONS.map(p => [p.id, p]));

/** id → 물약. 없는 id나 비문자열 입력은 undefined */
export const potionById = (id: unknown): Potion | undefined =>
  typeof id === 'string' ? POTION_BY_ID.get(id) : undefined;

/** 등록된 물약 id인가 */
export const isPotionId = (id: unknown): id is string =>
  typeof id === 'string' && POTION_BY_ID.has(id);
