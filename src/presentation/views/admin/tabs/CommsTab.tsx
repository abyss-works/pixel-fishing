// 소통·지급 탭 — 우편 발송, 공지, 쿠폰, 편지 네 구역을 한 탭에 모은다.
// admin과 maintainer 모두 동일하게 사용하며, maintainer의 이메일 비노출은 서버 투영이 강제한다.
import SubTabs from '../../../ui/SubTabs';
import { TabPage } from '../layout';
import { ADMIN_SECTIONS } from '../routes';
import type { CommsSection } from '../routes';
import CouponsTab from './CouponsTab';
import LettersTab from './LettersTab';
import MailTab from './MailTab';
import NoticesTab from './NoticesTab';

const CONTEXT: Record<CommsSection, string> = {
  mail: '플레이어에게 우편을 보내고 읽음·받음을 확인해요. 보내기 전에 미리보기로 대상과 골드 합계를 확인해요.',
  notices: '게임 상단 공지 카드와 공지사항 창에 띄울 기간제 공지를 등록하고 관리해요.',
  coupons: '보상 쿠폰을 발행하고 유효 기간과 사용 현황을 관리해요.',
  letters: '유저가 보낸 편지를 모두 볼 수 있어요. 우편으로 답장하고, 마친 편지는 처리 표시를 남겨요.',
};

export default function CommsTab({ section, onSection, mailTo, onCompose }: {
  section: CommsSection;
  onSection: (section: CommsSection) => void;
  /** 이 계정을 받는 사람으로 넣고 우편 쓰기를 연다 */
  onCompose: (userId: string) => void;
  /** 우편 쓰기에 미리 넣을 받는 사람(계정 id). 다른 화면의 우편 보내기에서 넘어올 때만 있다 */
  mailTo: string | null;
}) {
  return (
    <TabPage title="소통·지급" context={CONTEXT[section]}>
      <div className="max-w-[520px]">
        <SubTabs
          items={ADMIN_SECTIONS.comms.map(s => ({ key: s.key, label: s.label }))}
          activeKey={section}
          onSelect={onSection}
        />
      </div>
      {section === 'mail' && <MailTab key={mailTo ?? ''} to={mailTo} />}
      {section === 'notices' && <NoticesTab />}
      {section === 'coupons' && <CouponsTab />}
      {section === 'letters' && <LettersTab onCompose={onCompose} />}
    </TabPage>
  );
}
