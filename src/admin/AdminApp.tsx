// 관리자 대시보드 — **완전 분리된 독립 앱**이다. main.tsx 부팅 분기(?admin && #/admin/*)만
// 여기로 들어오고, 게임 셸(App)에는 관리자 흔적이 남지 않는다.
// 진입: ?admin=1#/admin/overview · 복귀: 헤더의 "게임으로" 링크.
//
// 좌측 내비는 **분류별 그룹**(사용자 지시): 상용 대시보드 IA를 따라 9항목 6그룹.
//   홈(개요) · 실시간(라이브) · 플레이어(유저·이상탐지) · 분석(지표·경제·진행)
//   · 도구(어종 시뮬) · 시스템(운영)
// 데이터 접근은 **api 계층**(api.admin — http/local 교체, 0010 관리자 뷰/RPC 경유) 하나로
// 모이고, 쓰기 액션은 존재하지 않는다(읽기 전용). 접근 판정은 AdminAuthProvider가 1회 해석.
//
// UI 정책(사용자 결정): 게이트는 내용을 교체하지 않는다 — 상단 배너 + 빈 골격(KPI '—',
// 빈 표)을 항상 그려서 "무엇이 어디에 올 화면인가"를 로컬에서도 보여준다. 탭은 granted일 때만
// 조회하고, 그 전 골격은 아무 조회도 하지 않는다.
//
//   게이트 밖(의도): 어종 시뮬 = 번들 데이터만 쓰는 순수 클라 시뮬레이터라 클라우드가
//                    필요 없다. 운영 = 지금 세션이 왜 막혔는지 진단하는 화면이라 밖이다.
import { useEffect, useState } from 'react';
import { cx } from '../ui/cx';
import { AdminAuthProvider, AdminGateBanner } from './access';
import FishTab from './tabs/FishTab';
import OverviewTab from './tabs/OverviewTab';
import LiveTab from './tabs/LiveTab';
import UsersTab from './tabs/UsersTab';
import MetricsTab from './tabs/MetricsTab';
import EconomyTab from './tabs/EconomyTab';
import ProgressionTab from './tabs/ProgressionTab';
import AntiAbuseTab from './tabs/AntiAbuseTab';
import OpsTab from './tabs/OpsTab';

type AdminTabKey =
  | 'overview' | 'live' | 'users' | 'metrics' | 'economy'
  | 'progression' | 'antiabuse' | 'ops' | 'fish';

/** 좌측 내비의 단일 근원 — 분류 그룹 순서 = 화면 우선순위다 */
const NAV_GROUPS: { group: string; items: { key: AdminTabKey; label: string }[] }[] = [
  { group: '홈',      items: [{ key: 'overview', label: '개요' }] },
  { group: '실시간',  items: [{ key: 'live', label: '라이브' }] },
  { group: '플레이어', items: [{ key: 'users', label: '유저' },
                              { key: 'antiabuse', label: '이상탐지' }] },
  { group: '분석',    items: [{ key: 'metrics', label: '지표' },
                              { key: 'economy', label: '경제' },
                              { key: 'progression', label: '진행' }] },
  { group: '도구',    items: [{ key: 'fish', label: '어종 시뮬' }] },
  { group: '시스템',  items: [{ key: 'ops', label: '운영' }] },
];

const ALL_ITEMS = NAV_GROUPS.flatMap(g => g.items);

const SUBTITLE: Record<AdminTabKey, string> = {
  overview: 'KPI·위험 신호·최근 이벤트 피드',
  live: '지금 누가 어디에 있는가 — 접속 추정·온라인 명부',
  users: '명부와 유저 단위 감사(도감↔이벤트·연타)',
  metrics: 'DAU/WAU · 리텐션 코호트',
  economy: '골드 유입·유출 원장과 잔고 분포',
  progression: '배·낚싯대 분포, 지역 도달, 게이트 정체',
  antiabuse: '연타·PERFECT 비율·반입 로그·제재 현황',
  ops: '빌드/환경 정체 · events 카탈로그',
  fish: '수역 EV 시뮬레이션. 확정 변경은 데이터 파일(fish.ts·spots.ts)이 정본이다.',
};

const DEFAULT_HASH = '#/admin/overview';
const tabFromHash = (): AdminTabKey => {
  const h = window.location.hash;
  return (ALL_ITEMS.find(t => h === `#/admin/${t.key}`)?.key ?? 'overview');
};

export default function AdminApp() {
  const [tab, setTabState] = useState<AdminTabKey>(tabFromHash);
  useEffect(() => {
    if (!window.location.hash.startsWith('#/admin')) {
      window.location.replace(`${window.location.pathname}${window.location.search}${DEFAULT_HASH}`);
    }
    const onHash = () => setTabState(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (key: AdminTabKey) => {
    setTabState(key);
    if (window.location.hash !== `#/admin/${key}`) {
      try { window.history.pushState(null, '', `#/admin/${key}`); } catch { /* 무해 */ }
    }
  };
  return (
    <AdminAuthProvider>
      <div className="min-h-screen w-full bg-bg text-text select-text">
        <header className="border-b border-line bg-surface px-4 py-3
                           flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-lg text-gold pf-accent">관리자 대시보드</h1>
            <p className="text-xs text-text-dim mt-0.5">{SUBTITLE[tab]}</p>
          </div>
          <a href="/" aria-label="게임으로 돌아가기"
             className="pf-btn ghost !py-1.5 !px-3 text-sm">← 게임으로</a>
        </header>

        <div className="flex flex-col lg:flex-row min-h-[calc(100vh-64px)]">
          {/* 분류 그룹 내비 — TabBar(평면형) 대신 로컬 조립. 접근성 이름은 탭 라벨 그대로 */}
          <nav className="lg:w-[180px] shrink-0 border-b lg:border-b-0 lg:border-r border-line
                          py-2 lg:py-3" aria-label="대시보드 섹션">
            {NAV_GROUPS.map(({ group, items }) => (
              <div key={group} className="mb-2 last:mb-0 px-2">
                <div className={cx('text-2xs text-text-dim tracking-wider mb-1 select-none',
                                   'lg:text-left')}>
                  {group}
                </div>
                <div role="group" aria-label={`${group} 섹션`} className="flex lg:flex-col gap-0.5 flex-wrap">
                  {items.map(it => (
                    <button key={it.key} type="button"
                            aria-current={tab === it.key ? 'page' : undefined}
                            onClick={() => go(it.key)}
                            className={cx('text-left rounded-sm px-2 py-1 text-sm cursor-pointer transition',
                                          'lg:w-full whitespace-nowrap',
                                          tab === it.key
                                            ? 'bg-surface-2 text-gold pf-accent border border-gold/40'
                                            : 'border border-transparent text-text-dim hover:text-gold')}>
                      {it.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <main className="flex-1 min-w-0 p-4 overflow-x-auto">
            {/* 게이트 배너 — granted면 사라진다. 내용 교체 없이 위에 얹을 뿐이다 */}
            <AdminGateBanner />
            {tab === 'overview' && <OverviewTab />}
            {tab === 'live' && <LiveTab />}
            {tab === 'users' && <UsersTab />}
            {tab === 'metrics' && <MetricsTab />}
            {tab === 'economy' && <EconomyTab />}
            {tab === 'progression' && <ProgressionTab />}
            {tab === 'antiabuse' && <AntiAbuseTab />}
            {tab === 'ops' && <OpsTab />}
            {tab === 'fish' && <FishTab />}
          </main>
        </div>
      </div>
    </AdminAuthProvider>
  );
}
