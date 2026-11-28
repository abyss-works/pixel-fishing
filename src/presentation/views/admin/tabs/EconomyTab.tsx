// 경제 구역 — 요약 보기에서는 핵심 4 KPI(일일 골드 발행/소각, 순유입, 정체 핵심 구간)만, 상세 보기에서는 차트와 원장까지 표시한다.
import { useMemo } from 'react';
import KeyValueRow from '../../../ui/KeyValueRow';
import Note from '../../../ui/Note';
import { fmtGold } from '../../../ui/format';
import { fmtNum, lastNDays, fillSeries } from '../../../../features/admin/model/metrics';
import { selectEconomyMetrics, selectProgressionDashboard, splitDormantGuests } from '../../../../features/admin/model/adminViews';
import { readAdminEconomy } from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import { useAdminAggregateUsers } from '../../../../features/admin/service/useAdminStats';
import type { AdminEconomyRow } from '../../../../features/admin/model/types';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { BarsChart } from '../charts';
import { AdminCard, AdminKpiCard, AdminKpiGrid, AdminSplit, TabState } from '../layout';
import { useAdminViewMode } from '../viewMode';
import type { AdminViewMode } from '../viewMode';

const EVENT_RETENTION_DAYS = 7;
const NO_ECONOMY: AdminEconomyRow[] = [];

