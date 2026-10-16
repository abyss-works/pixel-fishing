// 개요 탭 — "살아 있는가 · 이상한 일이 진행 중인가"를 한 화면으로.
// 레이아웃(사용자 지시 반영): [KPI 격자 5] 아래 본문을 좌우 분할
//   좌 = 최근 이벤트 피드(넓게 스크롤) / 우 = 위험 신호 카드열(제재·연타·반입).
// Note 텍스트에 묻혔던 위험 신호가 우측 고정 카드로 승격됐다.
import DataTable from '../../../ui/DataTable';
import Note from '../../../ui/Note';
import { cx } from '../../../ui/cx';
import { fmtNum, fmtDT, EVENT_LABELS, eventSummary, RISKY_EVENT_TYPES } from '../../../../features/admin/model/metrics';
import { selectOverviewMetrics } from '../../../../features/admin/model/adminViews';
import { readAdminOverview } from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { KpiCard, KpiGrid, ChartSection, TabState } from '../charts';
import Frame from '../../../ui/Frame';

const DAYS = 30;

// 조회 전 골격 — 게이트는 내용을 교체하지 않으므로 빈 값으로도 KPI '—'와 빈 표를 그린다
const EMPTY: Awaited<ReturnType<typeof readAdminOverview>> = [[], [], [], [], [], []];

export default function OverviewTab() {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  const { data, loading, error, refresh } =
    useAdminQuery(adminKeys.overview(DAYS), () => readAdminOverview(DAYS), granted);

  const [users, daily, quality, recent, flags, imports] = data ?? EMPTY;
  // 7일 낚시 KPI는 "조회 전"과 "0건"을 구분한다 — 도착 전에는 '—'
  const loaded = data !== null;
  const dauToday = daily[0]?.dau ?? null;
  const wau7 = daily[0]?.wau7 ?? null;

  const metrics = selectOverviewMetrics(users, flags, imports, quality);

  return (
    <div className="flex flex-col gap-3">
      <KpiGrid>
        <KpiCard label="등록 유저" value={fmtNum(users.length)} />
        <KpiCard label="금일 DAU" value={dauToday === null ? '—' : fmtNum(dauToday)}
                 hint={`최근 7일 WAU ${wau7 === null ? '—' : fmtNum(wau7)}`} />
        <KpiCard label="최근 7일 낚시" value={loaded ? fmtNum(metrics.catch7d) : '—'}
                 hint="catch 이벤트 합계" />
        <KpiCard label="보유 골드 합" value={fmtNum(metrics.goldTotal)} />
        <KpiCard label="명성 합" value={fmtNum(metrics.fameTotal)} />
      </KpiGrid>

      <TabState loading={loading && granted} error={error} onRetry={refresh} />

      {/* 좌: 피드(1fr) / 우: 위험 신호 카드열(고정폭) — xl 미만에서는 세로 적층 */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-3 items-start">
        <ChartSection title="최근 이벤트 피드">
          <div className="max-h-[420px] overflow-y-auto">
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
                    {granted ? '아직 이벤트가 없다.' : '운영 DB 연결 후 채워진다.'}
                  </td></tr>}
              </tbody>
            </DataTable>
          </div>
        </ChartSection>

        <div className="flex flex-col gap-2">
          <RiskCard label="제재 계정" count={metrics.restrictedCount}
                    hint="saves_current.restricted 플래그 — 활동 403 차단 중"
                    tone={metrics.restrictedCount > 0 ? 'danger' : undefined} />
          <RiskCard label="연타 플래그 유저" count={metrics.spamUsers}
                    hint="최근 7일 캐치 간격 <2초 — 물리적으로 불가한 연타"
                    tone={metrics.spamUsers > 0 ? 'warn' : undefined} />
          <RiskCard label="이사 코드 반입" count={imports.length}
                    hint="import 액션 원장 — 운영자 전용 경로의 흔적"
                    tone={imports.length > 0 ? 'warn' : undefined} />
          {metrics.riskTotal > 0 && (
            <Note size="2xs" className="my-0 px-1">
              상세 판독은 <span className="pf-accent text-gold">이상탐지</span> 탭에서.
            </Note>
          )}
        </div>
      </div>
    </div>
  );
}

// 위험 신호 카드 — 숫자 하나 + 근거 한 줄. 클릭 없음(탐색은 탭으로 한다)
function RiskCard({ label, count, hint, tone }: {
  label: string; count: number; hint: string;
  tone?: 'warn' | 'danger';
}) {
  const active = count > 0;
  return (
    <Frame className={cx('px-3 py-2',
                       tone === 'danger' && active && 'border-danger/50',
                       tone === 'warn' && active && 'border-gold/40')}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs">{label}</span>
        <span className={cx('text-lg pf-accent',
                            !active ? 'text-text-dim'
                            : tone === 'danger' ? 'text-danger' : 'text-gold')}>
          {fmtNum(count)}
        </span>
      </div>
      <Note size="2xs" className="my-0">{hint}</Note>
    </Frame>
  );
}


const shortUid = (uid: string): string => uid.slice(0, 8);
