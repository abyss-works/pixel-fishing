import { useState } from 'react';
import { pinnedMyRank } from '../../../../features/ranking/model/ranking';
import { useRankingBoard } from '../../../../features/ranking/service/useRanking';
import { cx } from '../../../ui/cx';
import Frame from '../../../ui/Frame';
import { fmtNum } from '../../../ui/format';
import TableBox from '../../../ui/TableBox';
import DataTable from '../../../ui/DataTable';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import TabBar from '../../../ui/TabBar';
import Tip from '../../../ui/Tip';
import RankingStatus from './RankingStatus';

// 랭킹 창. 게임 스테이지 안에 뜬다(거점 게시판에서 여는 게임 안 창). 680 폭에 높이를 고정하고, 탭은 명성과 도감 둘이다.
// 두 순위는 창을 열 때 함께 불러온다. 순위 표는 탭 본문 안에서 굴리고, 1위부터 3위의 순위 숫자는 골드로 쓴다.
// 내 행은 하늘색이다. 내가 상위 목록 밖이면 내 줄을 표 아래에 고정하고, 목록 안이면 그 자리를 비워 둔다.
// 두 탭에 공통인 상태가 없어 고정 정보 줄은 두지 않는다. 어종별 크기 순위는 도감 상세가 보여 준다.
type Board = 'fame' | 'dex';
const BOARDS: Record<Board, { valueLabel: string; format: (v: number) => string }> = {
  fame: { valueLabel: '명성', format: v => fmtNum(v) },
  dex: { valueLabel: '발견 어종', format: v => `${fmtNum(v)}종` },
};
const DEX_HELP = '일반 폼으로 한 번이라도 낚은 어종 수예요.';
/** 탭이 있는 창의 높이 520px. 스테이지가 낮으면 위아래 16px을 남긴다 */
const FIXED_HEIGHT = 'h-[min(520px,calc(100%-32px))] mobile:h-auto';
const HEAD = 'h-[30px] px-2 font-normal border-b border-line';
const nameOf = (nickname: string | null) => nickname ?? '이름 없음';

export default function RankingModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Board>('fame');
  const boards = { fame: useRankingBoard('fame'), dex: useRankingBoard('dex') };
  return (
    <Modal layer="stage" md onClose={onClose} className={FIXED_HEIGHT}>
      <ModalCard title="랭킹" onClose={onClose} className="flex-1">
        <div className="flex flex-col gap-3 flex-1 min-h-0">
          <TabBar<Board> activeKey={tab} onSelect={setTab} tabs={[{ key: 'fame', label: '명성' }, { key: 'dex', label: '도감' }]} />
          <RankingBoardView board={tab} {...boards[tab]} />
        </div>
      </ModalCard>
    </Modal>
  );
}

/** 한 탭의 본문: 순위 표와 그 아래 내 줄 자리 */
function RankingBoardView({ board, data, loading, failed, offline }: { board: Board } & ReturnType<typeof useRankingBoard>) {
  const { valueLabel, format } = BOARDS[board];
  const listed = !!data && data.top.length > 0;
  const mine = data ? pinnedMyRank(data) : null;
  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <TableBox className="flex-1 min-h-0 px-3 pb-2">
        {listed ? (
          <DataTable cols={['3.5rem', null, '110px']} nameMin="8rem">
            <thead>
              <tr className="sticky top-0 bg-[color-mix(in_oklab,var(--c-bg)_45%,var(--c-surface))] text-2xs text-text-dim">
                <th className={cx(HEAD, 'pl-0 text-left')}>순위</th>
                <th className={cx(HEAD, 'text-left')}>닉네임</th>
                <th className={cx(HEAD, 'pr-0 text-right')}>
                  {board === 'dex' ? <Tip text={DEX_HELP}>{valueLabel}</Tip> : valueLabel}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.top.map((r, i) => {
                const cell = cx('h-[34px]', i > 0 && 'border-t border-line/60');
                return (
                  <tr key={i} className={cx(r.me && 'text-accent')} aria-current={r.me ? 'true' : undefined}>
                    <td className={cx(cell, 'pf-accent text-xs', r.rank <= 3 && !r.me && 'text-gold')}>{r.rank}</td>
                    <td className={cx(cell, 'px-2 truncate', r.me && 'font-bold')}>{nameOf(r.nickname)}</td>
                    <td className={cx(cell, 'pl-2 text-right pf-accent text-xs')}>{format(r.value)}</td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        ) : (
          <div className="flex h-full items-center justify-center">
            <RankingStatus loading={loading} failed={failed} offline={offline} empty={!!data} />
          </div>
        )}
      </TableBox>
      {/* 내 줄 자리: 목록 밖일 때만 채우고, 아니면 같은 높이로 비워 둔다 */}
      {mine ? (
        <Frame className="h-9 shrink-0 grid grid-cols-[3.5rem_minmax(0,1fr)_110px] items-center px-3 bg-surface-2 text-accent text-sm"
               aria-label="내 순위">
          <span className="pf-accent text-xs">{mine.rank}</span>
          <b>나</b>
          <span className="pf-accent text-xs text-right">{format(mine.value)}</span>
        </Frame>
      ) : <div className="h-9 shrink-0" aria-hidden="true" />}
    </div>
  );
}
