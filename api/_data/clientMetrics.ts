// 클라이언트 체감 성능 일별 지표(client_metrics_daily) 쓰기·읽기 소유 모듈.
// 수집기가 모은 KST 일별 증분을 json_to_recordset 단일 문장으로 합산 upsert하고,
// 관리자 조회(readClientMetrics)로 최근 1~90일 요약과 일별 추이를 돌려준다.
import { sql } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';
import { jsonParam } from './json.js';

export interface ClientLatencyStat {
  p50Ms: number | null;
  p95Ms: number | null;
  avgMs: number | null;
  samples: number;
}

export interface ClientMetricsSummary {
  reports: number;
  lcp: ClientLatencyStat;
  inp: ClientLatencyStat;
  ttfb: ClientLatencyStat;
  clsAvg: number | null;
  actionRtt: ClientLatencyStat & { timeouts: number; conflicts409: number };
  meRtt: ClientLatencyStat & { timeouts: number };
  canvasFrames: number;
  canvasLongFrames: number;
  longFramePct: number | null;
  wsReconnects: number;
  wsAbnormalCloses: number;
}

export interface ClientMetricsDayRow extends ClientMetricsSummary {
  day: string;
}

export interface ClientMetricsReport {
  days: number;
  summary: ClientMetricsSummary;
  daily: ClientMetricsDayRow[];
}

export interface ClientMetricsCounts {
  reports: number;
  lcpLe1500: number;
  lcpLe2500: number;
  lcpLe4000: number;
  lcpGt4000: number;
  lcpSumMs: number;
  lcpCount: number;
  inpLe100: number;
  inpLe200: number;
  inpLe500: number;
  inpGt500: number;
  inpSumMs: number;
  inpCount: number;
  ttfbLe200: number;
  ttfbLe500: number;
  ttfbLe1000: number;
  ttfbGt1000: number;
  ttfbSumMs: number;
  ttfbCount: number;
  clsSumX1000: number;
  clsCount: number;
  actionRttLe100: number;
  actionRttLe250: number;
  actionRttLe500: number;
  actionRttLe1000: number;
  actionRttGt1000: number;
  actionRttSumMs: number;
  actionRttCount: number;
  actionTimeouts: number;
  actionConflicts409: number;
  meRttLe100: number;
  meRttLe250: number;
  meRttLe500: number;
  meRttLe1000: number;
  meRttGt1000: number;
  meRttSumMs: number;
  meRttCount: number;
  meTimeouts: number;
  canvasFrames: number;
  canvasLongFrames: number;
  wsReconnects: number;
  wsAbnormalCloses: number;
}

export interface ClientMetricIncrement extends ClientMetricsCounts {
  day: string;
}

const MAX_DAYS = 90;

export const emptyClientCounts = (): ClientMetricsCounts => ({
  reports: 0,
  lcpLe1500: 0,
  lcpLe2500: 0,
  lcpLe4000: 0,
  lcpGt4000: 0,
  lcpSumMs: 0,
  lcpCount: 0,
  inpLe100: 0,
  inpLe200: 0,
  inpLe500: 0,
  inpGt500: 0,
  inpSumMs: 0,
  inpCount: 0,
  ttfbLe200: 0,
  ttfbLe500: 0,
  ttfbLe1000: 0,
  ttfbGt1000: 0,
  ttfbSumMs: 0,
  ttfbCount: 0,
  clsSumX1000: 0,
  clsCount: 0,
  actionRttLe100: 0,
  actionRttLe250: 0,
  actionRttLe500: 0,
  actionRttLe1000: 0,
  actionRttGt1000: 0,
  actionRttSumMs: 0,
  actionRttCount: 0,
  actionTimeouts: 0,
  actionConflicts409: 0,
  meRttLe100: 0,
  meRttLe250: 0,
  meRttLe500: 0,
  meRttLe1000: 0,
  meRttGt1000: 0,
  meRttSumMs: 0,
  meRttCount: 0,
  meTimeouts: 0,
  canvasFrames: 0,
  canvasLongFrames: 0,
  wsReconnects: 0,
  wsAbnormalCloses: 0,
});

const COUNT_KEYS = Object.keys(emptyClientCounts()) as (keyof ClientMetricsCounts)[];

