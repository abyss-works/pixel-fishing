// 미끼 데이터 — 등급별 1:1 구성. 활성 중인 미끼의 targetRarity 어종 가중치를 ×2 한다
// (전 수역 균일 — 수역별 차등 없음, 2026-08-26 사용자 결정). 방치(auto) 획득에는 소모·효과 없다.
//
// **id는 등급과 분리됐다** — baitId ↔ targetRarity 매핑이 이 표에 있으므로 6등급 개편(rarity-design)
// 때 등급 이름이 바뀌어도 세이브(items/activeBait 키)와 코드 신분증은 그대로다.
// 상대경로 .js 확장자 필수 — api/action.ts(Node 순수 ESM) import 그래프에 물려 있다.
import type { RarityId } from './rarity.js';

export type BaitTarget = Exclude<RarityId, 'junk'>;

export interface Bait {
  id: string;               // items/activeBait 키 — 등급 개편과 무관한 고정 신분증
  name: string;
  desc: string;             // 가방 아이템 섹션 한 줄 설명 (writing-voice 담백체)
  targetRarity: BaitTarget; // 가중치 ×2가 적용되는 등급
  price: number;            // 구매 골드 — QA 기준값. 릴리즈 직전 이름·가격 재검토 대상
  color: string;            // UI 도트색 — 등급색과 독립(아이템 축)
}

// 이름·가격 — 현재는 로컬 QA용 기준값이다. 릴리즈 직전에 밸런스 검토 후 확정한다.
//   효과는 "해당 등급 예산 ×2"라서 EV 증분 ≈ 그 등급 현재 기여비 × 2 배증.
//   2026-08-27 재조정: 일반 10 · 희귀 50 · 영웅 250 · 전설 500 G
//   (낮은 등급일수록 보조금 성격, 높은 등급은 도감용으로 손해 보는 구조).
//   관찰 후 조정 가능 — baits.ts 단일 출처.
const DATA: readonly Bait[] = [
  { id: 'bait-common', name: '일반 미끼', desc: '흔한 밀웜. 같은 등급 물고기가 두 배 더 잘 낚인다.',
    targetRarity: 'common', price: 10, color: '#9e9e9e' },
  { id: 'bait-rare', name: '희귀 미끼', desc: '향을 입힌 떡밥. 같은 등급 물고기가 두 배 더 잘 낚인다.',
    targetRarity: 'rare', price: 50, color: '#42a5f5' },
  { id: 'bait-epic', name: '영웅 미끼', desc: '비싼 살토. 같은 등급 물고기가 두 배 더 잘 낚인다.',
    targetRarity: 'epic', price: 250, color: '#ba68c8' },
  { id: 'bait-legendary', name: '전설 미끼', desc: '특제 특수 미끼. 같은 등급 물고기가 두 배 더 잘 낚인다.',
    targetRarity: 'legendary', price: 500, color: '#ffd54f' },
];

export const BAITS: readonly Bait[] = DATA;

/** id → 미끼 행. 없는 id는 undefined (리듀서·위생 공용 판정) */
export const baitById = (id: unknown): Bait | undefined =>
  typeof id === 'string' ? DATA.find(b => b.id === id) : undefined;
