// 경제 구역 — 골드 유입(sell, coupon, claimMail, deliverBounty, claimAchievement, claimAllAchievements)과
// 유출(upgradeRod, buyBoat, buyHat)의 최근 7일(이벤트 보관 한도) 원장 + 잔고 분포.
// 30일과 90일 장기 추이는 daily_stats 기반의 활동 구역에서 본다.
import { useMemo } from 'react';
import KeyValueRow from '../../../ui/KeyValueRow';
import KpiTile from '../../../ui/KpiTile';
import Note from '../../../ui/Note';
import { fmtNum, lastNDays, fillSeries } from '../../../../features/admin/model/metrics';
import { selectEconomyMetrics } from '../../../../features/admin/model/adminViews';
import { readAdminEconomy } from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import { useAdminAggregateUsers } from '../../../../features/admin/service/useAdminStats';
import type { AdminEconomyRow } from '../../../../features/admin/model/types';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { BarsChart } from '../charts';
import { Cell, CellGrid, KpiRow, TabState } from '../layout';

const EVENT_RETENTION_DAYS = 7;
const NO_ECONOMY: AdminEconomyRow[] = [];

export default function EconomyTab() {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
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
  const { goldCount, goldSum, goldMedian, goldP75, goldMax, inflowTotal, outflowTotal } = useMemo(
    () => selectEconomyMetrics(users, economy, userAggregates), [users, economy, userAggregates],
  );

  return (
    <>
      <TabState loading={loading && granted} error={error} onRetry={refresh} />

      <KpiRow>
        <KpiTile label="잔고 합" value={fmtNum(goldSum)}
                 hint={goldCount > 0 ? `저장된 골드 총합, 대상 ${fmtNum(goldCount)}명` : '저장된 골드 총합'} />
        <KpiTile label="중앙값" value={fmtNum(goldMedian)} />
        <KpiTile label="상위 25% 이상" value={fmtNum(goldP75)} />
        <KpiTile label="최대" value={fmtNum(goldMax)} />
      </KpiRow>

      <CellGrid>
        <Cell title="유입 (판매, 쿠폰, 우편, 현상금, 업적 / 최근 7일)">
          <BarsChart values={series(r => r.sell_gold + r.coupon_gold + r.mail_gold + r.bounty_gold + r.achievement_gold)}
                     labels={dayLabels} height={72} highlight="last" highlightName="금일" ariaLabel="골드 유입 일별 추이" />
          <Note size="2xs" className="my-0">판매 골드에 쿠폰, 우편, 현상금, 업적 지급이 더해진 최근 7일(이벤트 보관 한도) 흐름이에요.</Note>
        </Cell>

        <Cell title="유출 (강화, 배, 모자 / 최근 7일)">
          <BarsChart values={series(r => r.rod_cost + r.boat_cost + r.hat_cost)} labels={dayLabels}
                     height={72} highlight="last" highlightName="금일" ariaLabel="골드 유출 일별 추이" />
          <Note size="2xs" className="my-0">강화, 배 구매, 모자 구매 지출의 최근 7일(이벤트 보관 한도) 합계예요.</Note>
        </Cell>
      </CellGrid>

      <Cell title="원장 대차대조 (최근 7일, 이벤트 보관 한도)" flush divided>
        <KeyValueRow label="7일 내 유입합" value={`${fmtNum(inflowTotal)}G`} />
        <KeyValueRow label="7일 내 유출합" value={`${fmtNum(outflowTotal)}G`} />
        <KeyValueRow label="순유입"
                     value={<span className="pf-accent text-gold">{fmtNum(inflowTotal - outflowTotal)}G</span>} />
        <KeyValueRow label="전체 잔고 합" value={`${fmtNum(goldSum)}G`} />
        <Note size="xs" className="my-0 px-3 py-2 leading-relaxed">
          이 원장은 최근 7일(이벤트 보관 한도)에 남은 이벤트만 집계해요. 30일과 90일 장기 골드 유입, 유출 추이는 활동 구역의 일별 집계(daily_stats)를 확인하세요.
          전체 잔고 합이 순유입보다 크게 많으면 그 차액은 <span className="pf-accent text-gold">이벤트 밖 경로(이사 코드 반입 등)</span>나 7일 이전 기록에서 온 골드예요.
        </Note>
      </Cell>
    </>
  );
}
