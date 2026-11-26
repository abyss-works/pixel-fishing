import { useState } from 'react';
import type { DailyFortune } from '../../../../game/rules/fortune';
import {
  FORTUNE_INDEX_LABEL,
  FORTUNE_WEEKDAYS,
  buildFortuneCalendarCells,
  canGoNextFortuneMonth,
  canGoPrevFortuneMonth,
  currentGameDay,
  currentGameMonth,
  formatFortuneDay,
  formatFortuneMonth,
  fortuneHistoryDiscovered,
  fortuneLuckMultText,
  fortuneModalRows,
  fortuneName,
  fortunePhrase,
  fortuneShortName,
  resolveSelectedFortuneDay,
  selectFortuneDayDetail,
  selectTodayFortune,
  shiftFortuneMonth,
} from '../../../../features/fortune/model/fortune';
import { useFortuneHistory } from '../../../../features/fortune/service/useFortuneHistory';
import { menuLock } from '../../../../features/display/model/menuLock';
import type { AccountLockState } from '../../../../features/display/model/menuLock';
import Badge from '../../../ui/Badge';
import Button from '../../../ui/Button';
import { cx } from '../../../ui/cx';
import EmptyState from '../../../ui/EmptyState';
import Inset from '../../../ui/Inset';
import KeyValueRow from '../../../ui/KeyValueRow';
import Locked from '../../../ui/Locked';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import Skeleton from '../../../ui/Skeleton';
import SubTabs from '../../../ui/SubTabs';
import { HighlightRarityText } from '../../../ui/fish/RarityTag';
import FortuneCollectionTab from './FortuneCollectionTab';
import { FortuneMotifIcon, FortuneStrength } from './fortuneParts';
import { fortuneToneOf } from './fortuneTone';

type FortuneTab = 'calendar' | 'collection';

const FORTUNE_TABS: { key: FortuneTab; label: string }[] = [
  { key: 'calendar', label: '달력' },
  { key: 'collection', label: '점괘첩' },
];

function TodayMiniCard({ fortune }: { fortune: DailyFortune | null }) {
  return (
    <Inset
      tone="light"
      border="line"
      aria-label="오늘의 운세 요약"
      className="h-[56px] mobile:h-[40px] shrink-0 px-3 mobile:px-2.5 flex items-center justify-between gap-2.5"
    >
      {fortune ? (
        <>
          <div className="flex items-center gap-2.5 mobile:gap-2 min-w-0">
            <Inset tone="deep" className="size-9 mobile:size-7 shrink-0 flex items-center justify-center">
              <FortuneMotifIcon kind={fortune.kind} index={fortune.index} size={18} />
            </Inset>
            <div className="flex flex-col mobile:flex-row mobile:items-baseline mobile:gap-1.5 min-w-0 text-left">
              <span className="text-2xs text-text-dim leading-none">오늘의 운세</span>
              <span className={cx('text-sm mobile:text-xs font-bold leading-tight truncate', fortuneToneOf(fortune.kind))}>
                {fortuneName(fortune)}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end mobile:flex-row mobile:items-center mobile:gap-1.5 shrink-0">
            <span className="text-2xs text-gold font-bold leading-none">{FORTUNE_INDEX_LABEL[fortune.index]}</span>
            <span className="pf-accent text-xs text-accent leading-tight">{fortuneLuckMultText(fortune)}</span>
          </div>
        </>
      ) : (
        <span className="text-xs text-text-dim">오늘의 운세가 아직 정해지지 않았어요.</span>
      )}
    </Inset>
  );
}

