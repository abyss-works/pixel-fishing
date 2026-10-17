import { useState } from 'react';
import { selectBiggestRows } from '../../../../features/ranking/model/ranking';
import { useRankingBiggest, useRankingBoard } from '../../../../features/ranking/service/useRanking';
import { cx } from '../../../ui/cx';
import DataTable from '../../../ui/DataTable';
import { RarityDot } from '../../../ui/fish/RarityTag';
import { fmtNum } from '../../../ui/format';
import Modal from '../../../ui/Modal';
import Note from '../../../ui/Note';
import TabBar from '../../../ui/TabBar';

// 랭킹 창 — 명성·도감 완성도·어종별 월척의 누적 순위. 내 행을 강조하고,
// 상위 목록 밖이면 목록 아래에 내 순위를 따로 보여 준다.
type Board = 'fame' | 'dex' | 'biggest';
const TABS: { key: Board; label: string }[] = [
  { key: 'fame', label: '명성' },
  { key: 'dex', label: '도감' },
  { key: 'biggest', label: '월척' },
];

const ME_ROW = 'text-accent';
const nameOf = (nickname: string | null) => nickname ?? '이름 없음';

function Status({ loading, failed, offline, empty }: { loading: boolean; failed: boolean; offline: boolean; empty: boolean }) {
  if (offline) return <Note>랭킹은 온라인에서만 볼 수 있어요.</Note>;
  if (loading) return <Note>불러오는 중…</Note>;
  if (failed) return <Note tone="warn">랭킹을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</Note>;
  if (empty) return <Note>아직 기록이 없어요.</Note>;
  return null;
}

function BoardTable({ board }: { board: 'fame' | 'dex' }) {
  const { data, loading, failed, offline } = useRankingBoard(board);
  const unit = board === 'fame' ? '명성' : '종';
  const show = (v: number) => (board === 'fame' ? fmtNum(v) : `${fmtNum(v)}종`);
  const meInTop = data?.top.some(r => r.me) ?? false;
  return (
    <>
      <Status loading={loading} failed={failed} offline={offline} empty={!!data && data.top.length === 0} />
      {data && data.top.length > 0 && (
        <DataTable>
          <thead><tr><th>순위</th><th>닉네임</th><th>{unit}</th></tr></thead>
          <tbody>
            {data.top.map((r, i) => (
              <tr key={i} className={cx(r.me && ME_ROW)} aria-current={r.me ? 'true' : undefined}>
                <td>{r.rank}</td><td>{nameOf(r.nickname)}</td><td>{show(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      {data?.me && !meInTop && (
        <p className={cx('mt-2 text-sm', ME_ROW)}>내 순위 {data.me.rank}위 · {show(data.me.value)}</p>
      )}
    </>
  );
}

function BiggestTable() {
  const { species, loading, failed, offline } = useRankingBiggest();
  const rows = species ? selectBiggestRows(species) : [];
  return (
    <>
      <Status loading={loading} failed={failed} offline={offline} empty={!!species && rows.length === 0} />
      {rows.length > 0 && (
        <DataTable>
          <thead><tr><th>어종</th><th>크기</th><th>주인</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.fishId} className={cx(r.me && ME_ROW)} aria-current={r.me ? 'true' : undefined}>
                <td><RarityDot rarity={r.rarity} /> {r.name}</td>
                <td>{r.size.toFixed(1)}cm</td>
                <td>{nameOf(r.nickname)}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
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
        {board === 'biggest' ? <BiggestTable /> : <BoardTable board={board} />}
      </div>
    </Modal>
  );
}