export function addClientCounts(dst: ClientMetricsCounts, src: ClientMetricsCounts): void {
  for (const k of COUNT_KEYS) dst[k] += src[k];
}

function hasAnyClientIncrement(c: ClientMetricsCounts): boolean {
  for (const k of COUNT_KEYS) {
    if (c[k] > 0) return true;
  }
  return false;
}

function estimateBucketStat(
  steps: readonly [count: number, upper: number][],
  gtCount: number,
  lastFiniteUpper: number,
  sumMs: number,
  count: number,
): ClientLatencyStat {
  const totalFromBuckets = steps.reduce((acc, [c]) => acc + c, 0) + gtCount;
  const samples = count > 0 ? count : totalFromBuckets;
  if (samples <= 0) {
    return { p50Ms: null, p95Ms: null, avgMs: null, samples: 0 };
  }
  const avgMs = Math.round(sumMs / samples);
  const gtUpper = Math.max(lastFiniteUpper, avgMs);
  const allSteps: readonly [number, number][] = [...steps, [gtCount, gtUpper]];
  const pick = (q: number): number => {
    const rank = Math.ceil(totalFromBuckets * q);
    let cum = 0;
    for (const [c, upper] of allSteps) {
      cum += c;
      if (cum >= rank) return upper;
    }
    return gtUpper;
  };
  return {
    p50Ms: totalFromBuckets > 0 ? pick(0.5) : avgMs,
    p95Ms: totalFromBuckets > 0 ? pick(0.95) : avgMs,
    avgMs,
    samples,
  };
}

function toClientSummary(c: ClientMetricsCounts): ClientMetricsSummary {
  return {
    reports: c.reports,
    lcp: estimateBucketStat(
      [[c.lcpLe1500, 1500], [c.lcpLe2500, 2500], [c.lcpLe4000, 4000]],
      c.lcpGt4000,
      4000,
      c.lcpSumMs,
      c.lcpCount,
    ),
    inp: estimateBucketStat(
      [[c.inpLe100, 100], [c.inpLe200, 200], [c.inpLe500, 500]],
      c.inpGt500,
      500,
      c.inpSumMs,
      c.inpCount,
    ),
    ttfb: estimateBucketStat(
      [[c.ttfbLe200, 200], [c.ttfbLe500, 500], [c.ttfbLe1000, 1000]],
      c.ttfbGt1000,
      1000,
      c.ttfbSumMs,
      c.ttfbCount,
    ),
    clsAvg: c.clsCount > 0 ? Math.round(c.clsSumX1000 / c.clsCount) / 1000 : null,
    actionRtt: {
      ...estimateBucketStat(
        [[c.actionRttLe100, 100], [c.actionRttLe250, 250], [c.actionRttLe500, 500], [c.actionRttLe1000, 1000]],
        c.actionRttGt1000,
        1000,
        c.actionRttSumMs,
        c.actionRttCount,
      ),
      timeouts: c.actionTimeouts,
      conflicts409: c.actionConflicts409,
    },
    meRtt: {
      ...estimateBucketStat(
        [[c.meRttLe100, 100], [c.meRttLe250, 250], [c.meRttLe500, 500], [c.meRttLe1000, 1000]],
        c.meRttGt1000,
        1000,
        c.meRttSumMs,
        c.meRttCount,
      ),
      timeouts: c.meTimeouts,
    },
    canvasFrames: c.canvasFrames,
    canvasLongFrames: c.canvasLongFrames,
    longFramePct: c.canvasFrames > 0
      ? Math.round((c.canvasLongFrames / c.canvasFrames) * 1000) / 10
      : null,
    wsReconnects: c.wsReconnects,
    wsAbnormalCloses: c.wsAbnormalCloses,
  };
}

