// 플레이어 탭 — 검색·명부와 제재·무결성 두 구역을 한 탭에 모은다.
// admin과 maintainer 모두 동일하게 사용한다(개인정보 경계는 서버 투영이 강제).
import SubTabs from '../../../ui/SubTabs';
import { TabPage } from '../layout';
import { ADMIN_SECTIONS } from '../routes';
import type { PlayersSection } from '../routes';
import AntiAbuseTab from './AntiAbuseTab';
import UsersTab from './UsersTab';

const CONTEXT: Record<PlayersSection, string> = {
  directory: '닉네임·UUID로 플레이어를 검색하고 우편 발송·제재·상세 보기를 바로 실행해요.',
  sanctions: '제재 현황, 무결성 감등 단계 및 오탐 해제, 연타·판정 이상치를 확인해요.',
};

export default function PlayersTab({ section, onSection, onCompose }: {
  section: PlayersSection;
  onSection: (section: PlayersSection) => void;
  /** 이 계정을 받는 사람으로 넣고 우편 쓰기를 연다 */
  onCompose: (userId: string) => void;
}) {
  return (
    <TabPage title="플레이어" context={CONTEXT[section]}>
      <div className="max-w-[520px]">
        <SubTabs
          items={ADMIN_SECTIONS.players.map(s => ({ key: s.key, label: s.label }))}
          activeKey={section}
          onSelect={onSection}
        />
      </div>
      {section === 'directory' && <UsersTab onCompose={onCompose} />}
      {section === 'sanctions' && <AntiAbuseTab onCompose={onCompose} />}
    </TabPage>
  );
}
