// 공통 대시보드 워크스페이스 — admin·maintainer 모두 5탭 통합 구조를 공유하고, 서버 RBAC가 개인정보 경계를 강제한다.
import { useEffect, useMemo, useState } from 'react';
import { useAdminAuth } from '../../../features/admin/service/accessContext';
import { AdminGateBanner } from './access';
import AdminShellHeader from './AdminShellHeader';
import { adminRouteOf, canonicalizeAdminHash, parseAdminHash, pushAdminHash } from './routes';
import type { AdminRoute, AdminTab } from './routes';
import CommsTab from './tabs/CommsTab';
import InsightsTab from './tabs/InsightsTab';
import OpsTab from './tabs/OpsTab';
import OverviewTab from './tabs/OverviewTab';
import PlayersTab from './tabs/PlayersTab';
import { AdminViewModeCtx, readStoredViewMode, writeStoredViewMode } from './viewMode';
import type { AdminViewMode } from './viewMode';

export default function AdminWorkspace() {
  const { role } = useAdminAuth();
  const [route, setRoute] = useState<AdminRoute>(() => parseAdminHash(window.location.hash, role));
  // 우편 쓰기에 미리 넣을 받는 사람 — 명부·편지의 우편 보내기가 정하고, 다른 곳으로 옮기면 비운다
  const [mailTo, setMailTo] = useState<string | null>(null);
  const [viewMode, setViewModeState] = useState<AdminViewMode>(() => readStoredViewMode());

  const setViewMode = (mode: AdminViewMode) => {
    setViewModeState(mode);
    writeStoredViewMode(mode);
  };

  useEffect(() => {
    canonicalizeAdminHash(parseAdminHash(window.location.hash, role));
    const onHash = () => {
      const next = parseAdminHash(window.location.hash, role);
      setRoute(next);
      setMailTo(null);
      canonicalizeAdminHash(next);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [role]);

  const go = (next: AdminRoute, to: string | null = null) => {
    setRoute(next);
    setMailTo(to);
    pushAdminHash(next);
  };
  const selectTab = (tab: AdminTab) => { if (tab !== route.tab) go(adminRouteOf(tab, role)); };
  const compose = (userId: string) => go({ tab: 'comms', section: 'mail' }, userId);

  const viewCtx = useMemo(() => ({ viewMode, setViewMode }), [viewMode]);

  return (
    <AdminViewModeCtx.Provider value={viewCtx}>
      <div className="min-h-screen w-full bg-surface text-text select-text">
        <AdminShellHeader title="운영 대시보드" activeTab={route.tab} onSelectTab={selectTab} />

        <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 p-4">
          <AdminGateBanner />
          {route.tab === 'overview' && (
            <OverviewTab
              section={route.section}
              onSection={section => go({ tab: 'overview', section })}
              onNavigate={next => go(next)}
              onCompose={compose}
            />
          )}
          {route.tab === 'players' && (
            <PlayersTab
              section={route.section}
              onSection={section => go({ tab: 'players', section })}
              onCompose={compose}
            />
          )}
          {route.tab === 'comms' && (
            <CommsTab
              section={route.section}
              onSection={section => go({ tab: 'comms', section })}
              mailTo={mailTo}
              onCompose={compose}
            />
          )}
          {route.tab === 'insights' && (
            <InsightsTab
              section={route.section}
              onSection={section => go({ tab: 'insights', section })}
            />
          )}
          {route.tab === 'ops' && (
            <OpsTab
              section={route.section}
              onSection={section => go({ tab: 'ops', section })}
            />
          )}
        </main>
      </div>
    </AdminViewModeCtx.Provider>
  );
}
