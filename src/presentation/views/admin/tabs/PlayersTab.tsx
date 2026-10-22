// 플레이어 탭 — 유저 단위로 보는 네 구역(명부 · 이상탐지 · 편지 · 우편)을 한 탭에 모은다.
// 구역은 구역 탭(SubTabs)으로 바꾸고, 어느 구역인지는 해시에 담긴다(화면 셸이 소유).
import SubTabs from '../../../ui/SubTabs';
import { TabPage } from '../layout';
import { ADMIN_SECTIONS } from '../routes';
import type { PlayersSection } from '../routes';
import AntiAbuseTab from './AntiAbuseTab';
import LettersTab from './LettersTab';
import MailTab from './MailTab';
import UsersTab from './UsersTab';

const CONTEXT: Record<PlayersSection, string> = {
  roster: '유저를 누르면 도감과 이벤트를 대조한 감사 정보를 볼 수 있어요.',
  abuse: '연타와 PERFECT 비율, 이사 코드 반입, 제재 현황을 확인해요.',
  letters: '유저가 보낸 편지를 모두 볼 수 있어요. 이벤트 보관 기간(7일)이 지나도 남아 있어요.',
  mail: '플레이어에게 우편을 보내고 읽음·받음을 확인해요. 보내기 전에 미리보기로 대상과 골드 합계를 확인해요.',
};

export default function PlayersTab({ section, onSection }: {
  section: PlayersSection; onSection: (section: PlayersSection) => void;
}) {
  return (
    <TabPage title="플레이어" context={CONTEXT[section]}>
      <div className="max-w-[520px]">
        <SubTabs items={ADMIN_SECTIONS.players.map(s => ({ key: s.key, label: s.label }))}
                 activeKey={section} onSelect={onSection} />
      </div>
      {section === 'roster' && <UsersTab />}
      {section === 'abuse' && <AntiAbuseTab />}
      {section === 'letters' && <LettersTab />}
      {section === 'mail' && <MailTab />}
    </TabPage>
  );
}
