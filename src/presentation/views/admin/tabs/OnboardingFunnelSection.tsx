// 온보딩 퍼널 — 게스트→구글 계정 전환율·소요 시간, 튜토리얼 4단계 완료·이탈, 초반 온보딩 6단계 도달률.
// 진행 구역(ProgressionTab)의 격자 안에 배치한다.
import { useMemo } from 'react';
import DataTable from '../../../ui/DataTable';
import KeyValueRow from '../../../ui/KeyValueRow';
import KpiTile from '../../../ui/KpiTile';
import Note from '../../../ui/Note';
import TableBox from '../../../ui/TableBox';
import { fmtNum, fmtPct } from '../../../../features/admin/model/metrics';
import { selectOnboardingFunnelView } from '../../../../features/admin/model/onboardingFunnel';
import { useAdminOnboardingFunnel } from '../../../../features/admin/service/useAdminStats';
import { BarsChart } from '../charts';
import { Cell, KpiRow, TabState } from '../layout';

export default function OnboardingFunnelSection({ granted }: { granted: boolean }) {
  const { data, loading, error, refresh } = useAdminOnboardingFunnel();
  const view = useMemo(() => selectOnboardingFunnelView(data), [data]);
  const { conversion, tutorials, steps } = view;
  const count = (v: number | null | undefined) => (v === null || v === undefined ? '—' : fmtNum(v));

  return (
    <>
      <Cell title="게스트 → 구글 계정 전환">
        {((loading && granted) || error) && (
          <TabState loading={loading && granted} error={error} onRetry={refresh} />
        )}
        <KpiRow>
          <KpiTile label="전체 유저" value={count(conversion.totalUsers)} />
          <KpiTile label="게스트" value={count(conversion.guestUsers)} />
          <KpiTile label="구글 연결" value={count(conversion.googleLinkedUsers)} />
          <KpiTile label="전환율" value={conversion.conversionRateText} />
        </KpiRow>
        <div>
          <KeyValueRow compact label="전환 소요 시간 중앙값" value={conversion.medianText} valueEnd />
          <KeyValueRow compact label="전환 소요 시간 p90" value={conversion.p90Text} valueEnd />
        </div>
        {conversion.buckets.length > 0 ? (
          <BarsChart
            values={conversion.buckets.map(b => b.pct)}
            labels={conversion.buckets.map(b => b.label)}
            max={100}
            scaleLabel="100% = 전환 계정"
            height={68}
            highlight="peak"
            valueText={(_, i) => `${fmtNum(conversion.buckets[i].count)}명 (${fmtPct(conversion.buckets[i].pct)})`}
            ariaLabel="게스트에서 구글 전환 소요 시간 분포"
          />
        ) : (
          <Note size="2xs" className="my-0">
            {granted ? '전환 소요 시간 데이터가 없어요.' : '운영 DB에 연결하면 채워져요.'}
          </Note>
        )}
      </Cell>

      <Cell title="튜토리얼 4단계 완료·이탈" flush>
        {((loading && granted) || error) && (
          <div className="px-3 pt-2">
            <TabState loading={loading && granted} error={error} onRetry={refresh} />
          </div>
        )}
        <Note size="2xs" className="my-0 px-3 pt-2">
          {tutorials.totalUsers !== null
            ? `세이브 보유 ${fmtNum(tutorials.totalWithSave ?? 0)}명 / 전체 ${fmtNum(tutorials.totalUsers)}명 기준`
            : granted
              ? '데이터가 없어요.'
              : '운영 DB에 연결하면 채워져요.'}
        </Note>
        {tutorials.stages.length > 0 && (
          <TableBox className="border-0 bg-transparent px-1 pb-1">
            <DataTable>
              <thead>
                <tr>
                  <th className="text-left">단계</th>
                  <th className="text-right">완료</th>
                  <th className="text-right">전체 비율</th>
                  <th className="text-right">유지율</th>
                  <th className="text-right">이탈</th>
                </tr>
              </thead>
              <tbody>
                {tutorials.stages.map(s => (
                  <tr key={s.id}>
                    <td className="text-xs">{s.label}</td>
                    <td className="text-right pf-accent text-gold">{fmtNum(s.completed)}</td>
                    <td className="text-right">{s.rateText}</td>
                    <td className="text-right text-text-dim">{s.stepRateText}</td>
                    <td className="text-right text-text-dim">
                      {s.dropOffFromPrev > 0 ? `−${fmtNum(s.dropOffFromPrev)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </TableBox>
        )}
      </Cell>

      <Cell title="초반 온보딩 6단계 퍼널" className="xl:col-span-2" flush>
        {((loading && granted) || error) && (
          <div className="px-3 pt-2">
            <TabState loading={loading && granted} error={error} onRetry={refresh} />
          </div>
        )}
        {steps.length > 0 ? (
          <>
            <div className="px-3 pt-3">
              <BarsChart
                values={steps.map(s => s.ratePct)}
                labels={steps.map(s => s.label)}
                max={100}
                scaleLabel="100% = 전체 유저"
                height={76}
                valueText={(_, i) => `${fmtNum(steps[i].users)}명 (${steps[i].rateText})`}
                ariaLabel="초반 온보딩 6단계 도달률"
              />
            </div>
            <TableBox className="border-0 bg-transparent px-1 pb-1">
              <DataTable>
                <thead>
                  <tr>
                    <th className="text-left">단계</th>
                    <th className="text-right">도달 유저</th>
                    <th className="text-right">전체 대비</th>
                    <th className="text-right">단계 전환율</th>
                    <th className="text-right">산출 근거</th>
                  </tr>
                </thead>
                <tbody>
                  {steps.map(s => (
                    <tr key={s.id}>
                      <td className="text-xs">{s.label}</td>
                      <td className="text-right pf-accent text-gold">{fmtNum(s.users)}</td>
                      <td className="text-right">{s.rateText}</td>
                      <td className="text-right text-text-dim">{s.stepRateText}</td>
                      <td className="text-right text-2xs text-text-dim">
                        {s.basis === 'hybrid_7d' ? `${s.basisLabel} (hybrid_7d)` : s.basisLabel}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </TableBox>
          </>
        ) : (
          <Note size="2xs" className="my-0 px-3 pt-2">
            {granted ? '퍼널 데이터가 없어요.' : '운영 DB에 연결하면 채워져요.'}
          </Note>
        )}
        <Note size="2xs" className="my-0 px-3 pb-2">
          {view.hasHybridSteps
            ? `첫 판매(first_sell)처럼 hybrid_7d 기준 단계는 누적 카운터 도입 전 활동이 최근 ${view.eventsWindowDays}일 이벤트 창 한도의 영향을 받을 수 있어요.`
            : `이벤트 보조 신호는 최근 ${view.eventsWindowDays}일 창 기준으로 함께 집계해요.`}
        </Note>
      </Cell>
    </>
  );
}
