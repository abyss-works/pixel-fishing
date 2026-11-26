// 1계층 관리자(admin) 전용 워크스페이스 — 8개 탭 전체, 원문 식별, 편지·우편·상세·제재·세션 종료를 포함한다.
import { useEffect, useState } from 'react';
import { AdminGateBanner } from './access';
import AdminShellHeader from './AdminShellHeader';
import { adminRouteOf, canonicalizeAdminHash, parseAdminHash, pushAdminHash } from './routes';
import type { AdminRoute, AdminTab } from './routes';
import AnalysisTab from './tabs/AnalysisTab';
import BalanceTab from './tabs/BalanceTab';
import CommsTab from './tabs/CommsTab';
import ContentTab from './tabs/ContentTab';
import LiveTab from './tabs/LiveTab';
import OpsTab from './tabs/OpsTab';
import OverviewTab from './tabs/OverviewTab';
import PlayersTab from './tabs/PlayersTab';

export default function AdminWorkspace() {
  const [route, setRoute] = useState<AdminRoute>(() => parseAdminHash(window.location.hash, 'admin'));
  // 우편 쓰기에 미리 넣을 받는 사람 — 명부·편지의 우편 보내기가 정하고, 다른 곳으로 옮기면 비운다
  const [mailTo, setMailTo] = useState<string | null>(null);

  useEffect(() => {
    canonicalizeAdminHash(parseAdminHash(window.location.hash, 'admin'));
    const onHash = () => {
      const next = parseAdminHash(window.location.hash, 'admin');
      setRoute(next);
      setMailTo(null);
      canonicalizeAdminHash(next);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (next: AdminRoute, to: string | null = null) => {
    setRoute(next);
    setMailTo(to);
    pushAdminHash(next);
  };
  const selectTab = (tab: AdminTab) => { if (tab !== route.tab) go(adminRouteOf(tab, 'admin')); };
  const compose = (userId: string) => go({ tab: 'comms', section: 'mail' }, userId);

  return (
    <div className="min-h-screen w-full bg-surface text-text select-text">
      <AdminShellHeader title="관리자 대시보드" activeTab={route.tab} onSelectTab={selectTab} />

      <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 p-4">
        <AdminGateBanner />
        {route.tab === 'overview' && <OverviewTab />}
        {route.tab === 'live' && <LiveTab onCompose={compose} />}
        {route.tab === 'players' &&
          <PlayersTab section={route.section} onSection={section => go({ tab: 'players', section })}
                      onCompose={compose} />}
        {route.tab === 'comms' &&
          <CommsTab section={route.section} onSection={section => go({ tab: 'comms', section })}
                    mailTo={mailTo} onCompose={compose} />}
        {route.tab === 'analysis' &&
          <AnalysisTab section={route.section} onSection={section => go({ tab: 'analysis', section })} />}
        {route.tab === 'balance' && <BalanceTab />}
        {route.tab === 'content' && <ContentTab />}
        {route.tab === 'ops' && <OpsTab />}
      </main>
    </div>
  );
}
