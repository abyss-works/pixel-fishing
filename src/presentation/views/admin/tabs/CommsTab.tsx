// 소통 탭 — 플레이어와 주고받는 네 구역(편지, 우편, 공지, 쿠폰)을 한 탭에 모은다.
// maintainer 역할에서는 편지·우편 청크를 불러오지 않고 공지·쿠폰 구역만 노출한다.
import { Suspense, lazy } from 'react';
import SubTabs from '../../../ui/SubTabs';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { TabPage } from '../layout';
import { sectionsForRole } from '../routes';
import type { CommsSection } from '../routes';
import CouponsTab from './CouponsTab';
import NoticesTab from './NoticesTab';

const LettersTab = lazy(() => import('./LettersTab'));
const MailTab = lazy(() => import('./MailTab'));

const CONTEXT: Record<CommsSection, string> = {
  letters: '유저가 보낸 편지를 모두 볼 수 있어요. 우편으로 답장하고, 마친 편지는 처리 표시를 남겨요.',
  mail: '플레이어에게 우편을 보내고 읽음·받음을 확인해요. 보내기 전에 미리보기로 대상과 골드 합계를 확인해요.',
  notices: '게임 상단 공지 카드와 공지사항 창에 띄울 기간제 공지를 등록하고 관리해요.',
  coupons: '보상 쿠폰을 발행하고 유효 기간과 사용 현황을 관리해요.',
};

export default function CommsTab({ section, onSection, mailTo, onCompose }: {
  section: CommsSection; onSection: (section: CommsSection) => void;
  /** 이 계정을 받는 사람으로 넣고 우편 쓰기를 연다 */
  onCompose: (userId: string) => void;
  /** 우편 쓰기에 미리 넣을 받는 사람(계정 id). 다른 화면의 우편 보내기에서 넘어올 때만 있다 */
  mailTo: string | null;
}) {
  const { role } = useAdminAuth();
  const isAdmin = role === 'admin';
  const sections = sectionsForRole('comms', role);
  const activeSection: CommsSection = sections.some(s => s.key === section) ? section : sections[0].key;

  return (
    <TabPage title="소통" context={CONTEXT[activeSection]}>
      <div className="max-w-[520px]">
        <SubTabs items={sections.map(s => ({ key: s.key, label: s.label }))}
                 activeKey={activeSection} onSelect={onSection} />
      </div>
      {isAdmin && activeSection === 'letters' && (
        <Suspense fallback={null}>
          <LettersTab onCompose={onCompose} />
        </Suspense>
      )}
      {isAdmin && activeSection === 'mail' && (
        <Suspense fallback={null}>
          <MailTab key={mailTo ?? ''} to={mailTo} />
        </Suspense>
      )}
      {activeSection === 'notices' && <NoticesTab />}
      {activeSection === 'coupons' && <CouponsTab />}
    </TabPage>
  );
}
