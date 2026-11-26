// 2계층 운영자(maintainer) 전용 Zero-PII 워크스페이스 — UsersTab·UserDetail·LettersTab·MailTab 청크를 참조하지 않는다.
import { useEffect, useState } from 'react';
import { AdminGateBanner } from './access';
import AdminShellHeader from './AdminShellHeader';
import { TabPage } from './layout';
import { adminRouteOf, canonicalizeAdminHash, parseAdminHash, pushAdminHash } from './routes';
import type { AdminRoute, AdminTab } from './routes';
import AnalysisTab from './tabs/AnalysisTab';
import AntiAbuseTab from './tabs/AntiAbuseTab';
import BalanceTab from './tabs/BalanceTab';
import ContentTab from './tabs/ContentTab';
import LiveTab from './tabs/LiveTab';
import NoticesTab from './tabs/NoticesTab';
import OpsTab from './tabs/OpsTab';
import OverviewTab from './tabs/OverviewTab';

export default function MaintainerWorkspace() {
  const [route, setRoute] = useState<AdminRoute>(() => parseAdminHash(window.location.hash, 'maintainer'));

  useEffect(() => {
    canonicalizeAdminHash(parseAdminHash(window.location.hash, 'maintainer'));
    const onHash = () => {
      const next = parseAdminHash(window.location.hash, 'maintainer');
      setRoute(next);
      canonicalizeAdminHash(next);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (next: AdminRoute) => {
    setRoute(next);
    pushAdminHash(next);
  };
  const selectTab = (tab: AdminTab) => { if (tab !== route.tab) go(adminRouteOf(tab, 'maintainer')); };

  return (
    <div className="min-h-screen w-full bg-surface text-text select-text">
      <AdminShellHeader title="운영 대시보드" activeTab={route.tab} onSelectTab={selectTab} />

      <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 p-4">
        <AdminGateBanner />
        {route.tab === 'overview' && <OverviewTab />}
        {route.tab === 'live' && <LiveTab />}
        {route.tab === 'players' && (
          <TabPage title="플레이어" context="연타와 PERFECT 비율, 제재 현황을 확인해요.">
            <AntiAbuseTab />
          </TabPage>
        )}
        {route.tab === 'comms' && (
          <TabPage title="소통" context="게임 상단 공지 카드와 공지사항 창에 띄울 기간제 공지를 등록하고 관리해요.">
            <NoticesTab />
          </TabPage>
        )}
        {route.tab === 'analysis' &&
          <AnalysisTab section={route.section} onSection={section => go({ tab: 'analysis', section })} />}
        {route.tab === 'balance' && <BalanceTab />}
        {route.tab === 'content' && <ContentTab />}
        {route.tab === 'ops' && <OpsTab />}
      </main>
    </div>
  );
}