/** 메모리에 모은 클라이언트 지표 증분을 KST 일별로 합산 upsert한다 */
export async function flushClientMetrics(db: Executor, increments: readonly ClientMetricIncrement[]): Promise<void> {
  const merged = new Map<string, ClientMetricIncrement>();
  for (const row of increments) {
    if (!hasAnyClientIncrement(row)) continue;
    const existing = merged.get(row.day);
    if (existing) addClientCounts(existing, row);
    else merged.set(row.day, { ...row });
  }
  if (merged.size === 0) return;

  const payload = [...merged.values()].map(r => ({
    day: r.day,
    reports: r.reports,
    lcp_le_1500: r.lcpLe1500,
    lcp_le_2500: r.lcpLe2500,
    lcp_le_4000: r.lcpLe4000,
    lcp_gt_4000: r.lcpGt4000,
    lcp_sum_ms: r.lcpSumMs,
    lcp_count: r.lcpCount,
    inp_le_100: r.inpLe100,
    inp_le_200: r.inpLe200,
    inp_le_500: r.inpLe500,
    inp_gt_500: r.inpGt500,
    inp_sum_ms: r.inpSumMs,
    inp_count: r.inpCount,
    ttfb_le_200: r.ttfbLe200,
    ttfb_le_500: r.ttfbLe500,
    ttfb_le_1000: r.ttfbLe1000,
    ttfb_gt_1000: r.ttfbGt1000,
    ttfb_sum_ms: r.ttfbSumMs,
    ttfb_count: r.ttfbCount,
    cls_sum_x1000: r.clsSumX1000,
    cls_count: r.clsCount,
    action_rtt_le_100: r.actionRttLe100,
    action_rtt_le_250: r.actionRttLe250,
    action_rtt_le_500: r.actionRttLe500,
    action_rtt_le_1000: r.actionRttLe1000,
    action_rtt_gt_1000: r.actionRttGt1000,
    action_rtt_sum_ms: r.actionRttSumMs,
    action_rtt_count: r.actionRttCount,
    action_timeouts: r.actionTimeouts,
    action_conflicts_409: r.actionConflicts409,
    me_rtt_le_100: r.meRttLe100,
    me_rtt_le_250: r.meRttLe250,
    me_rtt_le_500: r.meRttLe500,
    me_rtt_le_1000: r.meRttLe1000,
    me_rtt_gt_1000: r.meRttGt1000,
    me_rtt_sum_ms: r.meRttSumMs,
    me_rtt_count: r.meRttCount,
    me_timeouts: r.meTimeouts,
    canvas_frames: r.canvasFrames,
    canvas_long_frames: r.canvasLongFrames,
    ws_reconnects: r.wsReconnects,
    ws_abnormal_closes: r.wsAbnormalCloses,
  }));

  await db.execute(sql`
    insert into public.client_metrics_daily (
      day, reports,
      lcp_le_1500, lcp_le_2500, lcp_le_4000, lcp_gt_4000, lcp_sum_ms, lcp_count,
      inp_le_100, inp_le_200, inp_le_500, inp_gt_500, inp_sum_ms, inp_count,
      ttfb_le_200, ttfb_le_500, ttfb_le_1000, ttfb_gt_1000, ttfb_sum_ms, ttfb_count,
      cls_sum_x1000, cls_count,
      action_rtt_le_100, action_rtt_le_250, action_rtt_le_500, action_rtt_le_1000, action_rtt_gt_1000,
      action_rtt_sum_ms, action_rtt_count, action_timeouts, action_conflicts_409,
      me_rtt_le_100, me_rtt_le_250, me_rtt_le_500, me_rtt_le_1000, me_rtt_gt_1000,
      me_rtt_sum_ms, me_rtt_count, me_timeouts,
      canvas_frames, canvas_long_frames, ws_reconnects, ws_abnormal_closes,
      updated_at
    )
    select r.day::date, r.reports,
      r.lcp_le_1500, r.lcp_le_2500, r.lcp_le_4000, r.lcp_gt_4000, r.lcp_sum_ms, r.lcp_count,
      r.inp_le_100, r.inp_le_200, r.inp_le_500, r.inp_gt_500, r.inp_sum_ms, r.inp_count,
      r.ttfb_le_200, r.ttfb_le_500, r.ttfb_le_1000, r.ttfb_gt_1000, r.ttfb_sum_ms, r.ttfb_count,
      r.cls_sum_x1000, r.cls_count,
      r.action_rtt_le_100, r.action_rtt_le_250, r.action_rtt_le_500, r.action_rtt_le_1000, r.action_rtt_gt_1000,
      r.action_rtt_sum_ms, r.action_rtt_count, r.action_timeouts, r.action_conflicts_409,
      r.me_rtt_le_100, r.me_rtt_le_250, r.me_rtt_le_500, r.me_rtt_le_1000, r.me_rtt_gt_1000,
      r.me_rtt_sum_ms, r.me_rtt_count, r.me_timeouts,
      r.canvas_frames, r.canvas_long_frames, r.ws_reconnects, r.ws_abnormal_closes,
      now()
    from json_to_recordset(${jsonParam(payload)}) as r(
      day text,
      reports bigint,
      lcp_le_1500 bigint,
      lcp_le_2500 bigint,
      lcp_le_4000 bigint,
      lcp_gt_4000 bigint,
      lcp_sum_ms bigint,
      lcp_count bigint,
      inp_le_100 bigint,
      inp_le_200 bigint,
      inp_le_500 bigint,
      inp_gt_500 bigint,
      inp_sum_ms bigint,
      inp_count bigint,
      ttfb_le_200 bigint,
      ttfb_le_500 bigint,
      ttfb_le_1000 bigint,
      ttfb_gt_1000 bigint,
      ttfb_sum_ms bigint,
      ttfb_count bigint,
      cls_sum_x1000 bigint,
      cls_count bigint,
      action_rtt_le_100 bigint,
      action_rtt_le_250 bigint,
      action_rtt_le_500 bigint,
      action_rtt_le_1000 bigint,
      action_rtt_gt_1000 bigint,
      action_rtt_sum_ms bigint,
      action_rtt_count bigint,
      action_timeouts bigint,
      action_conflicts_409 bigint,
      me_rtt_le_100 bigint,
      me_rtt_le_250 bigint,
      me_rtt_le_500 bigint,
      me_rtt_le_1000 bigint,
      me_rtt_gt_1000 bigint,
      me_rtt_sum_ms bigint,
      me_rtt_count bigint,
      me_timeouts bigint,
      canvas_frames bigint,
      canvas_long_frames bigint,
      ws_reconnects bigint,
      ws_abnormal_closes bigint
    )
    on conflict (day) do update set
      reports = public.client_metrics_daily.reports + excluded.reports,
      lcp_le_1500 = public.client_metrics_daily.lcp_le_1500 + excluded.lcp_le_1500,
      lcp_le_2500 = public.client_metrics_daily.lcp_le_2500 + excluded.lcp_le_2500,
      lcp_le_4000 = public.client_metrics_daily.lcp_le_4000 + excluded.lcp_le_4000,
      lcp_gt_4000 = public.client_metrics_daily.lcp_gt_4000 + excluded.lcp_gt_4000,
      lcp_sum_ms = public.client_metrics_daily.lcp_sum_ms + excluded.lcp_sum_ms,
      lcp_count = public.client_metrics_daily.lcp_count + excluded.lcp_count,
      inp_le_100 = public.client_metrics_daily.inp_le_100 + excluded.inp_le_100,
      inp_le_200 = public.client_metrics_daily.inp_le_200 + excluded.inp_le_200,
      inp_le_500 = public.client_metrics_daily.inp_le_500 + excluded.inp_le_500,
      inp_gt_500 = public.client_metrics_daily.inp_gt_500 + excluded.inp_gt_500,
      inp_sum_ms = public.client_metrics_daily.inp_sum_ms + excluded.inp_sum_ms,
      inp_count = public.client_metrics_daily.inp_count + excluded.inp_count,
      ttfb_le_200 = public.client_metrics_daily.ttfb_le_200 + excluded.ttfb_le_200,
      ttfb_le_500 = public.client_metrics_daily.ttfb_le_500 + excluded.ttfb_le_500,
      ttfb_le_1000 = public.client_metrics_daily.ttfb_le_1000 + excluded.ttfb_le_1000,
      ttfb_gt_1000 = public.client_metrics_daily.ttfb_gt_1000 + excluded.ttfb_gt_1000,
      ttfb_sum_ms = public.client_metrics_daily.ttfb_sum_ms + excluded.ttfb_sum_ms,
      ttfb_count = public.client_metrics_daily.ttfb_count + excluded.ttfb_count,
      cls_sum_x1000 = public.client_metrics_daily.cls_sum_x1000 + excluded.cls_sum_x1000,
      cls_count = public.client_metrics_daily.cls_count + excluded.cls_count,
      action_rtt_le_100 = public.client_metrics_daily.action_rtt_le_100 + excluded.action_rtt_le_100,
      action_rtt_le_250 = public.client_metrics_daily.action_rtt_le_250 + excluded.action_rtt_le_250,
      action_rtt_le_500 = public.client_metrics_daily.action_rtt_le_500 + excluded.action_rtt_le_500,
      action_rtt_le_1000 = public.client_metrics_daily.action_rtt_le_1000 + excluded.action_rtt_le_1000,
      action_rtt_gt_1000 = public.client_metrics_daily.action_rtt_gt_1000 + excluded.action_rtt_gt_1000,
      action_rtt_sum_ms = public.client_metrics_daily.action_rtt_sum_ms + excluded.action_rtt_sum_ms,
      action_rtt_count = public.client_metrics_daily.action_rtt_count + excluded.action_rtt_count,
      action_timeouts = public.client_metrics_daily.action_timeouts + excluded.action_timeouts,
      action_conflicts_409 = public.client_metrics_daily.action_conflicts_409 + excluded.action_conflicts_409,
      me_rtt_le_100 = public.client_metrics_daily.me_rtt_le_100 + excluded.me_rtt_le_100,
      me_rtt_le_250 = public.client_metrics_daily.me_rtt_le_250 + excluded.me_rtt_le_250,
      me_rtt_le_500 = public.client_metrics_daily.me_rtt_le_500 + excluded.me_rtt_le_500,
      me_rtt_le_1000 = public.client_metrics_daily.me_rtt_le_1000 + excluded.me_rtt_le_1000,
      me_rtt_gt_1000 = public.client_metrics_daily.me_rtt_gt_1000 + excluded.me_rtt_gt_1000,
      me_rtt_sum_ms = public.client_metrics_daily.me_rtt_sum_ms + excluded.me_rtt_sum_ms,
      me_rtt_count = public.client_metrics_daily.me_rtt_count + excluded.me_rtt_count,
      me_timeouts = public.client_metrics_daily.me_timeouts + excluded.me_timeouts,
      canvas_frames = public.client_metrics_daily.canvas_frames + excluded.canvas_frames,
      canvas_long_frames = public.client_metrics_daily.canvas_long_frames + excluded.canvas_long_frames,
      ws_reconnects = public.client_metrics_daily.ws_reconnects + excluded.ws_reconnects,
      ws_abnormal_closes = public.client_metrics_daily.ws_abnormal_closes + excluded.ws_abnormal_closes,
      updated_at = now()
  `);
}

