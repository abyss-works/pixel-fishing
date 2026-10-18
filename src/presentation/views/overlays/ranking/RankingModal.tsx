import { useRankingBoard } from '../../../../features/ranking/service/useRanking';
import { fmtNum } from '../../../ui/format';
import Modal from '../../../ui/Modal';
import Panel from '../../../ui/Panel';
import RankList from '../../../ui/RankList';
import RankingStatus from './RankingStatus';

// 마을 랭킹 창 — 명성과 도감 완성도의 누적 순위를 한 화면에 나란히 둔다. 두 순위는 창을 열 때 함께 불러온다.
// 칸 높이는 고정이라 불러오는 중과 목록이 바뀌어도 창 크기가 흔들리지 않는다.
// 어종별 크기 순위는 도감 상세가 보여 준다.
type Board = 'fame' | 'dex';
const BOARDS: { key: Board; title: string; valueLabel: string; format: (v: number) => string }[] = [
  { key: 'fame', title: '명성', valueLabel: '명성', format: v => fmtNum(v) },
  { key: 'dex', title: '도감', valueLabel: '발견 어종', format: v => `${fmtNum(v)}종` },
];

function Board({ board }: { board: (typeof BOARDS)[number] }) {
  const { data, loading, failed, offline } = useRankingBoard(board.key);
  const listed = !!data && data.top.length > 0;
  return (
    <Panel title={board.title} className="min-w-0">
      <div className="h-[min(56vh,480px)] overflow-y-auto">
        {listed ? (
          <RankList rows={data.top} me={data.me} valueLabel={board.valueLabel} format={board.format} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <RankingStatus loading={loading} failed={failed} offline={offline} empty={!!data} />
          </div>
        )}
      </div>
    </Panel>
  );
}

export default function RankingModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="랭킹" xl onClose={onClose}>
      <div className="grid grid-cols-2 gap-3 max-[640px]:grid-cols-1">
        {BOARDS.map(b => <Board key={b.key} board={b} />)}
      </div>
    </Modal>
  );
}
