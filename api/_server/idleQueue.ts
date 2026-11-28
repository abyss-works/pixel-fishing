// 무상태 서버 방치 큐 — Valkey에 유저별 활성 방치 상태와 누적 델타/요약을 저장한다.
// 프로세스 로컬 메모리를 쓰지 않으며, Valkey 장애·미연결 시 Fail-open으로 조용히 폴백한다.
import type { SpotId } from '../../src/game/content/spots.js';
import type { AwaySummary } from '../../src/game/rules/away.js';
import { DEFAULT_MAX_IDLE_WINDOW_MS } from '../../src/game/rules/awaySettle.js';
import { getRedisClient, warnRedisOnce } from './redisClient.js';

/** Valkey 방치 키 TTL — 20시간 상한 + 1시간 여유 */
export const IDLE_QUEUE_TTL_SEC = Math.ceil(DEFAULT_MAX_IDLE_WINDOW_MS / 1000) + 3600;

export interface IdleQueueRedisLike {
  status?: string;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, expiryMode: 'EX', time: number): Promise<unknown>;
  del(key: string): Promise<number>;
}

export interface IdleQueueState {
  spotId: SpotId;
  startedAtMs: number;
  lastProcessedAtMs: number;
  /** 누적 델타/요약 스냅샷 캐시 (유저당 ~5-20KB 수준) */
  accumulatedSummary?: AwaySummary | null;
  updatedAtMs: number;
}

export interface IdleQueueOptions {
  env?: string;
  client?: IdleQueueRedisLike | null;
}

function resolveEnvName(explicit?: string): string {
  const raw = explicit ?? process.env.APP_ENV ?? process.env.NODE_ENV ?? 'dev';
  return raw.trim().toLowerCase() || 'dev';
}

export function idleQueueKey(uid: string, env?: string): string {
  return `pf:${resolveEnvName(env)}:idle:${uid}`;
}

function resolveClient(opts?: IdleQueueOptions): IdleQueueRedisLike | null {
  if (opts && 'client' in opts) return opts.client ?? null;
  const client = getRedisClient();
  if (!client || client.status !== 'ready') return null;
  return client;
}

function parseIdleQueueState(raw: string | null): IdleQueueState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<IdleQueueState>;
    if (
      typeof parsed.spotId !== 'string'
      || typeof parsed.startedAtMs !== 'number' || !Number.isFinite(parsed.startedAtMs)
      || typeof parsed.lastProcessedAtMs !== 'number' || !Number.isFinite(parsed.lastProcessedAtMs)
      || typeof parsed.updatedAtMs !== 'number' || !Number.isFinite(parsed.updatedAtMs)
    ) {
      return null;
    }
    return {
      spotId: parsed.spotId as SpotId,
      startedAtMs: parsed.startedAtMs,
      lastProcessedAtMs: parsed.lastProcessedAtMs,
      accumulatedSummary: parsed.accumulatedSummary ?? null,
      updatedAtMs: parsed.updatedAtMs,
    };
  } catch {
    return null;
  }
}

/** Valkey에서 유저의 활성 방치 큐 상태를 읽는다. 미연결·오류 시 null(Fail-open) */
export async function readIdleQueue(uid: string, opts?: IdleQueueOptions): Promise<IdleQueueState | null> {
  const client = resolveClient(opts);
  if (!client) return null;
  try {
    const raw = await client.get(idleQueueKey(uid, opts?.env));
    return parseIdleQueueState(raw);
  } catch (err) {
    warnRedisOnce('idle-queue-read', err);
    return null;
  }
}

/** 낚싯줄을 던졌을 때 Valkey에 활성 방치 상태를 등록한다. championship 구역은 제외한다 */
export async function startIdleQueue(
  uid: string,
  spotId: SpotId,
  nowMs: number,
  opts?: IdleQueueOptions,
): Promise<boolean> {
  if (spotId === 'championship') return false;
  const client = resolveClient(opts);
  if (!client) return false;
  const record: IdleQueueState = {
    spotId,
    startedAtMs: nowMs,
    lastProcessedAtMs: nowMs,
    accumulatedSummary: null,
    updatedAtMs: nowMs,
  };
  try {
    await client.set(idleQueueKey(uid, opts?.env), JSON.stringify(record), 'EX', IDLE_QUEUE_TTL_SEC);
    return true;
  } catch (err) {
    warnRedisOnce('idle-queue-start', err);
    return false;
  }
}

/** 방치 큐의 마지막 처리 시각과 누적 요약을 갱신한다 */
export async function advanceIdleQueue(
  uid: string,
  next: IdleQueueState,
  opts?: IdleQueueOptions,
): Promise<boolean> {
  if (next.spotId === 'championship') return false;
  const client = resolveClient(opts);
  if (!client) return false;
  try {
    await client.set(idleQueueKey(uid, opts?.env), JSON.stringify(next), 'EX', IDLE_QUEUE_TTL_SEC);
    return true;
  } catch (err) {
    warnRedisOnce('idle-queue-advance', err);
    return false;
  }
}

/** 활성 방치 상태가 있으면 마지막 처리 시각만 전진시킨다(실시간 catch와 중복 정산 방지) */
export async function touchIdleQueueCatch(
  uid: string,
  spotId: SpotId,
  catchAtMs: number,
  opts?: IdleQueueOptions,
): Promise<void> {
  if (spotId === 'championship') return;
  const current = await readIdleQueue(uid, opts);
  if (!current || current.spotId !== spotId) return;
  if (catchAtMs <= current.lastProcessedAtMs) return;
  await advanceIdleQueue(uid, {
    ...current,
    lastProcessedAtMs: catchAtMs,
    updatedAtMs: catchAtMs,
  }, opts);
}

/** 이동·거점 진입·줄 거두기·종료 시 활성 방치 상태를 해제한다 */
export async function clearIdleQueue(uid: string, opts?: IdleQueueOptions): Promise<boolean> {
  const client = resolveClient(opts);
  if (!client) return false;
  try {
    await client.del(idleQueueKey(uid, opts?.env));
    return true;
  } catch (err) {
    warnRedisOnce('idle-queue-clear', err);
    return false;
  }
}
