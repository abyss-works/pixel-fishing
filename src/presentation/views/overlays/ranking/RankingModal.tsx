import { useState } from 'react';
import {
  RANKING_GROUPS,
  formatRankingWeekLabel,
  isPeriodRankingBoard,
  pinnedMyRank,
  rankingGroupOf,
  rankingTabMeta,
  rankingValueView,
} from '../../../../features/ranking/model/ranking';
import type { MainRankingBoardId, RankingGroupId, RankingWindow } from '../../../../features/ranking/model/ranking';
import { useRankingBoard } from '../../../../features/ranking/service/useRanking';
import { useMobileLayout } from '../../../layouts/useMobileLayout';
import ArrowButton from '../../../ui/ArrowButton';
import Badge from '../../../ui/Badge';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import ProgressCount from '../../../ui/ProgressCount';
import RankList, { RankMeBar } from '../../../ui/RankList';
import Select from '../../../ui/Select';
import TabBar from '../../../ui/TabBar';
import TableBox from '../../../ui/TableBox';
import ToggleChip from '../../../ui/ToggleChip';
import RankingStatus from './RankingStatus';

// 랭킹 창. 게임 스테이지 안에 뜬다(햄버거 메뉴·거점 게시판에서 여는 게임 안 창). 680 폭에 높이를 고정하고,
// 상단 두 탭(랭킹, 도감)과 왼쪽 항목 레일(모바일은 가로 3버튼 행)로 세부 보드를 전환하며 활성 보드만 지연 조회한다.
// 기간 지원 보드(명성, 판매골드, 네임드 토벌)는 주간/전체 누적을 전환하고, 주간에서는 주차 선택기로 지난 주도 조회한다.
// 순위 표와 하단 고정 내 순위 바는 공용 RankList 규칙(1~3위 골드, 내 줄 하늘색 구분, 오른쪽 수치 골드 강조)을 따른다.
const GROUP_TABS = RANKING_GROUPS.map(({ key, label }) => ({ key, label }));

function renderBoardValue(board: MainRankingBoardId, value: number) {
  const view = rankingValueView(board, value);
  return view.kind === 'ratio'
    ? <ProgressCount current={view.current} target={view.total} percent={view.percent} />
    : <ProgressCount value={view.text} />;
}

export default function RankingModal({
  guest = false,
  nickname = null,
  onClose,
}: {
  guest?: boolean;
  nickname?: string | null;
  onClose: () => void;
}) {
  const [board, setBoard] = useState<MainRankingBoardId>('fame');
  const [periodWindow, setPeriodWindow] = useState<RankingWindow>('weekly');
  const [selectedWeek, setSelectedWeek] = useState<string | undefined>(undefined);

  const group: RankingGroupId = rankingGroupOf(board);
  const groupBoards = RANKING_GROUPS.find(g => g.key === group)?.boards ?? [];
  const periodSupported = isPeriodRankingBoard(board);
  const window: RankingWindow = periodSupported ? periodWindow : 'all';

  const handleGroupSelect = (nextGroup: RankingGroupId) => {
    if (nextGroup === group) return;
    const firstBoard = RANKING_GROUPS.find(g => g.key === nextGroup)?.boards[0];
    if (!firstBoard) return;
    setBoard(firstBoard);
    setSelectedWeek(undefined);
  };

  const handleBoardSelect = (nextBoard: MainRankingBoardId) => {
    setBoard(nextBoard);
    setSelectedWeek(undefined);
  };

  const handleWindowSelect = (nextWindow: RankingWindow) => {
    setPeriodWindow(nextWindow);
    setSelectedWeek(undefined);
  };

  return (
    // 탭이 있는 창의 높이 520px. 스테이지가 낮으면 위아래 16px을 남긴다
    <Modal layer="stage" md mobileFixed height={520} onClose={onClose}>
      <ModalCard title="랭킹" onClose={onClose} fixed>
        <div className="flex flex-col gap-2.5 flex-1 min-h-0">
          <TabBar<RankingGroupId>
            activeKey={group}
            onSelect={handleGroupSelect}
            tabs={GROUP_TABS}
          />
          <div className="grid grid-cols-[136px_minmax(0,1fr)] gap-3 flex-1 min-h-0 mobile:grid-cols-1 mobile:grid-rows-[auto_minmax(0,1fr)] mobile:gap-2">
            <nav aria-label="랭킹 분류" className="flex flex-col gap-1 mobile:grid mobile:grid-cols-3 mobile:gap-1">
              {groupBoards.map(id => {
                const meta = rankingTabMeta(id);
                const active = board === id;
                return (
                  <ToggleChip
                    key={id}
                    size="sm"
                    variant="choice"
                    pressed={active}
                    emphasis={active}
                    onClick={() => handleBoardSelect(id)}
                    className="w-full justify-start mobile:justify-center mobile:px-1.5"
                  >
                    {meta.label}
                  </ToggleChip>
                );
              })}
            </nav>
            <RankingBoardView
              board={board}
              window={window}
              selectedWeek={selectedWeek}
              onSelectWindow={handleWindowSelect}
              onSelectWeek={setSelectedWeek}
              guest={guest}
              nickname={nickname}
            />
          </div>
        </div>
      </ModalCard>
    </Modal>
  );
}