type RawClientRow = {
  day: string;
  reports: string | number;
  lcp_le_1500: string | number;
  lcp_le_2500: string | number;
  lcp_le_4000: string | number;
  lcp_gt_4000: string | number;
  lcp_sum_ms: string | number;
  lcp_count: string | number;
  inp_le_100: string | number;
  inp_le_200: string | number;
  inp_le_500: string | number;
  inp_gt_500: string | number;
  inp_sum_ms: string | number;
  inp_count: string | number;
  ttfb_le_200: string | number;
  ttfb_le_500: string | number;
  ttfb_le_1000: string | number;
  ttfb_gt_1000: string | number;
  ttfb_sum_ms: string | number;
  ttfb_count: string | number;
  cls_sum_x1000: string | number;
  cls_count: string | number;
  action_rtt_le_100: string | number;
  action_rtt_le_250: string | number;
  action_rtt_le_500: string | number;
  action_rtt_le_1000: string | number;
  action_rtt_gt_1000: string | number;
  action_rtt_sum_ms: string | number;
  action_rtt_count: string | number;
  action_timeouts: string | number;
  action_conflicts_409: string | number;
  me_rtt_le_100: string | number;
  me_rtt_le_250: string | number;
  me_rtt_le_500: string | number;
  me_rtt_le_1000: string | number;
  me_rtt_gt_1000: string | number;
  me_rtt_sum_ms: string | number;
  me_rtt_count: string | number;
  me_timeouts: string | number;
  canvas_frames: string | number;
  canvas_long_frames: string | number;
  ws_reconnects: string | number;
  ws_abnormal_closes: string | number;
};

