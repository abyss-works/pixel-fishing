// 관리자 화면의 해시 경로 — 탭 여덟 개와 세 탭 안의 구역을 `#/admin/<탭>[/<구역>]`으로 주소화한다.
// 순수 함수와 주소 동기화 보조만 두고, 화면 셸이 역할에 맞춰 호출한다.
import type { AdminRole } from '../../../features/admin/model/types';

export type AdminTab = 'overview' | 'live' | 'players' | 'comms' | 'analysis' | 'balance' | 'content' | 'ops';

/** 내비게이션 순서 = 확인 우선순위 */
export const ADMIN_TABS: readonly { key: AdminTab; label: string }[] = [
  { key: 'overview', label: '개요' },
  { key: 'live', label: '실시간' },
  { key: 'players', label: '플레이어' },
  { key: 'comms', label: '소통' },
  { key: 'analysis', label: '경제·진행' },
  { key: 'balance', label: '밸런스' },
  { key: 'content', label: '콘텐츠' },
  { key: 'ops', label: '운영' },
];

/** 구역을 가진 탭의 구역 목록 — 첫 항목이 그 탭의 기본 구역이다 */
export const ADMIN_SECTIONS = {
  players: [
    { key: 'roster', label: '명부' },
    { key: 'abuse', label: '이상탐지' },
  ],
  comms: [
    { key: 'letters', label: '편지' },
    { key: 'mail', label: '우편' },
    { key: 'notices', label: '공지' },
  ],
  analysis: [
    { key: 'economy', label: '경제' },
    { key: 'progression', label: '진행' },
    { key: 'activity', label: '활동' },
  ],
} as const;

export type PlayersSection = (typeof ADMIN_SECTIONS.players)[number]['key'];
export type CommsSection = (typeof ADMIN_SECTIONS.comms)[number]['key'];
export type AnalysisSection = (typeof ADMIN_SECTIONS.analysis)[number]['key'];

/** 현재 화면 — 구역이 있는 탭은 구역까지 정해져 있다 */
export type AdminRoute =
  | { tab: 'overview' | 'live' | 'balance' | 'content' | 'ops' }
  | { tab: 'players'; section: PlayersSection }
  | { tab: 'comms'; section: CommsSection }
  | { tab: 'analysis'; section: AnalysisSection };

const DEFAULT_ROUTE: AdminRoute = { tab: 'overview' };

const MAINTAINER_SECTIONS = {
  players: ADMIN_SECTIONS.players.filter(s => s.key === 'abuse'),
  comms: ADMIN_SECTIONS.comms.filter(s => s.key === 'notices'),
  analysis: ADMIN_SECTIONS.analysis,
} as const;

export function sectionsForRole<T extends keyof typeof ADMIN_SECTIONS>(
  tab: T,
  role: AdminRole = 'admin',
): readonly { key: (typeof ADMIN_SECTIONS)[T][number]['key']; label: string }[] {
  return role === 'maintainer' ? MAINTAINER_SECTIONS[tab] : ADMIN_SECTIONS[tab];
}

const pickSection = <S extends readonly { key: string }[]>(sections: S, key: string): S[number]['key'] =>
  (sections.find(s => s.key === key) ?? sections[0]).key;

/** 해시 → 화면. 모르는 해시와 역할 밖 경로는 개요로, 허용되지 않은 구역은 해당 역할의 기본 구역으로 수렴한다 */
export function parseAdminHash(hash: string, role: AdminRole = 'admin'): AdminRoute {
  const [, root, tab = '', section = ''] = hash.split('/');
  if (root !== 'admin') return DEFAULT_ROUTE;
  switch (tab) {
    case 'overview': case 'live': case 'balance': case 'content': case 'ops':
      return { tab };
    case 'players':
      return { tab, section: pickSection(sectionsForRole('players', role), section) as PlayersSection };
    case 'comms':
      return { tab, section: pickSection(sectionsForRole('comms', role), section) as CommsSection };
    case 'analysis':
      return { tab, section: pickSection(sectionsForRole('analysis', role), section) as AnalysisSection };
    default:
      return DEFAULT_ROUTE;
  }
}

/** 화면 → 정식 해시 */
export function adminHash(route: AdminRoute): string {
  return 'section' in route ? `#/admin/${route.tab}/${route.section}` : `#/admin/${route.tab}`;
}

/** 탭을 눌렀을 때 가는 화면 — 구역이 있는 탭은 역할별 기본 구역으로 간다 */
export const adminRouteOf = (tab: AdminTab, role: AdminRole = 'admin'): AdminRoute =>
  parseAdminHash(`#/admin/${tab}`, role);

/** 주소의 해시를 정식 해시로 맞춘다 — 기록을 쌓지 않고 바꾼다 */
export function canonicalizeAdminHash(route: AdminRoute): void {
  const hash = adminHash(route);
  if (window.location.hash !== hash) {
    try { window.history.replaceState(null, '', hash); } catch { /* 무해 */ }
  }
}

/** 화면 이동 시 주소를 정식 해시로 쌓는다 */
export function pushAdminHash(route: AdminRoute): void {
  const hash = adminHash(route);
  if (window.location.hash !== hash) {
    try { window.history.pushState(null, '', hash); } catch { /* 무해 */ }
  }
}
