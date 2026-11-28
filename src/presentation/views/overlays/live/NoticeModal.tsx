import { useState } from 'react';
import type { NoticeItem } from '../../../../game/rules/live';
import { cx } from '../../../ui/cx';
import EmptyState from '../../../ui/EmptyState';
import Inset from '../../../ui/Inset';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import NoticeMarkdown from '../../../ui/NoticeMarkdown';
import TabBar from '../../../ui/TabBar';
import { SCROLL_Y } from '../../../ui/scrollArea';

type NoticeTab = 'active' | 'ended';

const KST_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

interface KstParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
}

function kstPartsOf(ms: number): KstParts {
  const map: Record<string, string> = {};
  for (const part of KST_PARTS.formatToParts(new Date(ms))) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  return {
    year: map.year ?? '',
    month: map.month ?? '',
    day: map.day ?? '',
    hour: map.hour ?? '00',
    minute: map.minute ?? '00',
  };
}

function formatKstTime(p: KstParts): string {
  return `${p.hour}:${p.minute}`;
}

function formatKstDate(p: KstParts): string {
  return `${p.month}월 ${p.day}일 ${formatKstTime(p)}`;
}

function formatNoticeRange(startsAt: string, endsAt: string): string {
  const startMs = Date.parse(startsAt);
  if (!Number.isFinite(startMs)) return '';
  const start = kstPartsOf(startMs);
  const endMs = Date.parse(endsAt);
  if (!Number.isFinite(endMs)) return formatKstDate(start);
  const end = kstPartsOf(endMs);
  const sameDay = start.year === end.year && start.month === end.month && start.day === end.day;
  return sameDay
    ? `${formatKstDate(start)} - ${formatKstTime(end)}`
    : `${formatKstDate(start)} - ${formatKstDate(end)}`;
}

/** 공지사항 창에서 사용하는 단일 공지 카드. 관리자 미리보기와 공유한다. */
export function NoticeModalCard({
  notice,
  ended = false,
}: {
  notice: Pick<NoticeItem, 'title' | 'body' | 'startsAt' | 'endsAt'>;
  ended?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className={cx('text-sm font-bold break-words', ended ? 'text-text' : 'text-gold')}>
          {notice.title}
        </span>
        <span className="pf-accent shrink-0 text-2xs text-text-dim tabular-nums">
          {formatNoticeRange(notice.startsAt, notice.endsAt)}
        </span>
      </div>
      <NoticeMarkdown body={notice.body} className={ended ? 'text-text-dim' : 'text-text'} />
    </div>
  );
}

function NoticeModalBody({
  activeNotices,
  endedNotices,
  onClose,
}: {
  activeNotices: readonly NoticeItem[];
  endedNotices: readonly NoticeItem[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<NoticeTab>('active');
  const list = tab === 'active' ? activeNotices : endedNotices;
  const isEnded = tab === 'ended';

  return (
    <ModalCard title="공지사항" onClose={onClose} fixed>
      <TabBar<NoticeTab>
        inline
        className="shrink-0"
        tabs={[
          { key: 'active', label: '현재 공지', count: activeNotices.length },
          { key: 'ended', label: '지난 공지', count: endedNotices.length },
        ]}
        activeKey={tab}
        onSelect={setTab}
      />

      <div className={cx(SCROLL_Y, 'flex-1 min-h-0 flex flex-col')}>
        {list.length === 0 ? (
          <EmptyState
            className="flex-1"
            message={
              isEnded ? (
                '아직 지난 공지가 없어요.'
              ) : endedNotices.length > 0 ? (
                <span className="whitespace-pre-line">
                  {'지금 진행 중인 공지가 없어요.\n지난 공지 탭에서 이전 공지를 확인해 보세요.'}
                </span>
              ) : (
                '지금 올라온 공지사항이 없어요.'
              )
            }
          />
        ) : (
          <Inset divided tone={isEnded ? 'deep' : 'base'} className="flex flex-col">
            {list.map(notice => (
              <NoticeModalCard key={notice.id} notice={notice} ended={isEnded} />
            ))}
          </Inset>
        )}
      </div>
    </ModalCard>
  );
}

/** 현재 공지와 지난 공지를 인라인 서브탭으로 구분해 보여 주는 고정 높이 스테이지 창. */
export default function NoticeModal({
  open,
  activeNotices,
  endedNotices,
  onClose,
}: {
  open: boolean;
  activeNotices: readonly NoticeItem[];
  endedNotices: readonly NoticeItem[];
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <Modal layer="stage" md height={520} mobileFixed onClose={onClose}>
      <NoticeModalBody activeNotices={activeNotices} endedNotices={endedNotices} onClose={onClose} />
    </Modal>
  );
}
