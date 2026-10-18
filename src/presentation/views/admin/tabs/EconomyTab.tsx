// 경제 구역 — 골드 유입(sell·coupon)과 유출(upgradeRod·buyBoat·buyBait)의 일 원장 + 잔고 분포.
// 레이아웃: [잔고 백분위 지표 4] → 좌우 분할(유입 | 유출, xl) → 원장 대차대조(풀폭).
// 유입합 − 유출합이 실제 보유 골드 합보다 크게 어긋나면 import 반입 경로를 의심한다
import { useMemo } from 'react';
import KeyValueRow from '../../../ui/KeyValueRow';
import KpiTile from '../../../ui/KpiTile';
import Note from '../../../ui/Note';
import { fmtNum, lastNDays, fillSeries, percentile } from '../../../../features/admin/model/metrics';
import { selectEconomyMetrics } from '../../../../features/admin/model/adminViews';
import { readAdminEconomy } from '../../../../features/admin/service/queries';
import { adminKeys } from '../../../../features/admin/service/queryKeys';
import { useAdminQuery } from '../../../../features/admin/service/useAdminQuery';
import type { AdminEconomyRow } from '../../../../features/admin/model/types';
import { useAdminAuth } from '../../../../features/admin/service/accessContext';
import { BarsChart } from '../charts';
import { Cell, CellGrid, KpiRow, TabState } from '../layout';
import type { DayRange } from './dayRange';

// 조회 전 골격 — 게이트는 내용을 교체하지 않으므로 빈 값으로도 축과 표를 그린다
const EMPTY: Awaited<ReturnType<typeof readAdminEconomy>> = [[], []];

export default function EconomyTab({ range }: { range: DayRange }) {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  // 범위는 캐시 키에 들어간다 — 전환하면 그 범위를 새로 조회한다
  const { data, loading, error, refresh } =
    useAdminQuery(adminKeys.economy(Number(range)), () => readAdminEconomy(Number(range)), granted);

  const [economyRows, users] = data ?? EMPTY;
  // 조회 결과는 최신순(desc)으로 온다 — 차트는 과거→오름차순 축이 읽기 쉽다
  const economy = useMemo(() => [...economyRows].reverse(), [economyRows]);

  const days = lastNDays(Number(range));
  const dayLabels = days.map(d => d.slice(5));
  const series = (f: (r: AdminEconomyRow) => number) =>
    fillSeries(economy, days, r => r.day, f);
  const { goldStats, goldSum, inflowTotal, outflowTotal } = useMemo(
    () => selectEconomyMetrics(users, economy), [users, economy],
  );

  return (
    <>
      <TabState loading={loading && granted} error={error} onRetry={refresh} />

      <KpiRow>
        <KpiTile label="잔고 합" value={fmtNum(goldSum)} hint="저장된 골드 총합" />
        <KpiTile label="중앙값" value={fmtNum(percentile(goldStats, 50))} />
        <KpiTile label="상위 25% 이상" value={fmtNum(percentile(goldStats, 75))} />
        <KpiTile label="최대" value={fmtNum(goldStats[goldStats.length - 1] ?? NaN)} />
      </KpiRow>

      {/* 유입·유출은 같은 날 축이라 짝지어 본다(xl 이상에서 좌우) */}
      <CellGrid>
        <Cell title="유입 — 판매·쿠폰">
          <BarsChart values={series(r => r.sell_gold + r.coupon_gold)} labels={dayLabels} height={72}
                     highlight="last" highlightName="금일" ariaLabel="골드 유입 일별 추이" />
          <Note size="2xs" className="my-0">판매 골드에 쿠폰 지급이 더해진 일별 흐름이에요.</Note>
        </Cell>

        <Cell title="유출 — 강화·배·미끼">
          <BarsChart values={series(r => r.rod_cost + r.boat_cost + r.bait_cost)} labels={dayLabels}
                     height={72} highlight="last" highlightName="금일" ariaLabel="골드 유출 일별 추이" />
          <Note size="2xs" className="my-0">강화·배 구매·미끼 지출의 일별 합계예요.</Note>
        </Cell>
      </CellGrid>

      <Cell title="원장 대차대조" flush divided>
        <KeyValueRow label="기간 내 유입합" value={`${fmtNum(inflowTotal)}G`} />
        <KeyValueRow label="기간 내 유출합" value={`${fmtNum(outflowTotal)}G`} />
        <KeyValueRow label="순유입"
                     value={<span className="pf-accent text-gold">{fmtNum(inflowTotal - outflowTotal)}G</span>} />
        <KeyValueRow label="전체 잔고 합" value={`${fmtNum(goldSum)}G`} />
        <Note size="xs" className="my-0 px-3 py-2 leading-relaxed">
          전체 잔고 합이 순유입보다 크게 많으면, 그 차액은
          <span className="pf-accent text-gold"> 이벤트 밖 경로(이사 코드 반입)</span>로 들어온 골드예요.
          플레이어 탭의 이상탐지에서 반입 로그와 대조해 주세요.
        </Note>
      </Cell>
    </>
  );
}
