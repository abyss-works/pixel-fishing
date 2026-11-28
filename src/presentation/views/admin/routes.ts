// 관리자 화면의 해시 경로 — 5대 메뉴와 하위 구역을 `#/admin/<탭>/<구역>`으로 주소화한다.
// 순수 함수와 주소 동기화 보조만 두고, 이전 8탭 해시도 호환 리다이렉트로 받는다.
import type { AdminRole } from '../../../features/admin/model/types';

export type AdminTab = 'overview' | 'players' | 'comms' | 'insights' | 'ops';

/** 내비게이션 순서 = 확인 우선순위 */
export const ADMIN_TABS: readonly { key: AdminTab; label: string }[] = [
  { key: 'overview', label: '현황' },
  { key: 'players', label: '플레이어' },
  { key: 'comms', label: '소통·지급' },
  { key: 'insights', label: '지표·밸런스' },
  { key: 'ops', label: '운영·콘텐츠' },
];

/** 구역을 가진 탭의 구역 목록 — 첫 항목이 그 탭의 기본 구역이다 */
export const ADMIN_SECTIONS = {
  overview: [
    { key: 'summary', label: '요약' },
    { key: 'live', label: '실시간 & 신고' },
  ],
  players: [
    { key: 'directory', label: '검색·명부' },
    { key: 'sanctions', label: '제재·무결성' },
  ],
  comms: [
    { key: 'mail', label: '우편 발송' },
    { key: 'notices', label: '공지' },
    { key: 'coupons', label: '쿠폰' },
    { key: 'letters', label: '편지' },
  ],
  insights: [
    { key: 'economy', label: '경제·진행' },
    { key: 'retention', label: '활동·리텐션' },
    { key: 'sim', label: '밸런스 시뮬' },
  ],
  ops: [
    { key: 'server', label: '서버·실시간' },
    { key: 'client', label: '클라이언트' },
    { key: 'changelog', label: '변경 기록' },
    { key: 'catalog', label: '콘텐츠 카탈로그' },
  ],
} as const;

export type OverviewSection = (typeof ADMIN_SECTIONS.overview)[number]['key'];
export type PlayersSection = (typeof ADMIN_SECTIONS.players)[number]['key'];
export type CommsSection = (typeof ADMIN_SECTIONS.comms)[number]['key'];
export type InsightsSection = (typeof ADMIN_SECTIONS.insights)[number]['key'];
export type OpsSection = (typeof ADMIN_SECTIONS.ops)[number]['key'];

/** 현재 화면 — 모든 탭이 구역까지 정해져 있다 */
export type AdminRoute =
  | { tab: 'overview'; section: OverviewSection }
  | { tab: 'players'; section: PlayersSection }
  | { tab: 'comms'; section: CommsSection }
  | { tab: 'insights'; section: InsightsSection }
  | { tab: 'ops'; section: OpsSection };

const DEFAULT_ROUTE: AdminRoute = { tab: 'overview', section: 'summary' };

export function sectionsForRole<T extends keyof typeof ADMIN_SECTIONS>(
  tab: T,
  _role: AdminRole = 'admin',
): readonly { key: (typeof ADMIN_SECTIONS)[T][number]['key']; label: string }[] {
  return ADMIN_SECTIONS[tab];
}

const pickSection = <S extends readonly { key: string }[]>(sections: S, key: string): S[number]['key'] =>
  (sections.find(s => s.key === key) ?? sections[0]).key;

/** 해시 → 화면. 이전 8탭 해시를 5탭 경로로 호환 변환하고, 모르는 해시는 현황 요약으로 수렴한다 */
export function parseAdminHash(hash: string, role: AdminRole = 'admin'): AdminRoute {
  const [, root, tab = '', section = ''] = hash.split('/');
  if (root !== 'admin') return DEFAULT_ROUTE;
  switch (tab) {
    case 'overview':
      return { tab: 'overview', section: pickSection(sectionsForRole('overview', role), section) as OverviewSection };
    case 'live':
      return { tab: 'overview', section: 'live' };
    case 'players': {
      const mapped = section === 'roster' ? 'directory' : section === 'abuse' ? 'sanctions' : section;
      return { tab: 'players', section: pickSection(sectionsForRole('players', role), mapped) as PlayersSection };
    }
    case 'comms':
      return { tab: 'comms', section: pickSection(sectionsForRole('comms', role), section) as CommsSection };
    case 'insights':
      return { tab: 'insights', section: pickSection(sectionsForRole('insights', role), section) as InsightsSection };
    case 'analysis': {
      const mapped = section === 'activity' ? 'retention' : 'economy';
      return { tab: 'insights', section: mapped };
    }
    case 'balance':
      return { tab: 'insights', section: 'sim' };
    case 'content':
      return { tab: 'ops', section: 'catalog' };
    case 'ops':
      return { tab: 'ops', section: pickSection(sectionsForRole('ops', role), section) as OpsSection };
    default:
      return DEFAULT_ROUTE;
  }
}

/** 화면 → 정식 해시 */
export function adminHash(route: AdminRoute): string {
  return `#/admin/${route.tab}/${route.section}`;
}

/** 탭을 눌렀을 때 가는 화면 — 해당 탭의 기본 구역으로 간다 */
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