/** 기간 선택 및 주차 이동 바 — 기간 지원 보드는 주간/전체 누적과 주차 선택기를 보이고, 도감 보드는 전체 누적 고정 안내를 보인다 */
function RankingPeriodBar({
  periodSupported,
  window,
  availableWeeks,
  activeWeek,
  onSelectWindow,
  onSelectWeek,
}: {
  periodSupported: boolean;
  window: RankingWindow;
  availableWeeks: readonly string[];
  activeWeek: string | null;
  onSelectWindow: (next: RankingWindow) => void;
  onSelectWeek: (week: string | undefined) => void;
}) {
  if (!periodSupported) {
    return (
      <div className="h-8 shrink-0 flex items-center justify-between gap-2 px-0.5">
        <Badge tone="dim" size="xs">전체 누적 기준</Badge>
        <span className="min-w-0 truncate text-2xs text-text-dim text-right">
          전체 누적 기록으로만 순위를 매겨요.
        </span>
      </div>
    );
  }

  const weeks = availableWeeks.length > 0 ? availableWeeks : (activeWeek ? [activeWeek] : []);
  const currentWeek = weeks[0] ?? null;
  const idx = activeWeek ? weeks.indexOf(activeWeek) : 0;
  const prevWeek = idx >= 0 && idx + 1 < weeks.length ? weeks[idx + 1] : null;
  const nextWeek = idx > 0 ? weeks[idx - 1] : null;

  return (
    <div className="h-8 mobile:h-auto shrink-0 flex items-center justify-between gap-2 px-0.5 mobile:flex-wrap">
      <div role="group" aria-label="집계 기간" className="flex items-center gap-1 shrink-0">
        <ToggleChip
          size="sm"
          variant="choice"
          pressed={window === 'weekly'}
          emphasis={window === 'weekly'}
          onClick={() => onSelectWindow('weekly')}
        >
          주간
        </ToggleChip>
        <ToggleChip
          size="sm"
          variant="choice"
          pressed={window === 'all'}
          emphasis={window === 'all'}
          onClick={() => onSelectWindow('all')}
        >
          전체 누적
        </ToggleChip>
      </div>
      {window === 'weekly' ? (
        <div className="flex items-center gap-1 min-w-0">
          <ArrowButton
            dir={-1}
            aria-label="이전 주"
            disabled={!prevWeek}
            onClick={() => { if (prevWeek) onSelectWeek(prevWeek); }}
          />
          <Select
            compact="sm"
            aria-label="조회 주차"
            value={activeWeek ?? ''}
            disabled={weeks.length <= 1}
            onChange={e => onSelectWeek(e.target.value || undefined)}
            className="min-w-0 max-w-[176px]"
          >
            {weeks.map(w => (
              <option key={w} value={w}>{formatRankingWeekLabel(w, currentWeek)}</option>
            ))}
          </Select>
          <ArrowButton
            dir={1}
            aria-label="다음 주"
            disabled={!nextWeek}
            onClick={() => { if (nextWeek) onSelectWeek(nextWeek); }}
          />
        </div>
      ) : (
        <span className="min-w-0 truncate text-2xs text-text-dim text-right">
          전체 누적 기록
        </span>
      )}
    </div>
  );
}

/** 한 탭의 본문: 기간/주차 바 + 활성 보드 지연 조회 결과 + 표 아래 내 순위 자리 */
function RankingBoardView({
  board,
  window,
  selectedWeek,
  onSelectWindow,
  onSelectWeek,
  guest,
  nickname,
}: {
  board: MainRankingBoardId;
  window: RankingWindow;
  selectedWeek: string | undefined;
  onSelectWindow: (next: RankingWindow) => void;
  onSelectWeek: (week: string | undefined) => void;
  guest: boolean;
  nickname: string | null;
}) {
  const mobile = useMobileLayout();
  const periodSupported = isPeriodRankingBoard(board);
  const { data, loading, failed, offline, retry } = useRankingBoard(board, window, selectedWeek);
  const { valueLabel, help } = rankingTabMeta(board);
  const listed = !!data && data.top.length > 0;
  const mine = data ? pinnedMyRank(data) : null;
  const myLabel = nickname ?? data?.top.find(r => r.me)?.nickname ?? '나';
  const availableWeeks = data?.availableWeeks ?? [];
  const activeWeek = selectedWeek ?? data?.weekStart ?? availableWeeks[0] ?? null;
  const isCurrentWeek = !activeWeek || availableWeeks.length === 0 || activeWeek === availableWeeks[0];
  const emptyMessage = !data || mine
    ? null
    : guest
      ? '구글 계정을 연결하면 내 순위를 기록할 수 있어요.'
      : window === 'weekly'
        ? (isCurrentWeek ? '이번 주 순위 기록이 아직 없어요.' : '이 주간 순위 기록이 없어요.')
        : '전체 누적 기록이 아직 없어요.';
  const renderValue = (value: number) => renderBoardValue(board, value);

  return (
    <div className="flex flex-col gap-2.5 flex-1 min-h-0">
      <RankingPeriodBar
        periodSupported={periodSupported}
        window={window}
        availableWeeks={availableWeeks}
        activeWeek={activeWeek}
        onSelectWindow={onSelectWindow}
        onSelectWeek={onSelectWeek}
      />
      <TableBox className="flex-1 min-h-0 px-3 mobile:px-2.5 pb-2">
        {listed ? (
          <RankList
            embedded
            rows={data.top}
            me={null}
            valueLabel={valueLabel}
            valueHelp={help}
            cols={mobile ? ['2.5rem', null, '144px'] : ['3.5rem', null, '136px']}
            nameMin={mobile ? '4.5rem' : '6rem'}
            format={renderValue}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <RankingStatus loading={loading} failed={failed} offline={offline} empty={!!data} onRetry={retry} />
          </div>
        )}
      </TableBox>
      <RankMeBar me={mine} label={myLabel} emptyMessage={emptyMessage} reserveSpace format={renderValue} />
    </div>
  );
}