export default function EconomyTab({ mode }: { mode?: AdminViewMode } = {}) {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  const { viewMode: ctxMode } = useAdminViewMode();
  const effectiveMode = mode ?? ctxMode;

  // 유저 명부와 사전 집계는 공유 훅으로 조회해 탭 전환 시 중복 풀스캔을 없앤다
  const economyQuery = useAdminQuery(
    adminKeys.economy(EVENT_RETENTION_DAYS),
    () => readAdminEconomy(EVENT_RETENTION_DAYS),
    granted,
  );
  const { users, userAggregates, loading: usersLoading, error: usersError, refresh: refreshUsers } =
    useAdminAggregateUsers();

  const economyRows = economyQuery.data ?? NO_ECONOMY;
  const loading = economyQuery.loading || usersLoading;
  const error = economyQuery.error ?? usersError;
  const refresh = () => {
    economyQuery.refresh();
    refreshUsers();
  };

  // 조회 결과는 최신순(desc)으로 온다 — 차트는 과거→오름차순 축이 읽기 쉽다
  const economy = useMemo(() => [...economyRows].reverse(), [economyRows]);

  const days = lastNDays(EVENT_RETENTION_DAYS);
  const dayLabels = days.map(d => d.slice(5));
  const series = (f: (r: AdminEconomyRow) => number) =>
    fillSeries(economy, days, r => r.day, f);
  const { goldCount, goldSum, goldMedian, inflowTotal, outflowTotal } = useMemo(
    () => selectEconomyMetrics(users, economy, userAggregates), [users, economy, userAggregates],
  );
  const split = useMemo(() => splitDormantGuests(users), [users]);
  const { stalledSummary } = useMemo(
    () => selectProgressionDashboard(split.active, userAggregates),
    [split.active, userAggregates],
  );

  const latestRow = economy.length > 0 ? economy[economy.length - 1] : null;
  const latestInflow = latestRow
    ? latestRow.sell_gold + latestRow.coupon_gold + latestRow.mail_gold + latestRow.bounty_gold + latestRow.achievement_gold
    : null;
  const latestOutflow = latestRow
    ? latestRow.rod_cost + latestRow.boat_cost + latestRow.hat_cost
    : null;
  const netInflow = inflowTotal - outflowTotal;
  const topStalled = useMemo(
    () => stalledSummary.byNextTier.reduce<(typeof stalledSummary.byNextTier)[number] | null>(
      (best, row) => (!best || row.count > best.count ? row : best),
      null,
    ),
    [stalledSummary.byNextTier],
  );

  return (
    <>
      <TabState loading={loading && granted} error={error} onRetry={refresh} />

      <AdminKpiGrid cols={4}>
        <AdminKpiCard
          label="일일 골드 발행"
          value={latestInflow !== null ? fmtGold(latestInflow) : '--'}
          sub={`7일 합계 ${fmtGold(inflowTotal)}`}
          tone="gold"
        />
        <AdminKpiCard
          label="일일 골드 소각"
          value={latestOutflow !== null ? fmtGold(latestOutflow) : '--'}
          sub={`7일 합계 ${fmtGold(outflowTotal)}`}
          tone="accent"
        />
        <AdminKpiCard
          label="순유입"
          value={fmtGold(netInflow)}
          sub={`전체 잔고 ${fmtGold(goldSum)} (${fmtNum(goldCount)}명)`}
          tone={netInflow >= 0 ? 'ok' : 'warn'}
        />
        <AdminKpiCard
          label="이탈·정체 핵심 구간"
          value={topStalled ? `${topStalled.name}(T${topStalled.nextTier})` : (granted ? '정체 없음' : '--')}
          sub={topStalled
            ? `${fmtNum(topStalled.count)}명 정체 (전체 ${fmtNum(stalledSummary.total)}명)`
            : `잔고 중앙값 ${fmtGold(goldMedian)}`}
          tone={topStalled ? 'warn' : 'dim'}
        />
      </AdminKpiGrid>

      {effectiveMode === 'detail' && (
        <>
          <AdminSplit variant="2">
            <AdminCard title="유입 (판매, 쿠폰, 우편, 현상금, 업적 / 최근 7일)">
              <BarsChart
                values={series(r => r.sell_gold + r.coupon_gold + r.mail_gold + r.bounty_gold + r.achievement_gold)}
                labels={dayLabels}
                height={72}
                highlight="last"
                highlightName="금일"
                ariaLabel="골드 유입 일별 추이"
              />
              <Note size="2xs" className="my-0 mt-2">
                판매 골드에 쿠폰, 우편, 현상금, 업적 지급이 더해진 최근 7일(이벤트 보관 한도) 흐름이에요.
              </Note>
            </AdminCard>

            <AdminCard title="유출 (강화, 배, 모자 / 최근 7일)">
              <BarsChart
                values={series(r => r.rod_cost + r.boat_cost + r.hat_cost)}
                labels={dayLabels}
                height={72}
                highlight="last"
                highlightName="금일"
                ariaLabel="골드 유출 일별 추이"
              />
              <Note size="2xs" className="my-0 mt-2">
                강화, 배 구매, 모자 구매 지출의 최근 7일(이벤트 보관 한도) 합계예요.
              </Note>
            </AdminCard>
          </AdminSplit>

          <AdminCard title="원장 대차대조 (최근 7일, 이벤트 보관 한도)">
            <div className="flex flex-col divide-y divide-line">
              <KeyValueRow label="7일 내 유입합" value={`${fmtNum(inflowTotal)}G`} />
              <KeyValueRow label="7일 내 유출합" value={`${fmtNum(outflowTotal)}G`} />
              <KeyValueRow
                label="순유입"
                value={<span className="pf-accent text-gold">{fmtNum(inflowTotal - outflowTotal)}G</span>}
              />
              <KeyValueRow label="전체 잔고 합" value={`${fmtNum(goldSum)}G`} />
            </div>
            <Note size="xs" className="my-0 pt-2 leading-relaxed">
              이 원장은 최근 7일(이벤트 보관 한도)에 남은 이벤트만 집계해요. 30일과 90일 장기 골드 유입, 유출 추이는 활동 구역의 일별 집계(daily_stats)를 확인하세요.
              전체 잔고 합이 순유입보다 크게 많으면 그 차액은 <span className="pf-accent text-gold">이벤트 밖 경로(이사 코드 반입 등)</span>나 7일 이전 기록에서 온 골드예요.
            </Note>
          </AdminCard>
        </>
      )}
    </>
  );
}
