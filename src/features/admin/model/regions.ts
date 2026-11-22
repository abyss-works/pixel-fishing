import type { BaseId } from '../../../game/content/places';
import { zoneById } from '../../../game/content/zones';
import type { ZoneId } from '../../../game/content/zones';

// 관리자 화면의 지역 표기 공용 — 실시간·진행·명부 탭이 함께 쓴다.
// 단일 근원은 월드 진입점(BASE_PACKS·RegionPack.name)이지만, 그쪽 import는 마스크 데이터
// 수백 KB를 번들로 끌어온다. 관리자 화면을 위해 이름 표기만 콘텐츠({places, zones})와
// 리터럴 미러로 두고 world.mask는 참조하지 않는다.
// 'world' = 병합 바다(오픈월드 Phase 3). 구 ocean/seasia/indian 등은 구세이브 location·visited
// 표기와 도달 퍼널(진행 데이터)에 여전히 필요하다.
export const REGION_NAMES: Record<string, string> = {
  village: '마을',
  world: '대양',
  ocean: '태평양',
  seasia: '동남아&오세아니아',
  indian: '인도양',
  madagascar: '마다가스카르',
  southatlantic: '남대서양',
  northatlantic: '북대서양',
};

/** 도달 퍼널·위치 분포 순서 — 구 지역 순서 + 병합 바다. */
export const REGION_ORDER = [
  'village', 'ocean', 'seasia', 'indian', 'madagascar', 'southatlantic', 'northatlantic', 'world',
] as const;

/** 거점 id → 한글 표시명 */
export const BASE_NAMES: Record<BaseId, string> = {
  home: '집',
  harbor: '부산항',
  manila: '마닐라항',
  colombo: '콜롬보항',
  toamasina: '투아마시나항',
  walvisbay: '월비스베이항',
  lisbon: '리스본항',
};

/** 거점 → 소속 지역(state.location.kind==='base'일 때의 표기용) */
export const BASE_TO_REGION: Record<string, string> = {
  home: 'village', harbor: 'world', manila: 'world', colombo: 'world', toamasina: 'world', walvisbay: 'world', lisbon: 'world',
};

/** LocationRef(kind:id) → 지역 id. 미지 값은 undefined — 호출부에서 '—' 처리 */
export function toRegionId(kind: string | null, id: string | null): string | undefined {
  if (!id) return undefined;
  if (kind === 'base') return BASE_TO_REGION[id];
  return kind === 'region' ? id : undefined;
}

/** 원시 위치("base:lisbon", "region:world", 또는 { kind, id })를 읽기 쉬운 한글명으로 바꾼다 */
export function formatAdminLocation(
  raw: string | { kind: string | null; id: string | null } | null | undefined,
): string {
  if (!raw) return '—';
  let kind: string | null;
  let id: string | null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return '—';
    const colon = trimmed.indexOf(':');
    if (colon < 0) {
      return BASE_NAMES[trimmed as BaseId] ?? REGION_NAMES[trimmed] ?? zoneById(trimmed as ZoneId)?.name ?? trimmed;
    }
    kind = trimmed.slice(0, colon);
    id = trimmed.slice(colon + 1);
  } else {
    kind = raw.kind;
    id = raw.id;
  }
  if (!kind || !id) return '—';
  if (kind === 'base') return BASE_NAMES[id as BaseId] ?? id;
  if (kind === 'region') return REGION_NAMES[id] ?? zoneById(id as ZoneId)?.name ?? id;
  if (kind === 'zone') return zoneById(id as ZoneId)?.name ?? REGION_NAMES[id] ?? id;
  return id;
}
