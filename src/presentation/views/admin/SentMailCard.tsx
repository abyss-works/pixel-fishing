// 보낸 우편 상세 카드 — 우편 탭 상세 보기와 편지 탭 답장 우편 미리보기가 공용으로 사용한다.
import Badge from '../../ui/Badge';
import HatBadge from '../../ui/HatBadge';
import Inset from '../../ui/Inset';
import ItemBadge from '../../ui/ItemBadge';
import KeyValueRow from '../../ui/KeyValueRow';
import { fmtGold } from '../../ui/format';
import type { AdminIdentity } from '../../../features/admin/model/adminViews';
import { formatMailHatsSummary, formatMailItemsSummary } from '../../../features/admin/model/mailDraft';
import { fmtDT } from '../../../features/admin/model/metrics';
import { sentMailStatus, type SentMailStatus } from '../../../features/admin/model/sentMailView';
import type { AdminSentMailRow } from '../../../features/admin/model/types';
import UserIdentity from './UserIdentity';

const STATUS_TONE: Record<SentMailStatus, 'gold' | 'accent' | 'dim'> = {
  받음: 'gold',
  읽음: 'accent',
  '안 읽음': 'dim',
};

export default function SentMailCard({ mail, recipient }: {
  mail: AdminSentMailRow;
  recipient?: AdminIdentity;
}) {
  const items = mail.items ?? [];
  const hats = mail.hats ?? [];
  const status = sentMailStatus(mail);

  return (
    <Inset className="flex flex-col gap-3 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-sm font-bold text-text break-words">{mail.title}</div>
        <Badge tone={STATUS_TONE[status]} size="xs">{status}</Badge>
      </div>

      <Inset tone="deep" className="p-2.5">
        <div className="text-xs text-text whitespace-pre-wrap break-words select-text">
          {mail.body}
        </div>
      </Inset>

      <Inset divided>
        {recipient && (
          <KeyValueRow compact wrap label="받는 사람" value={<UserIdentity user={recipient} inline />} />
        )}
        <KeyValueRow compact label="첨부 골드" value={mail.gold > 0 ? fmtGold(mail.gold) : '없음'} />
        <KeyValueRow
          compact
          wrap
          label="첨부 아이템"
          value={items.length > 0 ? formatMailItemsSummary(items) : '없음'}
        />
        <KeyValueRow
          compact
          wrap
          label="첨부 모자"
          value={hats.length > 0 ? formatMailHatsSummary(hats) : '없음'}
        />
        <KeyValueRow compact label="발송 시각" value={fmtDT(mail.createdAt)} />
        <KeyValueRow compact label="읽음 시각" value={mail.readAt ? fmtDT(mail.readAt) : '안 읽음'} />
        <KeyValueRow compact label="수령 시각" value={mail.claimedAt ? fmtDT(mail.claimedAt) : '미수령'} />
      </Inset>

      {(items.length > 0 || hats.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {items.map(att => <ItemBadge key={att.id} id={att.id} qty={att.qty} />)}
          {hats.map(hatId => <HatBadge key={hatId} id={hatId} />)}
        </div>
      )}
    </Inset>
  );
}
