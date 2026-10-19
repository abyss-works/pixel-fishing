// 관리자 화면의 해시 경로 — 탭 여섯 개와 두 탭 안의 구역을 `#/admin/<탭>[/<구역>]`으로 주소화한다.
// 탭을 합치기 전의 해시(users·letters·metrics 등)는 합친 뒤의 자리로 옮기므로, 옛 북마크도
// 가까운 화면에 닿는다. 순수 함수만 두고, 주소를 바꾸는 일은 화면 셸이 맡는다.

export type AdminTab = 'overview' | 'live' | 'players' | 'analysis' | 'balance' | 'ops';

/** 내비게이션 순서 = 확인 우선순위 */
export const ADMIN_TABS: readonly { key: AdminTab; label: string }[] = [
  { key: 'overview', label: '개요' },
  { key: 'live', label: '라이브' },
  { key: 'players', label: '플레이어' },
  { key: 'analysis', label: '경제·진행' },
  { key: 'balance', label: '밸런스' },
  { key: 'ops', label: '운영' },
];

/** 구역을 가진 탭의 구역 목록 — 첫 항목이 그 탭의 기본 구역이다 */
export const ADMIN_SECTIONS = {
  players: [
    { key: 'roster', label: '명부' },
    { key: 'abuse', label: '이상탐지' },
    { key: 'letters', label: '편지' },
  ],
  analysis: [
    { key: 'economy', label: '경제' },
    { key: 'progression', label: '진행' },
    { key: 'activity', label: '활동' },
  ],
} as const;

export type PlayersSection = (typeof ADMIN_SECTIONS.players)[number]['key'];
export type AnalysisSection = (typeof ADMIN_SECTIONS.analysis)[number]['key'];

/** 현재 화면 — 구역이 있는 탭은 구역까지 정해져 있다 */
export type AdminRoute =
  | { tab: 'overview' | 'live' | 'balance' | 'ops' }
  | { tab: 'players'; section: PlayersSection }
  | { tab: 'analysis'; section: AnalysisSection };

const DEFAULT_ROUTE: AdminRoute = { tab: 'overview' };

/** 탭을 합치기 전의 해시 키 → 합친 뒤의 자리 */
const LEGACY_ROUTES: Record<string, AdminRoute> = {
  users: { tab: 'players', section: 'roster' },
  letters: { tab: 'players', section: 'letters' },
  antiabuse: { tab: 'players', section: 'abuse' },
  metrics: { tab: 'analysis', section: 'activity' },
  economy: { tab: 'analysis', section: 'economy' },
  progression: { tab: 'analysis', section: 'progression' },
  fish: { tab: 'balance' },
};

const pickSection = <S extends readonly { key: string }[]>(sections: S, key: string): S[number]['key'] =>
  (sections.find(s => s.key === key) ?? sections[0]).key;

/** 해시 → 화면. 모르는 해시는 개요로, 구역이 없거나 틀린 해시는 그 탭의 기본 구역으로 본다 */
export function parseAdminHash(hash: string): AdminRoute {
  const [, root, tab = '', section = ''] = hash.split('/');
  if (root !== 'admin') return DEFAULT_ROUTE;
  switch (tab) {
    case 'overview': case 'live': case 'balance': case 'ops':
      return { tab };
    case 'players':
      return { tab, section: pickSection(ADMIN_SECTIONS.players, section) };
    case 'analysis':
      return { tab, section: pickSection(ADMIN_SECTIONS.analysis, section) };
    default:
      return LEGACY_ROUTES[tab] ?? DEFAULT_ROUTE;
  }
}

/** 화면 → 정식 해시 */
export function adminHash(route: AdminRoute): string {
  return 'section' in route ? `#/admin/${route.tab}/${route.section}` : `#/admin/${route.tab}`;
}

/** 탭을 눌렀을 때 가는 화면 — 구역이 있는 탭은 기본 구역으로 간다 */
export const adminRouteOf = (tab: AdminTab): AdminRoute => parseAdminHash(`#/admin/${tab}`);
