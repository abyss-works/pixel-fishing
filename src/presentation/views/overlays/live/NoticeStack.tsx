import type { NoticeItem } from '../../../../game/rules/live';
import Button from '../../../ui/Button';
import { cx } from '../../../ui/cx';
import Frame from '../../../ui/Frame';
import { HEADER_BELOW_TOP_CLASS } from '../../../ui/hud/headerTier';
import NoticeMarkdown from '../../../ui/NoticeMarkdown';

/** 상단 공지 배너 카드. 게임 내 상단 공지와 관리자 미리보기에서 공유한다. */
export function NoticeBanner({
  notice,
  totalCount = 1,
  onDismiss,
}: {
  notice: Pick<NoticeItem, 'id' | 'title' | 'body'>;
  totalCount?: number;
  onDismiss?: (id: number) => void;
}) {
  return (
    <Frame
      role="region"
      aria-label="상단 공지"
      className="pointer-events-auto flex flex-col gap-2 border-gold p-3 shadow-panel"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="m-0 min-w-0 flex-1 text-sm font-bold text-gold break-words">
          {notice.title}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {totalCount > 1 && (
            <span className="pf-accent text-2xs text-text-dim tabular-nums">
              {`1 / ${totalCount}`}
            </span>
          )}
          {onDismiss && (
            <Button
              size="xs"
              aria-label="공지 닫기"
              onClick={() => onDismiss(notice.id)}
            >
              닫기
            </Button>
          )}
        </div>
      </div>
      <NoticeMarkdown body={notice.body} className="text-text" />
    </Frame>
  );
}

/** 스테이지 영역 상단(--z-toast)에 기간제 공지를 한 겹씩 띄운다.
 *  여러 건이 겹치면 뒤 카드 가장자리와 순번(1 / N)을 보이고, 닫기 버튼으로 맨 앞 카드부터 닫는다. */
export default function NoticeStack({
  notices,
  onDismiss,
}: {
  notices: readonly NoticeItem[];
  onDismiss: (id: number) => void;
}) {
  if (notices.length === 0) return null;
  const front = notices[0];

  return (
    <div
      className={cx(
        'pointer-events-none absolute z-(--z-toast) pc:inset-x-3 mx-auto w-[min(560px,calc(100%-24px))]',
        HEADER_BELOW_TOP_CLASS,
        'mobile:row-start-2 mobile:row-end-3 mobile:col-span-full mobile:inset-x-2 mobile:top-2 mobile:w-auto',
      )}
    >
      <NoticeBanner notice={front} totalCount={notices.length} onDismiss={onDismiss} />
      {notices.length > 1 && (
        <div aria-hidden="true" className="mx-2 h-1.5 border-x border-b border-line bg-surface-2" />
      )}
      {notices.length > 2 && (
        <div aria-hidden="true" className="mx-4 h-1 border-x border-b border-line-dim bg-surface" />
      )}
    </div>
  );
}
