// 플레이어 탭 — 유저 단위로 보는 두 구역(명부 · 이상탐지)을 한 탭에 모은다.
// 구역은 구역 탭(SubTabs)으로 바꾸고, 어느 구역인지는 해시에 담긴다(화면 셸이 소유).
import SubTabs from '../../../ui/SubTabs';
import { TabPage } from '../layout';
import { ADMIN_SECTIONS } from '../routes';
import type { PlayersSection } from '../routes';
import AntiAbuseTab from './AntiAbuseTab';
import UsersTab from './UsersTab';

const CONTEXT: Record<PlayersSection, string> = {
  roster: '유저를 누르면 최근 이벤트와 연타·판정 기록을 볼 수 있어요.',
  abuse: '연타와 PERFECT 비율, 제재 현황을 확인해요.',
};

export default function PlayersTab({ section, onSection, onCompose }: {
  section: PlayersSection; onSection: (section: PlayersSection) => void;
  /** 이 계정을 받는 사람으로 넣고 우편 쓰기를 연다 */
  onCompose: (userId: string) => void;
}) {
  return (
    <TabPage title="플레이어" context={CONTEXT[section]}>
      <div className="max-w-[520px]">
        <SubTabs items={ADMIN_SECTIONS.players.map(s => ({ key: s.key, label: s.label }))}
                 activeKey={section} onSelect={onSection} />
      </div>
      {section === 'roster' && <UsersTab onCompose={onCompose} />}
      {section === 'abuse' && <AntiAbuseTab />}
    </TabPage>
  );
}
