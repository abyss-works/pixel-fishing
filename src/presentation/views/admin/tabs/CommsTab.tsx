// 소통·지급 탭 — 우편 발송, 공지, 쿠폰, 편지 네 구역을 한 탭에 모은다.
// admin과 maintainer 모두 동일하게 사용하며, maintainer의 이메일 비노출은 서버 투영이 강제한다.
import type { CommsSection } from '../routes';
import CouponsTab from './CouponsTab';
import LettersTab from './LettersTab';
import MailTab from './MailTab';
import NoticesTab from './NoticesTab';

export default function CommsTab({ section, mailTo, onCompose }: {
  section: CommsSection;
  onSection?: (section: CommsSection) => void;
  /** 이 계정을 받는 사람으로 넣고 우편 쓰기를 연다 */
  onCompose: (userId: string) => void;
  /** 우편 쓰기에 미리 넣을 받는 사람(계정 id). 다른 화면의 우편 보내기에서 넘어올 때만 있다 */
  mailTo: string | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      {section === 'mail' && <MailTab key={mailTo ?? ''} to={mailTo} />}
      {section === 'notices' && <NoticesTab />}
      {section === 'coupons' && <CouponsTab />}
      {section === 'letters' && <LettersTab onCompose={onCompose} />}
    </div>
  );
}
