import { useState } from 'react';
import { useRankingBoard } from '../../../../features/ranking/service/useRanking';
import { fmtNum } from '../../../ui/format';
import Modal from '../../../ui/Modal';
import RankList from '../../../ui/RankList';
import TabBar from '../../../ui/TabBar';
import RankingStatus from './RankingStatus';

// 마을 랭킹 창 — 명성과 도감 완성도의 누적 순위. 어종별 크기 순위는 도감 상세가 보여 준다.
type Board = 'fame' | 'dex';
const TABS: { key: Board; label: string }[] = [
  { key: 'fame', label: '명성' },
  { key: 'dex', label: '도감' },
];

function Board({ board }: { board: Board }) {
  const { data, loading, failed, offline } = useRankingBoard(board);
  return (
    <>
      <RankingStatus loading={loading} failed={failed} offline={offline} empty={!!data && data.top.length === 0} />
      {data && data.top.length > 0 && (
        <RankList rows={data.top} me={data.me} valueLabel={board === 'fame' ? '명성' : '발견 어종'}
                  format={v => (board === 'fame' ? fmtNum(v) : `${fmtNum(v)}종`)} />
      )}
    </>
  );
}

export default function RankingModal({ onClose }: { onClose: () => void }) {
  const [board, setBoard] = useState<Board>('fame');
  return (
    <Modal title="랭킹" onClose={onClose}>
      <TabBar tabs={TABS} activeKey={board} onSelect={setBoard} className="mb-2" />
      <div className="max-h-[60vh] overflow-y-auto">
        <Board board={board} />
      </div>
    </Modal>
  );
}
