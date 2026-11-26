import { useState } from 'react';
import { RANKING_TABS, pinnedMyRank, rankingTabMeta, rankingValueView } from '../../../../features/ranking/model/ranking';
import type { MainRankingBoardId } from '../../../../features/ranking/model/ranking';
import { useRankingBoard } from '../../../../features/ranking/service/useRanking';
import { useMobileLayout } from '../../../layouts/useMobileLayout';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import ProgressCount from '../../../ui/ProgressCount';
import RankList, { RankMeBar } from '../../../ui/RankList';
import TabBar from '../../../ui/TabBar';
import TableBox from '../../../ui/TableBox';
import RankingStatus from './RankingStatus';

// 랭킹 창. 게임 스테이지 안에 뜬다(거점 게시판에서 여는 게임 안 창). 680 폭에 높이를 고정하고,
// 상단 탭 다섯(명성·도감(일반)·도감(돌연변이)·도감(네임드)·네임드 토벌)을 전환하며 활성 탭만 지연 조회한다.
// 순위 표와 하단 고정 내 순위 바는 공용 RankList 규칙(1~3위 골드, 내 줄 하늘색 구분, 오른쪽 수치 골드 강조)을 따른다.
const TABS = RANKING_TABS.map(({ key, label }) => ({ key, label }));

function renderBoardValue(board: MainRankingBoardId, value: number) {
  const view = rankingValueView(board, value);
  return view.kind === 'ratio'
    ? <ProgressCount current={view.current} target={view.total} percent={view.percent} />
    : <ProgressCount value={view.text} />;
}

export default function RankingModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<MainRankingBoardId>('fame');
  return (
    // 탭이 있는 창의 높이 520px. 스테이지가 낮으면 위아래 16px을 남긴다
    <Modal layer="stage" md mobileFixed height={520} onClose={onClose}>
      <ModalCard title="랭킹" onClose={onClose} fixed>
        <div className="flex flex-col gap-3 flex-1 min-h-0">
          <TabBar<MainRankingBoardId>
            activeKey={tab}
            onSelect={setTab}
            tabs={TABS}
            className="mobile:flex-wrap mobile:[&>button]:flex-[1_0_30%]"
          />
          <RankingBoardView board={tab} />
        </div>
      </ModalCard>
    </Modal>
  );
}

/** 한 탭의 본문: 활성 보드 지연 조회 결과와 표 아래 내 순위 자리 */
function RankingBoardView({ board }: { board: MainRankingBoardId }) {
  const mobile = useMobileLayout();
  const { data, loading, failed, offline } = useRankingBoard(board);
  const { valueLabel, help } = rankingTabMeta(board);
  const listed = !!data && data.top.length > 0;
  const mine = data ? pinnedMyRank(data) : null;
  const renderValue = (value: number) => renderBoardValue(board, value);

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
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
            <RankingStatus loading={loading} failed={failed} offline={offline} empty={!!data} />
          </div>
        )}
      </TableBox>
      <RankMeBar me={mine} reserveSpace format={renderValue} />
    </div>
  );
}
