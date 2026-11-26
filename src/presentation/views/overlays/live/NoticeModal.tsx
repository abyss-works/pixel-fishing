import type { NoticeItem } from '../../../../game/rules/live';
import EmptyState from '../../../ui/EmptyState';
import Inset from '../../../ui/Inset';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';

function formatNoticeTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatNoticeDate(d: Date): string {
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${formatNoticeTime(d)}`;
}

function formatNoticeRange(startsAt: string, endsAt: string): string {
  const startMs = Date.parse(startsAt);
  if (!Number.isFinite(startMs)) return '';
  const start = new Date(startMs);
  const endMs = Date.parse(endsAt);
  if (!Number.isFinite(endMs)) return formatNoticeDate(start);
  const end = new Date(endMs);
  const sameDay = start.getFullYear() === end.getFullYear()
    && start.getMonth() === end.getMonth()
    && start.getDate() === end.getDate();
  return sameDay
    ? `${formatNoticeDate(start)} - ${formatNoticeTime(end)}`
    : `${formatNoticeDate(start)} - ${formatNoticeDate(end)}`;
}

/** 활성 기간제 공지를 최신순 단일 목록으로 보여 주는 스테이지 창. */
export default function NoticeModal({
  open,
  notices,
  onClose,
}: {
  open: boolean;
  notices: readonly NoticeItem[];
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <Modal layer="stage" md onClose={onClose}>
      <ModalCard title="공지사항" onClose={onClose}>
        {notices.length === 0 ? (
          <EmptyState message="지금 올라온 공지사항이 없어요." />
        ) : (
          <Inset divided className="flex flex-col">
            {notices.map(notice => (
              <div key={notice.id} className="flex flex-col gap-1.5 px-3 py-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-bold text-gold break-words">
                    {notice.title}
                  </span>
                  <span className="pf-accent shrink-0 text-2xs text-text-dim tabular-nums">
                    {formatNoticeRange(notice.startsAt, notice.endsAt)}
                  </span>
                </div>
                <p className="m-0 text-xs leading-relaxed text-text whitespace-pre-wrap break-words">
                  {notice.body}
                </p>
              </div>
            ))}
          </Inset>
        )}
      </ModalCard>
    </Modal>
  );
}
