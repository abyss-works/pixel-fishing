import { describe, expect, it } from 'vitest';
import { AppError } from './errors';
import { isUnauthorizedFailure, queryRetryDelayMs, shouldRetryQuery } from './retryPolicy';

const admin = (status: number, extra: Record<string, unknown> = {}) => Object.assign(new Error('x'), { status, ...extra });
const app = (kind: ConstructorParameters<typeof AppError>[0], context: Record<string, unknown> = {}) =>
  new AppError(kind, 'x', context);

describe('shouldRetryQuery', () => {
  it('4xx(429 제외)는 두 오류 모양 모두 재시도하지 않는다', () => {
    expect(shouldRetryQuery(0, admin(401))).toBe(false);
    expect(shouldRetryQuery(0, admin(404))).toBe(false);
    expect(shouldRetryQuery(0, app('network', { status: 403 }))).toBe(false);
    expect(shouldRetryQuery(0, app('unauthorized'))).toBe(false);
  });

  it('429는 이미 재시도된 것만 막고 두 오류 모양 모두 제한 횟수까지 재시도한다', () => {
    expect(shouldRetryQuery(0, admin(429))).toBe(true);
    expect(shouldRetryQuery(0, admin(429, { retried: true }))).toBe(false);
    expect(shouldRetryQuery(1, app('rate-limited', { status: 429 }))).toBe(true);
    expect(shouldRetryQuery(0, app('rate-limited', { status: 429, retried: true }))).toBe(false);
    expect(shouldRetryQuery(2, app('rate-limited', { status: 429 }))).toBe(false);
  });

  it('5xx와 상태 없는 순단은 제한 횟수까지만 재시도한다', () => {
    expect(shouldRetryQuery(0, admin(503))).toBe(true);
    expect(shouldRetryQuery(0, app('network', { status: 502 }))).toBe(true);
    expect(shouldRetryQuery(0, app('network'))).toBe(true);
    expect(shouldRetryQuery(0, new TypeError('Failed to fetch'))).toBe(true);
    expect(shouldRetryQuery(2, admin(503))).toBe(false);
  });

  it('알 수 없는 오류와 null은 재시도하지 않는다', () => {
    expect(shouldRetryQuery(0, new Error('boom'))).toBe(false);
    expect(shouldRetryQuery(0, null)).toBe(false);
    expect(shouldRetryQuery(0, app('bug'))).toBe(false);
  });
});

describe('isUnauthorizedFailure', () => {
  it('401과 unauthorized 종류만 참이다', () => {
    expect(isUnauthorizedFailure(admin(401))).toBe(true);
    expect(isUnauthorizedFailure(app('unauthorized'))).toBe(true);
    expect(isUnauthorizedFailure(app('network', { status: 401 }))).toBe(true);
    expect(isUnauthorizedFailure(app('network', { status: 500 }))).toBe(false);
    expect(isUnauthorizedFailure(null)).toBe(false);
  });
});

describe('queryRetryDelayMs', () => {
  it('Retry-After를 두 오류 모양에서 읽는다', () => {
    expect(queryRetryDelayMs(0, admin(429, { retryAfterMs: 3000 }))).toBe(3000);
    expect(queryRetryDelayMs(0, app('rate-limited', { status: 429, retryAfterMs: 1500 }))).toBe(1500);
  });

  it('없거나 잘못된 값이면 지수 백오프(상한 4초)다', () => {
    expect(queryRetryDelayMs(0, admin(503))).toBe(500);
    expect(queryRetryDelayMs(2, admin(503, { retryAfterMs: -1 }))).toBe(2000);
    expect(queryRetryDelayMs(5, null)).toBe(4000);
  });
});
