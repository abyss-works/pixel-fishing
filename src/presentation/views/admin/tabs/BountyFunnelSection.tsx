// 바운티 퍼널 — 네임드 수주 → 흔적 → 결투(승·패) → 토벌 보상, 일반 수주·납품의 최근 7일.
// events는 콜드 아카이브가 7일이 지나면 옮기므로 그보다 긴 범위는 비어 보인다.
import { useMemo } from 'react';
import DataTable from '../../../ui/DataTable';
import Note from '../../../ui/Note';
import { fmtNum } from '../../../../features/admin/model/metrics';
import { selectBountyFunnel } from '../../../../features/admin/model/bountyFunnel';
import { readAdminBountyFunnel } from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import type { AdminBountyFunnelRow } from '../../../../features/admin/model/types';
import { ChartSection, KpiCard, KpiGrid, TabState } from '../charts';

const DAYS = 7;
const NO_ROWS: AdminBountyFunnelRow[] = [];
const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);

export default function BountyFunnelSection({ granted }: { granted: boolean }) {
  const { data, loading, error, refresh } =
    useAdminQuery(adminKeys.bountyFunnel(DAYS), () => readAdminBountyFunnel(DAYS), granted);
  const rows = data ?? NO_ROWS;
  const { totals, duelRate, winRate, unresolved } = useMemo(() => selectBountyFunnel(rows), [rows]);

  return (
    <ChartSection title={`바운티 퍼널 (최근 ${DAYS}일)`}>
      <TabState loading={loading && granted} error={error} onRetry={refresh} />
      <KpiGrid>
        <KpiCard label="네임드 수주" value={fmtNum(totals.named_accepts)} />
        <KpiCard label="흔적 발급" value={fmtNum(totals.tickets)} hint={`결투까지 ${pct(duelRate)}`} />
        <KpiCard label="결투 승·패" value={`${fmtNum(totals.duels_won)} · ${fmtNum(totals.duels_lost)}`}
                 hint={`승률 ${pct(winRate)}`} />
        <KpiCard label="결투 없이 남은 흔적" value={fmtNum(unresolved)} hint="진행 중 또는 만료" />
        <KpiCard label="일반 수주 · 납품" value={`${fmtNum(totals.general_accepts)} · ${fmtNum(totals.general_rewards)}`} />
      </KpiGrid>
      {rows.length === 0 ? (
        <Note size="2xs" className="my-1">기간 안에 바운티 이벤트가 없다.</Note>
      ) : (
        <DataTable>
          <thead>
            <tr><th className="text-left">날짜</th><th className="text-right">네임드 수주</th>
                <th className="text-right">흔적</th><th className="text-right">승</th>
                <th className="text-right">패</th><th className="text-right">토벌 보상</th>
                <th className="text-right">일반 수주</th><th className="text-right">일반 납품</th></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.day}>
                <td className="pf-accent text-xs">{r.day}</td>
                <td className="text-right">{fmtNum(Number(r.named_accepts))}</td>
                <td className="text-right">{fmtNum(Number(r.tickets))}</td>
                <td className="text-right text-gold">{fmtNum(Number(r.duels_won))}</td>
                <td className="text-right text-text-dim">{fmtNum(Number(r.duels_lost))}</td>
                <td className="text-right">{fmtNum(Number(r.named_rewards))}</td>
                <td className="text-right">{fmtNum(Number(r.general_accepts))}</td>
                <td className="text-right">{fmtNum(Number(r.general_rewards))}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      <Note size="2xs" className="my-0">이벤트는 7일이 지나면 콜드 아카이브로 옮겨져 이 표에서 빠진다.</Note>
    </ChartSection>
  );
}
