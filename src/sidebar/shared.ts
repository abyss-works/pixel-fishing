// 사이드바 탭들이 공유하는 상수/타입 — 컴포넌트 파일과 분리해 Fast Refresh 경고 방지
// 등급 정렬은 데이터(data/rarity의 order 필드)에서 파생 — 여기선 재수출만.
export { RARITY_ORDER, rarityRank } from '../data/rarity';

/** 도감 보기 — 활성 도감 탭 재클릭으로 전환 */
export type DexView = 'base' | 'variant';

// ---------- 도감 순서 ----------
// 별도 '도감번호' 필드를 두지 않는다. 종을 중간에 끼워 넣을 때마다 손으로 번호를 다시 매겨야
// 하고, 한 번 어긋나면 데이터와 화면이 조용히 갈라진다. 규칙에서 파생하면 그럴 일이 없다.
// 규칙은 DexTab이 실제로 그리는 순서와 같다: 수역 순(SPOTS) → 등급 순 → 데이터 선언 순.
// 즉 "도감을 위에서부터 읽은 순서"가 곧 이 번호다.
import { FISH, SPOTS } from '../game/logic';
import { rarityRank as rank } from '../data/rarity';

const spotRank = (spot: string) => {
  const i = SPOTS.findIndex(s => s.id === spot);
  return i < 0 ? Number.MAX_SAFE_INTEGER : i; // 모르는 수역은 맨 뒤 (데이터 손상 방어)
};

const DEX_ORDER: ReadonlyMap<string, number> = new Map(
  FISH.map((f, i) => ({ f, i }))
    .sort((a, b) =>
      spotRank(a.f.spot) - spotRank(b.f.spot)
      || rank(a.f.rarity) - rank(b.f.rarity)
      || a.i - b.i)
    .map(({ f }, i) => [f.id, i] as const),
);

/** 도감 순서상 위치 (0부터). 화면에 번호를 걸 일이 생기면 +1 해서 쓰면 된다. */
export const dexIndex = (fishId: string): number =>
  DEX_ORDER.get(fishId) ?? Number.MAX_SAFE_INTEGER;

/** 등급 테두리 카드 — 도감 격자·가방 카드뷰·지역 탭 수역 카드가 공유한다.
    같은 문자열을 복붙하면 한쪽만 고쳐지며 갈라진다.
    테두리가 등급의 유일한 표시라 얇으면 안 보인다: 2px + 알파 70%.
    **크기(패딩·글자)는 여기 없다** — 화면마다 카드가 커야 할 이유가 달라 쓰는 쪽이 정한다.
    쓰는 쪽이 `data-rarity`를 걸어야 --rarity-color가 잡힌다. */
export const RARITY_CARD =
  'bg-bg border-2 rounded-sm text-center leading-normal'
  + ' border-[color-mix(in_srgb,var(--rarity-color)_70%,transparent)]'
  + ' transition-[translate,background-color] duration-[120ms] ease-out'
  + ' hover:-translate-y-0.5 hover:bg-surface-2';

/** uid 화면 표시 — 가운데 세 마디(4자 × 3)를 가린다.
 *  어깨너머·스크린샷·방송으로 새는 걸 줄이되, 앞 8자·뒤 12자는 남겨 "그 계정 맞나"를 눈으로
 *  확인할 수 있게 한다. **복사는 항상 전체 값**이다 — 가리는 건 화면뿐이고 문의에는 전체가 필요하다.
 *    fa224eb3-4486-4e9d-b821-5765495da903 → fa224eb3-****-****-****-5765495da903
 *  uuid 모양이 아니면 손대지 않는다(익명 세션 형식이 바뀌어도 화면이 안 깨지게). */
export function maskUid(uid: string): string {
  const parts = uid.split('-');
  if (parts.length !== 5) return uid;
  return [parts[0], '****', '****', '****', parts[4]].join('-');
}

/** 관리자 게이트 — URL ?admin (관리 대시보드·이사 코드 등 운영 기능 공용).
 *  친구 규모라 URL 파라미터로 충분하다 — 서버 권한 검증이 필요해지면 그때 승격한다. */
export const isAdminUrl = (): boolean =>
  new URLSearchParams(window.location.search).has('admin');