/** 최근 days일(KST 오늘 포함, 1~90일)의 클라이언트 체감 성능 지표를 읽어 요약과 일별 추이를 반환한다 */
export async function readClientMetrics(db: Executor, days: number): Promise<ClientMetricsReport> {
  const period = Math.min(Math.max(Math.trunc(days), 1), MAX_DAYS);
  const { rows } = await db.execute<RawClientRow>(sql`
    select to_char(day, 'YYYY-MM-DD') as day,
           reports,
           lcp_le_1500, lcp_le_2500, lcp_le_4000, lcp_gt_4000, lcp_sum_ms, lcp_count,
           inp_le_100, inp_le_200, inp_le_500, inp_gt_500, inp_sum_ms, inp_count,
           ttfb_le_200, ttfb_le_500, ttfb_le_1000, ttfb_gt_1000, ttfb_sum_ms, ttfb_count,
           cls_sum_x1000, cls_count,
           action_rtt_le_100, action_rtt_le_250, action_rtt_le_500, action_rtt_le_1000, action_rtt_gt_1000,
           action_rtt_sum_ms, action_rtt_count, action_timeouts, action_conflicts_409,
           me_rtt_le_100, me_rtt_le_250, me_rtt_le_500, me_rtt_le_1000, me_rtt_gt_1000,
           me_rtt_sum_ms, me_rtt_count, me_timeouts,
           canvas_frames, canvas_long_frames, ws_reconnects, ws_abnormal_closes
    from public.client_metrics_daily
    where day >= (now() at time zone 'Asia/Seoul')::date - ${period - 1}::int
    order by day asc
  `);

  const summaryCounts = emptyClientCounts();
  const daily: ClientMetricsDayRow[] = rows.map(r => {
    const counts: ClientMetricsCounts = {
      reports: Number(r.reports),
      lcpLe1500: Number(r.lcp_le_1500),
      lcpLe2500: Number(r.lcp_le_2500),
      lcpLe4000: Number(r.lcp_le_4000),
      lcpGt4000: Number(r.lcp_gt_4000),
      lcpSumMs: Number(r.lcp_sum_ms),
      lcpCount: Number(r.lcp_count),
      inpLe100: Number(r.inp_le_100),
      inpLe200: Number(r.inp_le_200),
      inpLe500: Number(r.inp_le_500),
      inpGt500: Number(r.inp_gt_500),
      inpSumMs: Number(r.inp_sum_ms),
      inpCount: Number(r.inp_count),
      ttfbLe200: Number(r.ttfb_le_200),
      ttfbLe500: Number(r.ttfb_le_500),
      ttfbLe1000: Number(r.ttfb_le_1000),
      ttfbGt1000: Number(r.ttfb_gt_1000),
      ttfbSumMs: Number(r.ttfb_sum_ms),
      ttfbCount: Number(r.ttfb_count),
      clsSumX1000: Number(r.cls_sum_x1000),
      clsCount: Number(r.cls_count),
      actionRttLe100: Number(r.action_rtt_le_100),
      actionRttLe250: Number(r.action_rtt_le_250),
      actionRttLe500: Number(r.action_rtt_le_500),
      actionRttLe1000: Number(r.action_rtt_le_1000),
      actionRttGt1000: Number(r.action_rtt_gt_1000),
      actionRttSumMs: Number(r.action_rtt_sum_ms),
      actionRttCount: Number(r.action_rtt_count),
      actionTimeouts: Number(r.action_timeouts),
      actionConflicts409: Number(r.action_conflicts_409),
      meRttLe100: Number(r.me_rtt_le_100),
      meRttLe250: Number(r.me_rtt_le_250),
      meRttLe500: Number(r.me_rtt_le_500),
      meRttLe1000: Number(r.me_rtt_le_1000),
      meRttGt1000: Number(r.me_rtt_gt_1000),
      meRttSumMs: Number(r.me_rtt_sum_ms),
      meRttCount: Number(r.me_rtt_count),
      meTimeouts: Number(r.me_timeouts),
      canvasFrames: Number(r.canvas_frames),
      canvasLongFrames: Number(r.canvas_long_frames),
      wsReconnects: Number(r.ws_reconnects),
      wsAbnormalCloses: Number(r.ws_abnormal_closes),
    };
    addClientCounts(summaryCounts, counts);
    return {
      day: r.day,
      ...toClientSummary(counts),
    };
  });

  return {
    days: period,
    summary: toClientSummary(summaryCounts),
    daily,
  };
}
