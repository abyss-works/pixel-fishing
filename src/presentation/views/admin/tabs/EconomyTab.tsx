// 경제 탭 — 골드 유입(sell·coupon)과 유출(upgradeRod·buyBoat·buyBait)의 일 원장 + 잔고 분포.
// 레이아웃: [잔고 백분위 KPI 4] → 좌우 분할(유입 | 유출, xl) → 원장 대차 카드(풀폭).
// 유입합 − 유출합이 실제 보유 골드 합보다 크게 어긋나면 import 반입 경로를 의심한다
// v_economy_daily 뷰의 일별 경제 요약을 표시한다.
import { useMemo, useState } from 'react';
import MetricSwitch from '../widgets/MetricSwitch';
import { fmtNum, lastNDays, fillSeries, percentile } from '../../../../features/admin/model/metrics';
import { selectEconomyMetrics } from '../../../../features/admin/model/adminViews';
import { readAdminEconomy } from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import type { AdminEconomyRow } from '../../../../features/admin/model/types';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { BarsChart, Frame, KpiGrid, KpiCard, TabState } from '../charts';

type Range = '30' | '90';

// 조회 전 골격 — 게이트는 내용을 교체하지 않으므로 빈 값으로도 축과 표를 그린다
const EMPTY: Awaited<ReturnType<typeof readAdminEconomy>> = [[], []];

export default function EconomyTab() {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  const [range, setRange] = useState<Range>('30');
  // 범위는 캐시 키에 들어간다 — 전환하면 그 범위를 새로 조회한다
  const { data, loading, error, refresh } =
    useAdminQuery(adminKeys.economy(Number(range)), () => readAdminEconomy(Number(range)), granted);

  const [economyRows, users] = data ?? EMPTY;
  // 뷰는 최신순(desc)으로 온다 — 차트는 과거→오름차순 축이 읽기 쉽다
  const economy = useMemo(() => [...economyRows].reverse(), [economyRows]);

  const days = lastNDays(Number(range));
  const series = (f: (r: AdminEconomyRow) => number) =>
    fillSeries(economy, days, r => r.day, f);
  const { goldStats, goldSum, inflowTotal, outflowTotal } = useMemo(
    () => selectEconomyMetrics(users, economy), [users, economy],
  );

  return (
    <div className="flex flex-col gap-3">
      <Frame title="골드 잔고 분포">
        <KpiGrid>
          <KpiCard label="잔고 합" value={fmtNum(goldSum)}
                   hint="saves_current 골드 총합" />
          <KpiCard label="중앙값" value={fmtNum(percentile(goldStats, 50))} />
          <KpiCard label="상위 25% 이상" value={fmtNum(percentile(goldStats, 75))} />
          <KpiCard label="최대" value={fmtNum(goldStats[goldStats.length - 1] ?? NaN)} />
        </KpiGrid>
      </Frame>

      {/* 유입·유출은 같은 날 축이라 짝지어 본다(xl 이상에서 좌우) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
        <Frame title="유입 — 판매·쿠폰" aside={
          <MetricSwitch value={range}
                        options={[{ key: '30', label: '30일' }, { key: '90', label: '90일' }]}
                        onChange={setRange} ariaLabel="기간 선택" />
        }>
          <BarsChart values={series(r => r.sell_gold + r.coupon_gold)} height={72} />
          <p className="text-2xs text-text-dim">판매 골드에 쿠폰 지급이 더해진 일별 흐름.</p>
        </Frame>

        <Frame title="유출 — 강화·배·미끼">
          <BarsChart values={series(r => r.rod_cost + r.boat_cost + r.bait_cost)}
                     height={72} barClass="bg-danger/70" />
          <p className="text-2xs text-text-dim">강화·배 구매·미끼 지출의 일별 합계.</p>
        </Frame>
      </div>

      <Frame title="원장 대차대조">
        <TabState loading={loading && granted} error={error} onRetry={refresh} />
        <p className="text-xs text-text-dim leading-relaxed">
          기간 내 유입합 {fmtNum(inflowTotal)}G · 유출합 {fmtNum(outflowTotal)}G ·
          순유입 <span className="pf-accent text-gold">{fmtNum(inflowTotal - outflowTotal)}G</span>.
          전체 잔고 합({fmtNum(goldSum)}G)이 순유입보다 크게 많으면 그 차액은
          <span className="pf-accent text-gold">이벤트 밖 경로(import 반입)</span>가 들여온 돈이다 —
          이상탐지 탭의 반입 로그와 대조.
        </p>
      </Frame>
    </div>
  );

}