function FortuneDetailPanel({
  fortune,
  dateLabel,
  isToday,
  emptyMessage,
}: {
  fortune: DailyFortune | null;
  dateLabel?: string;
  isToday?: boolean;
  emptyMessage: string;
}) {
  return (
    <Inset
      className="h-[340px] mobile:h-[192px] shrink-0 p-2.5 mobile:p-1.5 flex flex-col justify-between gap-2 mobile:gap-1 text-left"
      aria-label="선택한 날짜 운세 상세"
    >
      {fortune ? (
        <>
          <div className="flex items-center justify-between gap-2 shrink-0">
            <span className="text-xs mobile:text-2xs font-bold text-text leading-tight">{dateLabel ?? formatFortuneDay(fortune.day)}</span>
            {isToday && <Badge tone="accent" size="2xs" className="mobile:leading-tight">오늘</Badge>}
          </div>
          <Inset tone="light" className="px-2.5 py-1.5 mobile:px-2 mobile:py-0.5 flex items-center gap-2.5 mobile:gap-2 shrink-0">
            <Inset tone="deep" className="size-9 mobile:size-6 shrink-0 flex items-center justify-center">
              <FortuneMotifIcon kind={fortune.kind} index={fortune.index} size={20} className="mobile:size-4" />
            </Inset>
            <div className="flex flex-col gap-0.5 mobile:gap-0 min-w-0">
              <span className={cx('text-sm mobile:text-xs font-bold leading-tight truncate', fortuneToneOf(fortune.kind))}>
                {fortuneName(fortune)}
              </span>
              <FortuneStrength index={fortune.index} compact />
            </div>
          </Inset>
          <p className="m-0 text-xs mobile:text-2xs text-text-dim leading-[1.55] mobile:leading-[1.35] flex-1 min-h-0">
            {fortunePhrase(fortune)}
          </p>
          <Inset tone="deep" divided className="w-full shrink-0 text-left">
            {fortuneModalRows(fortune).map(row => (
              <KeyValueRow
                key={row.label}
                label={<HighlightRarityText text={row.label} />}
                value={row.accent ? row.value : <HighlightRarityText text={row.value} />}
                valueEnd
                className="text-xs py-1 mobile:py-0 mobile:px-1.5 mobile:leading-[1.35]"
                valueClassName={row.accent ? 'pf-accent text-accent' : undefined}
              />
            ))}
          </Inset>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center text-xs text-text-dim text-center">
          {emptyMessage}
        </div>
      )}
    </Inset>
  );
}

