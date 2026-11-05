// 소통 탭 — 플레이어와 주고받는 두 구역(편지 · 우편)을 한 탭에 모은다.
// 구역은 구역 탭(SubTabs)으로 바꾸고, 어느 구역인지는 해시에 담긴다(화면 셸이 소유).
import SubTabs from '../../../ui/SubTabs';
import { TabPage } from '../layout';
import { ADMIN_SECTIONS } from '../routes';
import type { CommsSection } from '../routes';
import LettersTab from './LettersTab';
import MailTab from './MailTab';

const CONTEXT: Record<CommsSection, string> = {
  letters: '유저가 보낸 편지를 모두 볼 수 있어요. 이벤트 보관 기간(7일)이 지나도 남아 있어요.',
  mail: '플레이어에게 우편을 보내고 읽음·받음을 확인해요. 보내기 전에 미리보기로 대상과 골드 합계를 확인해요.',
};

export default function CommsTab({ section, onSection, mailTo }: {
  section: CommsSection; onSection: (section: CommsSection) => void;
  /** 우편 쓰기에 미리 넣을 받는 사람(계정 id). 다른 화면의 우편 보내기에서 넘어올 때만 있다 */
  mailTo: string | null;
}) {
  return (
    <TabPage title="소통" context={CONTEXT[section]}>
      <div className="max-w-[520px]">
        <SubTabs items={ADMIN_SECTIONS.comms.map(s => ({ key: s.key, label: s.label }))}
                 activeKey={section} onSelect={onSection} />
      </div>
      {section === 'letters' && <LettersTab />}
      {section === 'mail' && <MailTab key={mailTo ?? ''} to={mailTo} />}
    </TabPage>
  );
}
