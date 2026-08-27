// 관리자 화면의 지역 표기 공용 — 라이브·진행 탭이 함께 쓴다.
// 단일 근원은 world/index(BASE_PACKS·RegionPack.name)지만, 그쪽 import는 마스크 데이터
// 수백 KB를 번들로 끌어온다. 관리자 화면을 위해 이름 표기 4개만 리터럴 미러로 둔다 —
// 게임 로직과 무관한 표기라 드리프트 비용은 수치 오답보다 작다.
export const REGION_NAMES: Record<string, string> = {
  village: '마을', ocean: '태평양', seasia: '동남아&오세아니아', indian: '인도양',
};

/** 도감 서브탭 순서(world/index REGION_IDS 등록순서 미러) */
export const REGION_ORDER = ['village', 'ocean', 'seasia', 'indian'] as const;

/** 거점 → 소속 지역(state.location.kind==='base'일 때의 표기용) */
export const BASE_TO_REGION: Record<string, string> = {
  home: 'village', harbor: 'ocean', manila: 'seasia', colombo: 'indian',
};

/** LocationRef(kind:id) → 지역 id. 미지 값은 undefined — 호출부에서 '—' 처리 */
export function toRegionId(kind: string | null, id: string | null): string | undefined {
  if (!id) return undefined;
  if (kind === 'base') return BASE_TO_REGION[id];
  return kind === 'region' ? id : undefined;
}
