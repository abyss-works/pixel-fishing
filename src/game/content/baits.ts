// 미끼 데이터 — 등급별 1:1 구성. 활성 중인 미끼의 targetRarity 어종 가중치를 ×2 한다
// (전 수역 균일 — 수역별 차등 없음, 2026-08-26 사용자 결정). 방치(auto) 획득에는 소모·효과 없다.
//
// **id는 등급과 분리됐다** — baitId ↔ targetRarity 매핑이 이 표에 있으므로 6등급 개편(rarity-design)
// 때 등급 이름이 바뀌어도 세이브(items/activeBait 키)와 코드 신분증은 그대로다.
// 상대경로 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버의 import 그래프에 포함된다.
import type { RarityId } from './rarity.js';

export type BaitTarget = RarityId;

export interface Bait {
  id: string;               // items/activeBait 키 — 등급 개편과 무관한 고정 신분증
  name: string;
  desc: string;             // 미끼 소개 한 문장(해요체). 효과 문장은 화면이 밸런스 상수로 덧붙인다
  targetRarity: BaitTarget; // 가중치 ×2가 적용되는 등급
  price: number;            // 구매 골드 — QA 기준값. 릴리즈 직전 이름·가격 재검토 대상
  color: string;            // UI 도트색 — 등급색과 독립(아이템 축)
}

// 이름·가격 — 2026-08-27 두 차례 조정을 거쳐 확정**.
//   1차(10/50/250/500)는 "낮은 등급일수록 보조금" 성격이었으나 일반이 사실상 공짜 수준이라
//   사용자 체감상 싸다고 판단 — 등급 간 격차(×5→×5→×2)와 EV 증분(해당 등급 기여비 ×2 배증)을
//   유지한 채 전 등급 ×2 상향으로 마무리했다. 관찰 후 조정 가능 — 미끼 데이터 단일 출처.
const DATA: readonly Bait[] = [
  { id: 'bait-common', name: '일반 미끼', desc: '흔한 밀웜이에요.',
    targetRarity: 'common', price: 25, color: '#9e9e9e' },
  { id: 'bait-rare', name: '희귀 미끼', desc: '향을 입힌 떡밥이에요.',
    targetRarity: 'rare', price: 200, color: '#42a5f5' },
  { id: 'bait-epic', name: '영웅 미끼', desc: '비싼 살토예요.',
    targetRarity: 'epic', price: 1000, color: '#ba68c8' },
  { id: 'bait-legendary', name: '전설 미끼', desc: '특별히 만든 미끼예요.',
    targetRarity: 'legendary', price: 2500, color: '#ffd54f' },
];

export const BAITS: readonly Bait[] = DATA;

/** id → 미끼 행. 없는 id는 undefined (리듀서·위생 공용 판정) */
export const baitById = (id: unknown): Bait | undefined =>
  typeof id === 'string' ? DATA.find(b => b.id === id) : undefined;
