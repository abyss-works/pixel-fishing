// 관리자 대시보드 — **완전 분리된 독립 앱**이다. 게임과 다른 진입점·번들로 빌드해 /admin/에서 서빙하고,
// 게임 번들에는 관리자 화면이 들어가지 않는다.
// 진입: /admin/#/admin/overview · 복귀: 헤더의 "게임으로" 링크.
//
// 탐색은 탭 일곱 개다. 개요 · 실시간 · 플레이어(명부·이상탐지) · 소통(편지·우편)
// · 경제·진행(경제·진행·활동) · 밸런스 · 운영. 괄호 안은 탭 안의 구역이고 해시에 `#/admin/<탭>/<구역>`으로 담긴다.
// 데이터 접근은 **기능 계층**(platform API 조회를 기능별로 조합) 하나로
// 모인다. 쓰기는 우편 보내기, 편지 처리 표시, 사용자 상세의 관리 조치(제재·해제, 재설정 링크)뿐이다. 접근 판정은 AdminAuthProvider가 1회 해석.
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
import CommsTab from './tabs/CommsTab';
import LiveTab from './tabs/LiveTab';
import OpsTab from './tabs/OpsTab';
import OverviewTab from './tabs/OverviewTab';
import PlayersTab from './tabs/PlayersTab';

/** 탭 아이콘 — 개요 나침반, 실시간 해, 플레이어 열쇠(계정), 소통 봉투, 경제·진행 동전, 밸런스 물고기, 운영 톱니 */
const TAB_GLYPH: Record<AdminTab, GlyphId> = {
  overview: 'compass', live: 'sun', players: 'key', comms: 'letter', analysis: 'coin', balance: 'fish', ops: 'gear',
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
  // 우편 쓰기에 미리 넣을 받는 사람 — 명부·편지의 우편 보내기가 정하고, 다른 곳으로 옮기면 비운다
  const [mailTo, setMailTo] = useState<string | null>(null);
  useEffect(() => {
    // 처음 열 때 주소를 정식 해시로 맞춘다 — 잘못된 해시는 여기서 기본 화면으로 옮겨진다
    canonicalize(parseAdminHash(window.location.hash));
    const onHash = () => {
      const next = parseAdminHash(window.location.hash);
      setRoute(next);
      setMailTo(null);
      canonicalize(next);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (next: AdminRoute, to: string | null = null) => {
    setRoute(next);
    setMailTo(to);
    const hash = adminHash(next);
    if (window.location.hash !== hash) {
      try { window.history.pushState(null, '', hash); } catch { /* 무해 */ }
    }
  };
  // 이미 열린 탭을 다시 누르면 그대로 둔다 — 탭 안의 구역은 구역 탭이 바꾼다
  const selectTab = (tab: AdminTab) => { if (tab !== route.tab) go(adminRouteOf(tab)); };
  // 우편 보내기 — 소통 탭의 우편 구역을 열고 그 계정을 받는 사람으로 넣는다
  const compose = (userId: string) => go({ tab: 'comms', section: 'mail' }, userId);

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
            <PlayersTab section={route.section} onSection={section => go({ tab: 'players', section })}
                        onCompose={compose} />}
          {route.tab === 'comms' &&
            <CommsTab section={route.section} onSection={section => go({ tab: 'comms', section })}
                      mailTo={mailTo} onCompose={compose} />}
          {route.tab === 'analysis' &&
            <AnalysisTab section={route.section} onSection={section => go({ tab: 'analysis', section })} />}
          {route.tab === 'balance' && <BalanceTab />}
          {route.tab === 'ops' && <OpsTab />}
        </main>
      </div>
    </AdminAuthProvider>
  );
}
