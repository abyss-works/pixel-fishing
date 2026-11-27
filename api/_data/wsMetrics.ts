// WebSocket 일별 지표(ws_metrics_daily) 쓰기·읽기 소유 모듈.
// 실시간 채널 허브가 메모리에 모은 KST 일별 업그레이드·거부·종료 건수를 합산 upsert하고,
// 운영 상태 조회(readWsMetrics)로 기간 요약과 일별 추이를 돌려준다.
import { sql } from 'drizzle-orm';
import type { Executor } from '../_db/client.js';
import { jsonParam } from './json.js';

export interface WsMetricIncrement {
  day: string;
  upgradesOk: number;
  reject401: number;
  reject403: number;
  reject500: number;
  closeNormal: number;
  closeAbnormal: number;
  closeIdleTimeout: number;
}

export interface WsMetricsCounts {
  upgradesOk: number;
  reject401: number;
  reject403: number;
  reject500: number;
  closeNormal: number;
  closeAbnormal: number;
  closeIdleTimeout: number;
}

export interface WsMetricsDayRow extends WsMetricsCounts {
  day: string;
}

export interface WsMetricsReport {
  days: number;
  summary: WsMetricsCounts;
  daily: WsMetricsDayRow[];
}

const MAX_DAYS = 90;

export const emptyWsCounts = (): WsMetricsCounts => ({
  upgradesOk: 0,
  reject401: 0,
  reject403: 0,
  reject500: 0,
  closeNormal: 0,
  closeAbnormal: 0,
  closeIdleTimeout: 0,
});

function hasAnyIncrement(r: WsMetricIncrement): boolean {
  return r.upgradesOk > 0
    || r.reject401 > 0
    || r.reject403 > 0
    || r.reject500 > 0
    || r.closeNormal > 0
    || r.closeAbnormal > 0
    || r.closeIdleTimeout > 0;
}

/** 메모리에 모은 WebSocket 지표 증분을 KST 일별로 합산 upsert한다 */
export async function flushWsMetrics(db: Executor, increments: readonly WsMetricIncrement[]): Promise<void> {
  const merged = new Map<string, WsMetricIncrement>();
  for (const row of increments) {
    if (!hasAnyIncrement(row)) continue;
    const existing = merged.get(row.day);
    if (existing) {
      existing.upgradesOk += row.upgradesOk;
      existing.reject401 += row.reject401;
      existing.reject403 += row.reject403;
      existing.reject500 += row.reject500;
      existing.closeNormal += row.closeNormal;
      existing.closeAbnormal += row.closeAbnormal;
      existing.closeIdleTimeout += row.closeIdleTimeout;
    } else {
      merged.set(row.day, { ...row });
    }
  }
  if (merged.size === 0) return;

  const payload = [...merged.values()].map(r => ({
    day: r.day,
    upgrades_ok: r.upgradesOk,
    reject_401: r.reject401,
    reject_403: r.reject403,
    reject_500: r.reject500,
    close_normal: r.closeNormal,
    close_abnormal: r.closeAbnormal,
    close_idle_timeout: r.closeIdleTimeout,
  }));

  await db.execute(sql`
    insert into public.ws_metrics_daily (
      day, upgrades_ok, reject_401, reject_403, reject_500,
      close_normal, close_abnormal, close_idle_timeout, updated_at
    )
    select r.day::date, r.upgrades_ok, r.reject_401, r.reject_403, r.reject_500,
           r.close_normal, r.close_abnormal, r.close_idle_timeout, now()
    from json_to_recordset(${jsonParam(payload)}) as r(
      day text,
      upgrades_ok bigint,
      reject_401 bigint,
      reject_403 bigint,
      reject_500 bigint,
      close_normal bigint,
      close_abnormal bigint,
      close_idle_timeout bigint
    )
    on conflict (day) do update set
      upgrades_ok = public.ws_metrics_daily.upgrades_ok + excluded.upgrades_ok,
      reject_401 = public.ws_metrics_daily.reject_401 + excluded.reject_401,
      reject_403 = public.ws_metrics_daily.reject_403 + excluded.reject_403,
      reject_500 = public.ws_metrics_daily.reject_500 + excluded.reject_500,
      close_normal = public.ws_metrics_daily.close_normal + excluded.close_normal,
      close_abnormal = public.ws_metrics_daily.close_abnormal + excluded.close_abnormal,
      close_idle_timeout = public.ws_metrics_daily.close_idle_timeout + excluded.close_idle_timeout,
      updated_at = now()
  `);
}

type RawWsRow = {
  day: string;
  upgrades_ok: string | number;
  reject_401: string | number;
  reject_403: string | number;
  reject_500: string | number;
  close_normal: string | number;
  close_abnormal: string | number;
  close_idle_timeout: string | number;
};

/** 최근 days일(KST 오늘 포함, 1~90일)의 WebSocket 일별 지표를 읽어 합계와 일별 추이를 반환한다 */
export async function readWsMetrics(db: Executor, days: number): Promise<WsMetricsReport> {
  const period = Math.min(Math.max(Math.trunc(days), 1), MAX_DAYS);
  const { rows } = await db.execute<RawWsRow>(sql`
    select to_char(day, 'YYYY-MM-DD') as day,
           upgrades_ok,
           reject_401,
           reject_403,
           reject_500,
           close_normal,
           close_abnormal,
           close_idle_timeout
    from public.ws_metrics_daily
    where day >= (now() at time zone 'Asia/Seoul')::date - ${period - 1}::int
    order by day asc
  `);

  const summary = emptyWsCounts();
  const daily: WsMetricsDayRow[] = rows.map(r => {
    const row: WsMetricsDayRow = {
      day: r.day,
      upgradesOk: Number(r.upgrades_ok),
      reject401: Number(r.reject_401),
      reject403: Number(r.reject_403),
      reject500: Number(r.reject_500),
      closeNormal: Number(r.close_normal),
      closeAbnormal: Number(r.close_abnormal),
      closeIdleTimeout: Number(r.close_idle_timeout),
    };
    summary.upgradesOk += row.upgradesOk;
    summary.reject401 += row.reject401;
    summary.reject403 += row.reject403;
    summary.reject500 += row.reject500;
    summary.closeNormal += row.closeNormal;
    summary.closeAbnormal += row.closeAbnormal;
    summary.closeIdleTimeout += row.closeIdleTimeout;
    return row;
  });

  return { days: period, summary, daily };
}
