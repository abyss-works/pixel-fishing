import { useState } from 'react';
import type { DailyFortune, FortuneKind } from '../../../../game/rules/fortune';
import {
  FORTUNE_CALENDAR_NOTE,
  FORTUNE_INDEX_LABEL,
  FORTUNE_KIND,
  FORTUNE_WEEKDAYS,
  buildFortuneCalendarCells,
  canGoNextFortuneMonth,
  canGoPrevFortuneMonth,
  currentGameDay,
  currentGameMonth,
  formatFortuneDay,
  formatFortuneMonth,
  fortunePhrase,
  resolveSelectedFortuneDay,
  selectFortuneDayDetail,
  selectFortuneMonthStats,
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
import Locked from '../../../ui/Locked';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import Note from '../../../ui/Note';
import Skeleton from '../../../ui/Skeleton';
import { SCROLL_Y, SCROLL_Y_ROWS } from '../../../ui/scrollArea';
import { HighlightRarityText } from '../../../ui/fish/RarityTag';
import { FortuneMotifIcon, IndexPips, TodayFortuneBanner } from './fortuneParts';

const KIND_TONE: Record<FortuneKind, string> = {
  fish: 'text-accent',
  gold: 'text-gold',
  shadow: 'text-epic',
};

const KIND_ORDER: readonly FortuneKind[] = ['fish', 'gold', 'shadow'];

// 스테이지 메뉴 운세 창: 오늘 운세 요약과 함께 계정 사용자에게는 월간 달력·통계·선택 날짜 상세를,
// 게스트·확인 실패 상태에서는 공용 잠금 안내를 보여 준다.
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

  const lock = menuLock({ account: accountState, guestAllowed: false, feature: '월별 운세 달력' });
  const lockLines = lock.kind === 'none' ? null : lock.lines;
  const canLoadHistory = lockLines === null;
  const history = useFortuneHistory(navState.month, canLoadHistory);

  const todayDay = history.data?.currentDay ?? currentGameDay(openedAt);
  const todayFortune = history.data?.today ?? selectTodayFortune(gameFortune, openedAt);

  if (lockLines !== null) {
    return (
      <Modal layer="stage" onClose={onClose}>
        <ModalCard title="운세" onClose={onClose}>
          <div className="flex flex-col gap-3">
            {todayFortune ? (
              <TodayFortuneBanner fortune={todayFortune} />
            ) : (
              <EmptyState glyph="sparkle" message="오늘의 운세가 아직 정해지지 않았어요." />
            )}
            <Locked
              title="월별 운세 달력"
              description="매일 받은 지난 운세를 달력으로 확인해요."
              lines={lockLines}
              label="월별 운세 달력 잠금"
            >
              <Inset tone="deep" border="line-dim" className="p-4 text-center flex flex-col items-center gap-1.5">
                <span className="text-sm font-bold text-text-dim">월별 운세 달력 잠금</span>
                {lockLines.map(line => (
                  <span key={line} className="text-xs text-text-dim">{line}</span>
                ))}
              </Inset>
            </Locked>
          </div>
        </ModalCard>
      </Modal>
    );
  }

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
  const cells = buildFortuneCalendarCells(activeMonth, days, todayDay);
  const stats = selectFortuneMonthStats(days);
  const effectiveSelectedDay = resolveSelectedFortuneDay(activeMonth, days, todayDay, selectedDay);
  const detail = selectFortuneDayDetail(effectiveSelectedDay, days, todayDay);

  return (
    <Modal layer="stage" md height={560} mobileFixed onClose={onClose}>
      <ModalCard title="운세" onClose={onClose} fixed>
        <div className={cx('flex flex-col gap-3 flex-1 min-h-0', SCROLL_Y)}>
          {todayFortune ? (
            <TodayFortuneBanner fortune={todayFortune} showDate />
          ) : (
            <EmptyState glyph="sparkle" message="오늘의 운세가 아직 정해지지 않았어요." />
          )}

          {history.offline ? (
            <EmptyState glyph="sparkle" message="운세 달력은 연결된 상태에서만 볼 수 있어요." />
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="pf-accent text-base text-text">{formatFortuneMonth(activeMonth)}</span>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" disabled={!canPrev} onClick={() => moveMonth(-1)}>이전 달</Button>
                  <Button size="sm" disabled={!canNext} onClick={() => moveMonth(1)}>다음 달</Button>
                </div>
              </div>

              {history.loading ? (
                <div role="status" aria-label="운세 달력을 불러오는 중" className="flex flex-col gap-2">
                  <Skeleton className="h-[220px] w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : history.failed ? (
                <EmptyState
                  glyph="warn"
                  message={<>운세 달력을 불러오지 못했어요.<br />잠시 뒤 다시 시도해 주세요.</>}
                  action={<Button size="sm" onClick={history.retry}>다시 불러오기</Button>}
                />
              ) : (
                <>
                  <div
                    role="region"
                    aria-label={`${formatFortuneMonth(activeMonth)} 운세 달력`}
                  >
                    <div className="grid grid-cols-7 gap-1 mb-1">
                      {FORTUNE_WEEKDAYS.map(dow => (
                        <div key={dow} className="text-center text-2xs text-text-dim py-0.5">{dow}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 grid-rows-6 gap-1">
                      {cells.map(cell => {
                        if (cell.kind === 'blank') return <div key={cell.key} className="min-h-12" aria-hidden="true" />;
                        const isSelected = cell.day === effectiveSelectedDay;
                        const f = cell.fortune;
                        const kind = f ? FORTUNE_KIND[f.kind] : null;
                        const ariaLabel = f
                          ? `${formatFortuneDay(cell.day)}${cell.isToday ? ', 오늘' : ''}, ${kind!.name}, 지수 ${f.index}, ${FORTUNE_INDEX_LABEL[f.index]}`
                          : `${formatFortuneDay(cell.day)}${cell.isToday ? ', 오늘' : ''}, 기록 없음`;
                        return (
                          <Button
                            key={cell.key}
                            size="sm"
                            pressed={isSelected}
                            disabled={cell.isFuture || !f}
                            onClick={() => setSelectedDay(cell.day)}
                            aria-label={ariaLabel}
                            aria-pressed={isSelected}
                            className={cx(
                              'flex flex-col items-stretch justify-between gap-1 min-h-12 px-1.5 mobile:px-1 py-1 text-left font-normal',
                              isSelected && 'border-gold bg-(--inset-light)',
                              !isSelected && cell.isToday && 'border-accent',
                              !isSelected && !cell.isToday && !f && 'bg-bg border-line-dim text-text-dim',
                            )}
                          >
                            <span className="flex items-center justify-between w-full text-2xs font-bold leading-none">
                              <span>{cell.dateNum}</span>
                              {cell.isToday && <span className="text-accent mobile:hidden">오늘</span>}
                              {cell.isToday && <span className="hidden mobile:inline-block size-1.5 bg-accent" aria-hidden="true" />}
                            </span>
                            {f ? (
                              <span className={cx('flex flex-wrap items-end justify-between gap-x-0.5 gap-y-0.5 w-full text-2xs leading-tight', KIND_TONE[f.kind])}>
                                <span className="font-bold break-keep mobile:hidden">{kind!.name}</span>
                                <span className="hidden mobile:inline-flex">
                                  <FortuneMotifIcon kind={f.kind} size={10} />
                                </span>
                                <span className="pf-accent shrink-0">{f.index}</span>
                              </span>
                            ) : (
                              <span className="text-2xs leading-none" aria-hidden="true">&nbsp;</span>
                            )}
                          </Button>
                        );
                      })}
                      {Array.from({ length: Math.max(0, 42 - cells.length) }, (_, idx) => (
                        <div key={`trail-${idx}`} className="min-h-12" aria-hidden="true" />
                      ))}
                    </div>
                  </div>

                  <Inset className="h-[116px] mobile:h-[132px] shrink-0 px-3 py-2.5" aria-label="선택한 날짜 운세 상세">
                    <div className={cx(SCROLL_Y_ROWS, 'h-[92px] mobile:h-[108px] flex flex-col gap-1.5')}>
                      {days.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center text-xs text-text-dim">
                          이 달에는 기록된 운세가 없어요.
                        </div>
                      ) : detail && detail.fortune ? (
                        <>
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-text">{detail.dateLabel}</span>
                              {detail.isToday && <Badge tone="accent" size="2xs">오늘</Badge>}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={cx('text-xs font-bold', KIND_TONE[detail.fortune.kind])}>
                                {FORTUNE_KIND[detail.fortune.kind].name}
                              </span>
                              <IndexPips index={detail.fortune.index} compact />
                              <span className="pf-accent text-xs text-gold">{detail.fortune.index}</span>
                              <span className="text-2xs text-text-dim">{FORTUNE_INDEX_LABEL[detail.fortune.index]}</span>
                            </div>
                          </div>
                          <span className="text-2xs text-text-dim">{fortunePhrase(detail.fortune)}</span>
                          <div className="flex items-center justify-between gap-2 flex-wrap text-xs mt-auto">
                            <span className="text-text-dim">
                              보너스 대상{' '}
                              <span className="text-text">
                                <HighlightRarityText text={FORTUNE_KIND[detail.fortune.kind].bonus} />
                              </span>
                            </span>
                            <span className="text-accent pf-accent">{`×${(1 + detail.fortune.index / 100).toFixed(2)}`}</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex-1 flex items-center justify-center text-xs text-text-dim">
                          기록이 있는 날짜를 고르면 운세 상세를 볼 수 있어요.
                        </div>
                      )}
                    </div>
                  </Inset>

                  <div className="grid grid-cols-4 mobile:grid-cols-2 gap-1.5" aria-label="월간 운세 집계">
                    <Inset className="flex min-w-0 flex-col gap-0.5 px-3 py-2">
                      <span className="text-2xs text-text-dim">이번 달 기록</span>
                      <span className={cx('pf-accent text-base', stats.total > 0 ? 'text-gold' : 'text-text-dim')}>
                        {`${stats.total}일`}
                      </span>
                    </Inset>
                    {KIND_ORDER.map(kindKey => (
                      <Inset key={kindKey} className="flex min-w-0 flex-col gap-0.5 px-3 py-2">
                        <span className="text-2xs text-text-dim">{FORTUNE_KIND[kindKey].name}</span>
                        <span className={cx('pf-accent text-base', stats.byKind[kindKey] > 0 ? KIND_TONE[kindKey] : 'text-text-dim')}>
                          {`${stats.byKind[kindKey]}회`}
                        </span>
                      </Inset>
                    ))}
                  </div>
                </>
              )}

              <Note size="2xs" className="my-0 text-center">{FORTUNE_CALENDAR_NOTE}</Note>
            </>
          )}
        </div>
      </ModalCard>
    </Modal>
  );
}
