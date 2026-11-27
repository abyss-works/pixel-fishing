import { useState } from 'react';
import {
  RANKING_TABS,
  isPeriodRankingBoard,
  pinnedMyRank,
  rankingTabMeta,
  rankingValueView,
} from '../../../../features/ranking/model/ranking';
import type { MainRankingBoardId, RankingWindow } from '../../../../features/ranking/model/ranking';
import { useRankingBoard } from '../../../../features/ranking/service/useRanking';
import { useMobileLayout } from '../../../layouts/useMobileLayout';
import Badge from '../../../ui/Badge';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import ProgressCount from '../../../ui/ProgressCount';
import RankList, { RankMeBar } from '../../../ui/RankList';
import TabBar from '../../../ui/TabBar';
import TableBox from '../../../ui/TableBox';
import ToggleChip from '../../../ui/ToggleChip';
import RankingStatus from './RankingStatus';

// 랭킹 창. 게임 스테이지 안에 뜬다(거점 게시판에서 여는 게임 안 창). 680 폭에 높이를 고정하고,
// 상단 탭 다섯(명성, 도감(일반), 도감(돌연변이), 도감(네임드), 네임드 토벌)을 전환하며 활성 탭만 지연 조회한다.
// 탭 아래 고정 높이 기간 바에서 명성과 네임드 토벌은 이번 주/전체 누적을 전환하고, 도감 탭은 전체 누적 고정 안내를 보인다.
// 순위 표와 하단 고정 내 순위 바는 공용 RankList 규칙(1~3위 골드, 내 줄 하늘색 구분, 오른쪽 수치 골드 강조)을 따른다.
const TABS = RANKING_TABS.map(({ key, label }) => ({ key, label }));

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
  const [tab, setTab] = useState<MainRankingBoardId>('fame');
  const [periodWindow, setPeriodWindow] = useState<RankingWindow>('weekly');
  const periodSupported = isPeriodRankingBoard(tab);
  const window: RankingWindow = periodSupported ? periodWindow : 'all';

  return (
    // 탭이 있는 창의 높이 520px. 스테이지가 낮으면 위아래 16px을 남긴다
    <Modal layer="stage" md mobileFixed height={520} onClose={onClose}>
      <ModalCard title="랭킹" onClose={onClose} fixed>
        <div className="flex flex-col gap-2.5 flex-1 min-h-0">
          <TabBar<MainRankingBoardId>
            activeKey={tab}
            onSelect={setTab}
            tabs={TABS}
            className="mobile:flex-wrap mobile:[&>button]:flex-[1_0_30%]"
          />
          <RankingPeriodBar
            periodSupported={periodSupported}
            window={window}
            onSelect={setPeriodWindow}
          />
          <RankingBoardView board={tab} window={window} guest={guest} nickname={nickname} />
        </div>
      </ModalCard>
    </Modal>
  );
}

/** 탭 아래 고정 높이 기간 선택 및 기준 안내 바 — 탭 전환 시 높이 변동이 없다 */
function RankingPeriodBar({
  periodSupported,
  window,
  onSelect,
}: {
  periodSupported: boolean;
  window: RankingWindow;
  onSelect: (next: RankingWindow) => void;
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
  return (
    <div className="h-8 shrink-0 flex items-center justify-between gap-2 px-0.5">
      <div role="group" aria-label="집계 기간" className="flex items-center gap-1 shrink-0">
        <ToggleChip
          size="sm"
          variant="choice"
          pressed={window === 'weekly'}
          emphasis={window === 'weekly'}
          onClick={() => onSelect('weekly')}
        >
          이번 주
        </ToggleChip>
        <ToggleChip
          size="sm"
          variant="choice"
          pressed={window === 'all'}
          emphasis={window === 'all'}
          onClick={() => onSelect('all')}
        >
          전체 누적
        </ToggleChip>
      </div>
      <span className="min-w-0 truncate text-2xs text-text-dim text-right">
        {window === 'weekly' ? '매주 월요일 새벽 4시 초기화' : '전체 누적 기록'}
      </span>
    </div>
  );
}

/** 한 탭의 본문: 활성 보드 지연 조회 결과와 표 아래 내 순위 자리 */
function RankingBoardView({
  board,
  window,
  guest,
  nickname,
}: {
  board: MainRankingBoardId;
  window: RankingWindow;
  guest: boolean;
  nickname: string | null;
}) {
  const mobile = useMobileLayout();
  const { data, loading, failed, offline, retry } = useRankingBoard(board, window);
  const { valueLabel, help } = rankingTabMeta(board);
  const listed = !!data && data.top.length > 0;
  const mine = data ? pinnedMyRank(data) : null;
  const myLabel = nickname ?? data?.top.find(r => r.me)?.nickname ?? '나';
  const emptyMessage = !data || mine
    ? null
    : guest
      ? '구글 계정을 연결하면 내 순위를 기록할 수 있어요.'
      : window === 'weekly'
        ? '이번 주 순위 기록이 아직 없어요.'
        : '전체 누적 기록이 아직 없어요.';
  const renderValue = (value: number) => renderBoardValue(board, value);

  return (
    <div className="flex flex-col gap-2.5 flex-1 min-h-0">
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
