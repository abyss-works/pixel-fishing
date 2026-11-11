import type { BaitRefundNotice } from '../../../../features/inventory/model/baitRefund';
import Frame from '../../../ui/Frame';
import KeyValueRow from '../../../ui/KeyValueRow';
import NoticeBody from '../../../ui/NoticeBody';
import NoticeDialog from '../../../ui/NoticeDialog';
import { fmtGold } from '../../../ui/format';

/**
 * 미끼 환불 안내 창 - 세이브 이관이 미끼를 골드로 바꿔 준 내용을 한 번 알린다. 공용 안내 창에 문안과 영수증 목록을 담는다.
 * 문안과 목록은 기능 모델이 만든 값 그대로고, 닫으면 호출한 쪽이 영수증을 지운다.
 */
export default function BaitRefundModal({ notice, onClose }: { notice: BaitRefundNotice; onClose: () => void }) {
  const [lead, ...rest] = notice.lines;
  return (
    <NoticeDialog title={notice.title} onClose={onClose} body={
      <div className="flex flex-col gap-3">
        <NoticeBody lead={lead}>
          {rest.map(line => <p key={line}>{line}</p>)}
        </NoticeBody>
        <Frame divided aria-label="환불 내역">
          {notice.rows.map(row => <KeyValueRow key={row.id} label={row.name} value={`${row.count}개`} valueEnd />)}
          <KeyValueRow label="환불 골드" value={<span className="pf-accent text-gold">{fmtGold(notice.gold)}</span>} valueEnd />
        </Frame>
      </div>
    } />
  );
}
