// 경제 탭 — 골드 유입(sell·coupon)과 유출(upgradeRod·buyBoat·buyBait)의 일 원장 + 잔고 분포.
// 레이아웃: [잔고 백분위 KPI 4] → 좌우 분할(유입 | 유출, xl) → 원장 대차 카드(풀폭).
// 유입합 − 유출합이 실제 보유 골드 합보다 크게 어긋나면 import 반입 경로를 의심한다
// (v_economy_daily 뷰 머리 주석 · queries-audit.sql ⑨).
import { useEffect, useMemo, useState } from 'react';
import MetricSwitch from '../widgets/MetricSwitch';
import { fmtNum, lastNDays, fillSeries, percentile } from '../metrics';
import { api } from '../../api';
import type { AdminEconomyRow, AdminUserRow } from '../../api';
import { useAdminAuth } from '../accessContext';
import { BarsChart, Frame, KpiGrid, KpiCard, TabState } from '../charts';

type Range = '30' | '90';

export default function EconomyTab() {
  const { access } = useAdminAuth();
  const granted = access === 'granted';
  const [range, setRange] = useState<Range>('30');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [economy, setEconomy] = useState<AdminEconomyRow[]>([]);
  const [users, setUsers] = useState<AdminUserRow[]>([]);

  const run = (r: Range = range) =>
    (async () => {
      const [eco, us] = await Promise.all([api.admin.economy(Number(r)), api.admin.users()]);
      setEconomy([...eco].reverse());
      setUsers(us);
    })().then(() => setLoading(false),
              e => { setError(String(e?.message ?? e)); setLoading(false); });

  useEffect(() => {
    // granted가 된 순간 현재 범위로 조회 — 그 전엔 빈 골격만
    if (!granted) { setLoading(false); return; }
    void run();
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- 판정 완료 시점 실행
  }, [granted]);

  const onRange = (r: Range) => { setRange(r); if (granted) loadAll(r); };
  const loadAll = (r: Range) => { setLoading(true); setError(null); void run(r); };

  const days = lastNDays(Number(range));
  const series = (f: (r: AdminEconomyRow) => number) =>
    fillSeries(economy, days, r => r.day, f);

  // 잔고 백분위 — gold 기준
  const goldStats = useMemo(() => users.map(u => toNum(u.gold))
    .filter(Number.isFinite).sort((a, b) => a - b), [users]);

  return (
    <div className="flex flex-col gap-3">
      <Frame title="골드 잔고 분포">
        <KpiGrid>
          <KpiCard label="잔고 합" value={fmtNum(goldStats.reduce((s, v) => s + v, 0))}
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
                        onChange={onRange} ariaLabel="기간 선택" />
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
        <TabState loading={loading && granted} error={error} onRetry={() => loadAll(range)} />
        <p className="text-xs text-text-dim leading-relaxed">
          기간 내 유입합 {fmtNum(inflowTotal())}G · 유출합 {fmtNum(outflowTotal())}G ·
          순유입 <span className="pf-accent text-gold">{fmtNum(inflowTotal() - outflowTotal())}G</span>.
          전체 잔고 합({fmtNum(goldSum())}G)이 순유입보다 크게 많으면 그 차액은
          <span className="pf-accent text-gold">이벤트 밖 경로(import 반입)</span>가 들여온 돈이다 —
          이상탐지 탭의 반입 로그와 대조.
        </p>
      </Frame>
    </div>
  );

  function goldSum(): number {
    return goldStats.reduce((s, v) => s + v, 0);
  }
  function inflowTotal(): number {
    return economy.reduce((s, r) => s + Number(r.sell_gold) + Number(r.coupon_gold), 0);
  }
  function outflowTotal(): number {
    return economy.reduce((s, r) =>
      s + Number(r.rod_cost) + Number(r.boat_cost) + Number(r.bait_cost), 0);
  }
}

/** number|string|null(DB 스칼라) → 숫자 — 표기 전용 */
const toNum = (v: number | string | null): number =>
  v === null ? NaN : Number(v);
