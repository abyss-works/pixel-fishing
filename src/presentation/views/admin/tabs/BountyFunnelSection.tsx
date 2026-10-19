// 바운티 퍼널 — 네임드 수주 → 흔적 → 결투(승·패) → 토벌 보상, 일반 수주·납품의 최근 7일.
// events는 콜드 아카이브가 7일이 지나면 옮기므로 그보다 긴 범위는 비어 보인다.
// 격자 안에서 두 칸 폭을 쓰는 칸이다(진행 구역의 마지막 칸).
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import DataTable from '../../../ui/DataTable';
import KeyValueRow from '../../../ui/KeyValueRow';
import Note from '../../../ui/Note';
import { fmtNum } from '../../../../features/admin/model/metrics';
import { selectBountyFunnel } from '../../../../features/admin/model/bountyFunnel';
import { readAdminBountyFunnel } from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import type { AdminBountyFunnelRow } from '../../../../features/admin/model/types';
import { Cell, TabState } from '../layout';

const DAYS = 7;
const NO_ROWS: AdminBountyFunnelRow[] = [];
const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);

/** 합계 한 줄의 값 — 숫자는 골드 액센트, 보조 설명은 낮춘 글씨 */
const total = (value: string, hint?: string): ReactNode => (
  <>
    <span className="pf-accent text-gold">{value}</span>
    {hint && <span className="ml-1.5 text-xs text-text-dim">{hint}</span>}
  </>
);

export default function BountyFunnelSection({ granted }: { granted: boolean }) {
  const { data, loading, error, refresh } =
    useAdminQuery(adminKeys.bountyFunnel(DAYS), () => readAdminBountyFunnel(DAYS), granted);
  const rows = data ?? NO_ROWS;
  const { totals, duelRate, winRate, unresolved } = useMemo(() => selectBountyFunnel(rows), [rows]);

  return (
    <Cell title={`바운티 퍼널 (최근 ${DAYS}일)`} className="xl:col-span-2" flush divided>
      {((loading && granted) || error) && (
        <div className="px-3 py-2">
          <TabState loading={loading && granted} error={error} onRetry={refresh} />
        </div>
      )}
      <KeyValueRow label="네임드 수주" value={total(fmtNum(totals.named_accepts))} />
      <KeyValueRow label="흔적 발급" value={total(fmtNum(totals.tickets), `결투까지 ${pct(duelRate)}`)} />
      <KeyValueRow label="결투 승·패"
                   value={total(`${fmtNum(totals.duels_won)} · ${fmtNum(totals.duels_lost)}`, `승률 ${pct(winRate)}`)} />
      <KeyValueRow label="결투 없이 남은 흔적" value={total(fmtNum(unresolved), '진행 중이거나 만료됐어요')} />
      <KeyValueRow label="일반 수주 · 납품"
                   value={total(`${fmtNum(totals.general_accepts)} · ${fmtNum(totals.general_rewards)}`)} />
      {rows.length === 0 ? (
        <Note size="2xs" className="my-0 px-3 py-2">기간 안에 바운티 이벤트가 없어요.</Note>
      ) : (
        <div className="overflow-x-auto px-1 py-1">
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
        </div>
      )}
      <Note size="2xs" className="my-0 px-3 py-2">
        이벤트는 7일이 지나면 콜드 아카이브로 옮겨져서 이 표에서 빠져요.
      </Note>
    </Cell>
  );
}
