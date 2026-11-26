// 플레이어 탭 — 유저 단위로 보는 두 구역(명부 · 이상탐지)을 한 탭에 모은다.
// maintainer 역할에서는 명부(UsersTab) 청크를 불러오지 않고 이상탐지 구역만 노출한다.
import { Suspense, lazy } from 'react';
import SubTabs from '../../../ui/SubTabs';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { TabPage } from '../layout';
import { sectionsForRole } from '../routes';
import type { PlayersSection } from '../routes';
import AntiAbuseTab from './AntiAbuseTab';

const UsersTab = lazy(() => import('./UsersTab'));

const CONTEXT: Record<PlayersSection, string> = {
  roster: '유저를 누르면 최근 이벤트와 연타·판정 기록을 볼 수 있어요.',
  abuse: '연타와 PERFECT 비율, 제재 현황을 확인해요.',
};

export default function PlayersTab({ section, onSection, onCompose }: {
  section: PlayersSection; onSection: (section: PlayersSection) => void;
  /** 이 계정을 받는 사람으로 넣고 우편 쓰기를 연다 */
  onCompose: (userId: string) => void;
}) {
  const { role } = useAdminAuth();
  const isAdmin = role === 'admin';
  const sections = sectionsForRole('players', role);
  const activeSection: PlayersSection = isAdmin ? section : 'abuse';

  return (
    <TabPage title="플레이어" context={CONTEXT[activeSection]}>
      <div className="max-w-[520px]">
        <SubTabs items={sections.map(s => ({ key: s.key, label: s.label }))}
                 activeKey={activeSection} onSelect={onSection} />
      </div>
      {isAdmin && activeSection === 'roster' && (
        <Suspense fallback={null}>
          <UsersTab onCompose={onCompose} />
        </Suspense>
      )}
      {activeSection === 'abuse' && <AntiAbuseTab />}
    </TabPage>
  );
}