// 스테이지 메뉴 운세 창: 달력과 점괘첩 두 서브탭을 PC 680×500 / 모바일 552 고정 창 안에서 중첩 스크롤 없이 전환한다.
export default function FortuneCalendarModal({
  gameFortune,
  accountState,
  onClose,
}: {
  gameFortune: DailyFortune | null;
  accountState: AccountLockState;
  onClose: () => void;
}) {
  const [openedAt] = useState(() => new Date().toISOString());
  const [tab, setTab] = useState<FortuneTab>('calendar');
  const [navState, setNavState] = useState<{
    month: string | null;
    firstMonth: string | null;
    currentMonth: string;
  }>(() => ({
    month: null,
    firstMonth: null,
    currentMonth: currentGameMonth(openedAt),
  }));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const calendarLock = menuLock({ account: accountState, guestAllowed: false, feature: '월별 운세 달력' });
  const collectionLock = menuLock({ account: accountState, guestAllowed: false, feature: '점괘첩' });
  const lockLines = calendarLock.kind === 'none' ? null : calendarLock.lines;
  const collectionLockLines = collectionLock.kind === 'none' ? null : collectionLock.lines;
  const canLoadHistory = lockLines === null;
  const history = useFortuneHistory(navState.month, canLoadHistory);

  const todayDay = history.data?.currentDay ?? currentGameDay(openedAt);
  const todayFortune = history.data?.today ?? selectTodayFortune(gameFortune, openedAt);

  const firstMonth = history.data ? history.data.firstMonth : navState.firstMonth;
  const currentMonth = history.data ? history.data.currentDay.slice(0, 7) : navState.currentMonth;
  const activeMonth = navState.month ?? history.data?.month ?? currentMonth;
  const canPrev = !history.loading && canGoPrevFortuneMonth(activeMonth, firstMonth);
  const canNext = !history.loading && canGoNextFortuneMonth(activeMonth, currentMonth);

  const moveMonth = (delta: number) => {
    const target = shiftFortuneMonth(activeMonth, delta);
    setNavState({
      month: target === currentMonth ? null : target,
      firstMonth,
      currentMonth,
    });
    setSelectedDay(null);
  };

  const days = history.data?.days ?? [];
  const discovered = fortuneHistoryDiscovered(history.data);
  const cells = buildFortuneCalendarCells(activeMonth, days, todayDay);
  const effectiveSelectedDay = resolveSelectedFortuneDay(activeMonth, days, todayDay, selectedDay);
  const detail = selectFortuneDayDetail(effectiveSelectedDay, days, todayDay);

  const renderLeftPane = () => {
    if (lockLines !== null) {
      return (
        <Locked
          title="월별 운세 달력"
          description="매일 받은 지난 운세를 달력으로 확인해요."
          lines={lockLines}
          label="월별 운세 달력 잠금"
          className="block w-full"
        >
          <div className="flex flex-col gap-2 mobile:gap-1">
            <div className="flex items-center justify-between gap-2 shrink-0">
              <span className="pf-accent text-sm text-text-dim">{formatFortuneMonth(currentMonth)}</span>
              <div className="flex items-center gap-1.5">
                <Button size="sm" disabled>이전 달</Button>
                <Button size="sm" disabled>다음 달</Button>
              </div>
            </div>
            <Inset
              tone="deep"
              border="line-dim"
              className="h-[368px] mobile:h-[184px] flex items-center justify-center p-3 text-center"
            >
              <span className="text-xs font-bold text-text-dim">월별 운세 달력 잠금</span>
            </Inset>
          </div>
        </Locked>
      );
    }

    if (history.offline) {
      return (
        <Inset tone="deep" border="line-dim" className="flex-1 min-h-0 flex items-center justify-center p-3">
          <EmptyState glyph="sparkle" message="운세 달력은 연결된 상태에서만 볼 수 있어요." />
        </Inset>
      );
    }

    return (
      <div className="flex flex-col gap-2 mobile:gap-1 flex-1 min-h-0">
        <div className="flex items-center justify-between gap-2 shrink-0">
          <span className="pf-accent text-sm text-text">{formatFortuneMonth(activeMonth)}</span>
          <div className="flex items-center gap-1.5">
            <Button size="sm" disabled={!canPrev} onClick={() => moveMonth(-1)}>이전 달</Button>
            <Button size="sm" disabled={!canNext} onClick={() => moveMonth(1)}>다음 달</Button>
          </div>
        </div>

        {history.loading ? (
          <div role="status" aria-label="운세 달력을 불러오는 중" className="flex flex-col gap-2 flex-1 min-h-0">
            <Skeleton className="flex-1 w-full" />
          </div>
        ) : history.failed ? (
          <Inset tone="deep" border="line-dim" className="flex-1 min-h-0 flex items-center justify-center p-3">
            <EmptyState
              glyph="warn"
              message={<>운세 달력을 불러오지 못했어요.<br />잠시 뒤 다시 시도해 주세요.</>}
              action={<Button size="sm" onClick={history.retry}>다시 불러오기</Button>}
            />
          </Inset>
        ) : (
          <div
            role="region"
            aria-label={`${formatFortuneMonth(activeMonth)} 운세 달력`}
            className="flex flex-col flex-1 min-h-0"
          >
            <div className="grid grid-cols-7 gap-1 mobile:gap-0.5 mb-1 mobile:mb-0.5 shrink-0">
              {FORTUNE_WEEKDAYS.map(dow => (
                <div key={dow} className="text-center text-2xs text-text-dim py-0.5">{dow}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 grid-rows-6 gap-1 mobile:gap-0.5 flex-1 min-h-0">
              {cells.map(cell => {
                if (cell.kind === 'blank') return <div key={cell.key} aria-hidden="true" />;
                const isSelected = cell.day === effectiveSelectedDay;
                const f = cell.fortune;
                const dayState = f ? 'recorded' : cell.isFuture ? 'future' : 'unvisited';
                const stateDesc = f
                  ? `${fortuneName(f)}, ${FORTUNE_INDEX_LABEL[f.index]}`
                  : cell.isFuture ? '아직 오지 않은 날' : '운세를 뽑지 않은 날';
                const ariaLabel = `${formatFortuneDay(cell.day)}${cell.isToday ? ', 오늘' : ''}, ${stateDesc}`;
                return (
                  <Button
                    key={cell.key}
                    size="sm"
                    pressed={isSelected}
                    disabled={cell.isFuture || !f}
                    data-day-state={dayState}
                    onClick={() => setSelectedDay(cell.day)}
                    aria-label={ariaLabel}
                    aria-pressed={isSelected}
                    className={cx(
                      'min-h-0 min-w-0 flex flex-col items-stretch justify-between gap-0.5 mobile:gap-0 px-0.5 py-1 mobile:py-px text-left font-normal',
                      isSelected && 'border-gold bg-(--inset-light)',
                      !isSelected && cell.isToday && 'border-accent',
                      dayState === 'unvisited' && 'bg-(--inset-base) border-line-dim text-text-dim disabled:opacity-75',
                      dayState === 'future' && 'bg-bg border-line-dim text-text-dim disabled:opacity-35',
                    )}
                  >
                    <span className="flex items-center justify-between w-full text-2xs font-bold leading-none">
                      <span>{cell.dateNum}</span>
                      {cell.isToday && <span className="text-accent mobile:hidden">오늘</span>}
                      {cell.isToday && <span className="hidden mobile:inline-block size-1.5 bg-accent" aria-hidden="true" />}
                    </span>
                    {f ? (
                      <span className={cx('flex items-center gap-0.5 mobile:justify-center w-full text-2xs leading-tight', fortuneToneOf(f.kind))}>
                        <FortuneMotifIcon kind={f.kind} index={f.index} size={12} />
                        <span className="font-bold whitespace-nowrap mobile:hidden">{fortuneShortName(f)}</span>
                      </span>
                    ) : (
                      <span className="text-2xs leading-none" aria-hidden="true">&nbsp;</span>
                    )}
                  </Button>
                );
              })}
              {Array.from({ length: Math.max(0, 42 - cells.length) }, (_, idx) => (
                <div key={`trail-${idx}`} aria-hidden="true" />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const detailPanel = lockLines !== null || history.offline
    ? (
      <FortuneDetailPanel
        fortune={todayFortune}
        dateLabel={todayFortune ? formatFortuneDay(todayFortune.day) : undefined}
        isToday={todayFortune !== null}
        emptyMessage="오늘의 운세가 아직 정해지지 않았어요."
      />
    )
    : (
      <FortuneDetailPanel
        fortune={detail?.fortune ?? null}
        dateLabel={detail?.dateLabel}
        isToday={detail?.isToday}
        emptyMessage={days.length === 0 ? '이 달에는 기록된 운세가 없어요.' : '기록이 있는 날짜를 고르면 운세 상세를 볼 수 있어요.'}
      />
    );

  return (
    <Modal layer="stage" md height={500} mobileHeight={552} mobileFixed onClose={onClose}>
      <ModalCard title="운세" onClose={onClose} fixed>
        <SubTabs items={FORTUNE_TABS} activeKey={tab} onSelect={setTab} className="mb-0 shrink-0" />
        {tab === 'calendar' ? (
          <div className="grid grid-cols-[minmax(0,1fr)_232px] mobile:grid-cols-1 mobile:grid-rows-[minmax(0,1fr)_auto] gap-2.5 mobile:gap-1.5 flex-1 min-h-0">
            <div className="flex flex-col min-w-0 min-h-0">
              {renderLeftPane()}
            </div>
            <div className="flex flex-col gap-2 mobile:gap-1.5 min-w-0 min-h-0">
              <TodayMiniCard fortune={todayFortune} />
              {detailPanel}
            </div>
          </div>
        ) : (
          <FortuneCollectionTab
            discovered={discovered}
            lockLines={collectionLockLines}
            loading={history.loading}
            failed={history.failed}
            offline={history.offline}
            onRetry={history.retry}
          />
        )}
      </ModalCard>
    </Modal>
  );
}
