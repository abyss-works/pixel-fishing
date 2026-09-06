// 관리자 화면의 지역 표기 공용 — 라이브·진행 탭이 함께 쓴다.
// 단일 근원은 world/index(BASE_PACKS·RegionPack.name)지만, 그쪽 import는 마스크 데이터
// 수백 KB를 번들로 끌어온다. 관리자 화면을 위해 이름 표기만 리터럴 미러로 둔다 —
// 게임 로직과 무관한 표기라 드리프트 비용은 수치 오답보다 작다.
// 'world' = 병합 바다(오픈월드 Phase 3). 구 ocean/seasia/indian은 구세이브 location·visited
// 표기와 도달 퍼널(진행 데이터)에 여전히 필요하다.
export const REGION_NAMES: Record<string, string> = {
  village: '마을', world: '대양', ocean: '태평양', seasia: '동남아&오세아니아', indian: '인도양',
};

/** 도달 퍼널·위치 분포 순서 — 구 지역 4개 + 병합 바다. 퍼널은 시간 순서(구 지역 → 병합)를
 *  유지하되, 병합 이후 신규 방문은 전부 'world'로 적힌다. */
export const REGION_ORDER = ['village', 'ocean', 'seasia', 'indian', 'world'] as const;

/** 거점 → 소속 지역(state.location.kind==='base'일 때의 표기용) */
export const BASE_TO_REGION: Record<string, string> = {
  home: 'village', harbor: 'world', manila: 'world', colombo: 'world',
};

/** LocationRef(kind:id) → 지역 id. 미지 값은 undefined — 호출부에서 '—' 처리 */
export function toRegionId(kind: string | null, id: string | null): string | undefined {
  if (!id) return undefined;
  if (kind === 'base') return BASE_TO_REGION[id];
  return kind === 'region' ? id : undefined;
}
