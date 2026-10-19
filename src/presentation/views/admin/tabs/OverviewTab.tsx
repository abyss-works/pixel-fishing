// 개요 탭 — "살아 있는가 · 이상한 일이 진행 중인가"를 한 화면으로.
// 레이아웃: 지표 줄(5장) 아래에 칸 둘을 좌우로 놓는다.
//   왼쪽 = 최근 이벤트 피드(넓게 스크롤) / 오른쪽 = 위험 신호(제재·연타·반입) 목록.
// 위험 신호는 본문 안내문에 묻히지 않도록 오른쪽 고정 칸의 건수로 세운다.
import DataTable from '../../../ui/DataTable';
import KpiTile from '../../../ui/KpiTile';
import Note from '../../../ui/Note';
import { cx } from '../../../ui/cx';
import { fmtNum, fmtDT, EVENT_LABELS, eventSummary, RISKY_EVENT_TYPES } from '../../../../features/admin/model/metrics';
import { selectOverviewMetrics } from '../../../../features/admin/model/adminViews';
import { readAdminOverview } from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { Cell, CellGrid, KpiRow, TabPage, TabState } from '../layout';

const DAYS = 30;

// 조회 전 골격 — 게이트는 내용을 교체하지 않으므로 빈 값으로도 지표 '—'와 빈 표를 그린다
const EMPTY: Awaited<ReturnType<typeof readAdminOverview>> = [[], [], [], [], [], []];

export default function OverviewTab() {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  const { data, loading, error, refresh } =
    useAdminQuery(adminKeys.overview(DAYS), () => readAdminOverview(DAYS), granted);

  const [users, daily, quality, recent, flags, imports] = data ?? EMPTY;
  // 7일 낚시 지표는 "조회 전"과 "0건"을 구분한다 — 도착 전에는 '—'
  const loaded = data !== null;
  const dauToday = daily[0]?.dau ?? null;
  const wau7 = daily[0]?.wau7 ?? null;

  const metrics = selectOverviewMetrics(users, flags, imports, quality);

  return (
    <TabPage title="개요" context="등록 유저와 접속·낚시 지표를 한눈에 보고, 위험 신호를 확인해요.">
      <KpiRow>
        <KpiTile label="등록 유저" value={fmtNum(users.length)} />
        <KpiTile label="금일 DAU" value={dauToday === null ? '—' : fmtNum(dauToday)}
                 hint={`최근 7일 WAU ${wau7 === null ? '—' : fmtNum(wau7)}`} />
        <KpiTile label="최근 7일 낚시" value={loaded ? fmtNum(metrics.catch7d) : '—'}
                 hint="낚시 이벤트 합계" />
        <KpiTile label="보유 골드 합" value={fmtNum(metrics.goldTotal)} />
        <KpiTile label="명성 합" value={fmtNum(metrics.fameTotal)} />
      </KpiRow>

      <TabState loading={loading && granted} error={error} onRetry={refresh} />

      {/* 왼쪽 피드(1fr) / 오른쪽 위험 신호(고정폭) — xl 미만에서는 세로로 쌓는다 */}
      <CellGrid side>
        <Cell title="최근 이벤트 피드" flush>
          <div className="pf-scroll-panel max-h-[420px] overflow-y-auto px-1">
            <DataTable>
              <thead>
                <tr><th className="text-left">시각</th><th className="text-left">유형</th>
                    <th className="text-left">유저</th><th className="text-left">내용</th></tr>
              </thead>
              <tbody>
                {recent.map(e => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap text-text-dim">{fmtDT(e.created_at)}</td>
                    <td className="whitespace-nowrap">
                      <span className={cx('pf-accent', RISKY_EVENT_TYPES.has(e.type) ? 'text-danger' : 'text-gold')}>
                        {EVENT_LABELS[e.type] ?? e.type}
                      </span>
                    </td>
                    <td className="pf-accent text-2xs text-text-dim max-w-[120px] truncate"
                        title={e.user_id}>{shortUid(e.user_id)}</td>
                    <td className="max-w-[260px] truncate text-xs">{eventSummary(e.type, e.payload)}</td>
                  </tr>
                ))}
                {recent.length === 0 &&
                  <tr><td colSpan={4} className="text-text-dim text-center py-3">
                    {granted ? '아직 이벤트가 없어요.' : '운영 DB에 연결하면 채워져요.'}
                  </td></tr>}
              </tbody>
            </DataTable>
          </div>
        </Cell>

        <Cell title="위험 신호" flush divided>
          <RiskRow label="제재 계정" count={metrics.restrictedCount}
                   hint="제재 플래그가 켜져서 활동이 막힌 계정이에요."
                   tone="danger" />
          <RiskRow label="연타 플래그 유저" count={metrics.spamUsers}
                   hint="최근 7일 동안 낚시 간격이 2초보다 짧았던 유저예요. 사람이 낼 수 없는 간격이에요."
                   tone="warn" />
          <RiskRow label="이사 코드 반입" count={imports.length}
                   hint="운영자 전용 경로로 반입한 기록이에요."
                   tone="warn" />
          {metrics.riskTotal > 0 && (
            <Note size="2xs" className="my-0 px-3 py-2">
              자세한 내용은 플레이어 탭의 <span className="pf-accent text-gold">이상탐지</span>에서 볼 수 있어요.
            </Note>
          )}
        </Cell>
      </CellGrid>
    </TabPage>
  );
}

// 위험 신호 한 줄 — 건수 하나와 그 근거 한 줄. 누르는 동작은 없다(자세한 내용은 플레이어 탭에서 본다)
function RiskRow({ label, count, hint, tone }: {
  label: string; count: number; hint: string;
  tone: 'warn' | 'danger';
}) {
  const active = count > 0;
  return (
    <div className="px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm">{label}</span>
        <span className={cx('text-lg pf-accent',
                            !active ? 'text-text-dim'
                            : tone === 'danger' ? 'text-danger' : 'text-gold')}>
          {fmtNum(count)}
        </span>
      </div>
      <Note size="2xs" className="my-0">{hint}</Note>
    </div>
  );
}

const shortUid = (uid: string): string => uid.slice(0, 8);
