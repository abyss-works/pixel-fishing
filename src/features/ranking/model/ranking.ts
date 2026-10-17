import { FISH } from '../../../game/rules/logic';
import type { RarityId } from '../../../game/content/rarity';
import type { RankingBiggestRow } from '../../../platform/api';

// 랭킹 파생 모델 — 어종별 월척을 어종 목록 순서와 이름으로 묶는다.

export interface BiggestView { fishId: string; name: string; rarity: RarityId; size: number; nickname: string | null; me: boolean }

/** 어종 목록 순서로, 지금 게임에 있는 어종만 */
export function selectBiggestRows(species: readonly RankingBiggestRow[]): BiggestView[] {
  const byId = new Map(species.map(s => [s.fishId, s]));
  return FISH.flatMap(f => {
    const s = byId.get(f.id);
    return s ? [{ fishId: f.id, name: f.name, rarity: f.rarity, size: s.size, nickname: s.nickname, me: s.me }] : [];
  });
}

/** 어종 하나의 월척 주인 — 기록이 없거나 아직 읽지 못했으면 null */
export function biggestHolder(species: readonly RankingBiggestRow[] | null, fishId: string):
  { size: number; nickname: string | null; me: boolean } | null {
  const s = species?.find(r => r.fishId === fishId);
  return s ? { size: s.size, nickname: s.nickname, me: s.me } : null;
}
