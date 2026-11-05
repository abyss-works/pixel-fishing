// 실시간 탭 — "지금 누가 어디에 있는가". 실시간 채널(WebSocket)에 연결된 사람을 서버에서 15초마다 다시 읽는다.
// 지표 줄(접속·가입·게스트·가장 오래 접속) → 접속 목록(넓게)과 위치 분포(오른쪽 고정 칸) → 채팅 신고.
import { useEffect, useMemo, useState } from 'react';
import Badge from '../../../ui/Badge';
import DataTable from '../../../ui/DataTable';
import KpiTile from '../../../ui/KpiTile';
import Note from '../../../ui/Note';
import { fmtDT, fmtNum } from '../../../../features/admin/model/metrics';
import { fmtDuration, selectLiveBoard } from '../../../../features/admin/model/dashboard';
import { useAdminLive } from '../../../../features/admin/service/useAdminStats';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { BarsChart } from '../charts';
import { Cell, CellGrid, KpiRow, TabPage, TabState } from '../layout';
import ChatReportsSection from './ChatReportsSection';

const POLL_MS = 15_000;

export default function LiveTab() {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  const { data, loading, error, refresh } = useAdminLive(POLL_MS);
  const [tick, setTick] = useState(() => Date.now()); // 접속 시간의 기준 시각

  useEffect(() => {
    if (!granted) return;
    // 접속 시간은 조회와 별개로 다시 계산한다 — 재조회가 같은 목록을 돌려줄 수 있다
    const t = setInterval(() => setTick(Date.now()), POLL_MS);
    return () => clearInterval(t);
  }, [granted]);

  const board = useMemo(() => selectLiveBoard(data, tick), [data, tick]);
  const count = (v: number) => (data ? fmtNum(v) : '—');

  return (
    <TabPage title="실시간" context="실시간 채널에 연결된 사람을 15초마다 다시 읽어요. 아래에는 플레이어가 신고한 채팅이 있어요.">
      <KpiRow>
        <KpiTile label="지금 접속" value={count(data?.count ?? NaN)} hint="실시간 채널 연결 수" />
        <KpiTile label="가입 계정" value={count(board.members)} />
        <KpiTile label="게스트" value={count(board.guests)} />
        <KpiTile label="가장 오래 접속" value={fmtDuration(board.rows[0]?.connectedSec)}
                 hint={board.rows[0]?.nick} />
      </KpiRow>

      <TabState loading={loading && granted} error={error} onRetry={refresh} />

      {/* 접속 목록(좌)과 위치 분포(우) — xl 이상 좌우 분할 */}
      <CellGrid side>
        <Cell title={`접속 목록 (${board.rows.length})`} flush>
          <div className="pf-scroll-panel max-h-[420px] overflow-y-auto px-1">
            <DataTable>
              <thead>
                <tr><th className="text-left">닉네임</th><th className="text-left">위치</th>
                    <th className="text-right">접속 시간</th></tr>
              </thead>
              <tbody>
                {board.rows.map(row => (
                  <tr key={row.uid}>
                    <td className="text-xs" title={row.uid}>
                      {row.nick} {row.guest && <Badge>게스트</Badge>}
                    </td>
                    <td className="whitespace-nowrap text-xs">{row.place}</td>
                    <td className="whitespace-nowrap text-right text-xs" title={`${fmtDT(row.connectedAt)}부터`}>
                      {fmtDuration(row.connectedSec)}
                    </td>
                  </tr>
                ))}
                {board.rows.length === 0 &&
                  <tr><td colSpan={3} className="text-text-dim text-center py-3">
                    {granted ? '지금 연결된 사람이 없어요.' : '운영 DB에 연결하면 채워져요.'}
                  </td></tr>}
              </tbody>
            </DataTable>
          </div>
        </Cell>

        <Cell title="위치 분포">
          <BarsChart values={board.places.values} labels={board.places.labels} height={96} highlight="peak"
                     ariaLabel="접속 중인 사람의 위치 분포" />
          <Note size="2xs" className="my-0">
            바다에 있는 사람은 지금 있는 해역으로, 해역을 모르면 지역으로 묶어요.
          </Note>
        </Cell>
      </CellGrid>
      <div className="mt-3">
        <ChatReportsSection />
      </div>
    </TabPage>
  );
}
