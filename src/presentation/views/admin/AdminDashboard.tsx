// 관리자 대시보드 — **완전 분리된 독립 앱**이다. 화면 컴포넌트 부팅 분기(?admin && #/admin/*)만
// 여기로 들어오고, 게임 셸(App)에는 관리자 흔적이 남지 않는다.
// 진입: ?admin=1#/admin/overview · 복귀: 헤더의 "게임으로" 링크.
//
// 탐색은 탭 여섯 개다. 개요 · 라이브 · 플레이어(명부·이상탐지·편지) · 경제·진행(경제·진행·활동)
// · 밸런스 · 운영. 괄호 안은 탭 안의 구역이고 해시에 `#/admin/<탭>/<구역>`으로 담긴다.
// 탭을 합치기 전의 해시(users·letters·metrics 등)는 합친 뒤의 자리로 옮긴다(옮기는 표는 해시 경로 해석이 가진다).
// 데이터 접근은 **기능 계층**(platform API 조회를 기능별로 조합) 하나로
// 모이고, 쓰기 액션은 존재하지 않는다(읽기 전용). 접근 판정은 AdminAuthProvider가 1회 해석.
//
// UI 정책(사용자 결정): 게이트는 내용을 교체하지 않는다 — 상단 배너 + 빈 골격(지표 '—',
// 빈 표)을 항상 그려서 "무엇이 어디에 올 화면인가"를 로컬에서도 보여준다. 탭은 granted일 때만
// 조회하고, 그 전 골격은 아무 조회도 하지 않는다.
//
//   게이트 밖(의도): 밸런스 = 번들 데이터만 쓰는 순수 클라 시뮬레이터라 클라우드가
//                    필요 없다. 운영 = 지금 세션이 왜 막혔는지 진단하는 화면이라 밖이다.
import { useEffect, useState } from 'react';
import LinkButton from '../../ui/LinkButton';
import PixelIcon from '../../ui/PixelIcon';
import type { GlyphId } from '../../ui/PixelIcon';
import TabBar from '../../ui/TabBar';
import { AdminAuthProvider, AdminGateBanner } from './access';
import { ADMIN_TABS, adminHash, adminRouteOf, parseAdminHash } from './routes';
import type { AdminRoute, AdminTab } from './routes';
import AnalysisTab from './tabs/AnalysisTab';
import BalanceTab from './tabs/BalanceTab';
import LiveTab from './tabs/LiveTab';
import OpsTab from './tabs/OpsTab';
import OverviewTab from './tabs/OverviewTab';
import PlayersTab from './tabs/PlayersTab';

/** 탭 아이콘 — 개요 나침반, 라이브 해, 플레이어 열쇠(계정), 경제·진행 동전, 밸런스 물고기, 운영 톱니 */
const TAB_GLYPH: Record<AdminTab, GlyphId> = {
  overview: 'compass', live: 'sun', players: 'key', analysis: 'coin', balance: 'fish', ops: 'gear',
};

/** 주소의 해시를 정식 해시로 맞춘다 — 기록을 쌓지 않고 바꾼다(뒤로 가기가 옛 해시로 돌아오지 않게) */
const canonicalize = (route: AdminRoute) => {
  const hash = adminHash(route);
  if (window.location.hash !== hash) {
    try { window.history.replaceState(null, '', hash); } catch { /* 무해 */ }
  }
};

export default function AdminApp() {
  const [route, setRoute] = useState<AdminRoute>(() => parseAdminHash(window.location.hash));
  useEffect(() => {
    // 처음 열 때 주소를 정식 해시로 맞춘다 — 옛 해시와 잘못된 해시는 여기서 새 자리로 옮겨진다
    canonicalize(parseAdminHash(window.location.hash));
    const onHash = () => {
      const next = parseAdminHash(window.location.hash);
      setRoute(next);
      canonicalize(next);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (next: AdminRoute) => {
    setRoute(next);
    const hash = adminHash(next);
    if (window.location.hash !== hash) {
      try { window.history.pushState(null, '', hash); } catch { /* 무해 */ }
    }
  };
  // 이미 열린 탭을 다시 누르면 그대로 둔다 — 탭 안의 구역은 구역 탭이 바꾼다
  const selectTab = (tab: AdminTab) => { if (tab !== route.tab) go(adminRouteOf(tab)); };

  const tabs = ADMIN_TABS.map(t => ({
    key: t.key, label: t.label, icon: <PixelIcon glyph={TAB_GLYPH[t.key]} size={16} />,
  }));

  return (
    <AdminAuthProvider>
      <div className="min-h-screen w-full bg-surface text-text select-text">
        <header className="border-b border-line bg-bg">
          <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center justify-between gap-3 px-4 py-3">
            <span className="pf-accent text-lg text-gold">관리자 대시보드</span>
            <LinkButton href="/" aria-label="게임으로 돌아가기" variant="ghost" className="text-sm">
              <PixelIcon glyph="exit" size={12} /> 게임으로
            </LinkButton>
          </div>
          {/* 메뉴 탭 — 게임 사이드바와 같은 탭바. 접근성 이름은 탭 라벨 그대로 */}
          <nav aria-label="대시보드 섹션" className="mx-auto w-full max-w-[1280px] px-4">
            <TabBar tabs={tabs} activeKey={route.tab} onSelect={selectTab} className="border-b-0" />
          </nav>
        </header>

        <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 p-4">
          {/* 게이트 배너 — granted면 사라진다. 내용 교체 없이 위에 얹을 뿐이다 */}
          <AdminGateBanner />
          {route.tab === 'overview' && <OverviewTab />}
          {route.tab === 'live' && <LiveTab />}
          {route.tab === 'players' &&
            <PlayersTab section={route.section} onSection={section => go({ tab: 'players', section })} />}
          {route.tab === 'analysis' &&
            <AnalysisTab section={route.section} onSection={section => go({ tab: 'analysis', section })} />}
          {route.tab === 'balance' && <BalanceTab />}
          {route.tab === 'ops' && <OpsTab />}
        </main>
      </div>
    </AdminAuthProvider>
  );
}
