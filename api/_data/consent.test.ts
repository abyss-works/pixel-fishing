// 약관 수락 판정 단위 테스트 — 프로세스 메모리 캐시 없이 매 호출마다 DB를 조회하는지 검증한다.
import { describe, expect, it, vi } from 'vitest';
import type { ConsentPolicy } from '../_auth/consentPolicy.js';
import type { Executor } from '../_db/client.js';
import { consentRequiredFor, consentStatus } from './consent.js';

const POLICY: ConsentPolicy = {
  version: '2026-11-01',
  effectiveAt: new Date('2026-11-01T00:00:00.000Z'),
};
const AFTER_EFFECTIVE = new Date('2026-11-02T00:00:00.000Z');
const BEFORE_EFFECTIVE = new Date('2026-10-31T00:00:00.000Z');

describe('consentRequiredFor', () => {
  it('게스트와 시행일 이전에는 DB를 조회하지 않고 false를 반환한다', async () => {
    const execute = vi.fn();
    const db = { execute } as unknown as Executor;

    expect(await consentRequiredFor(db, { uid: 'u1', guest: true }, POLICY, AFTER_EFFECTIVE)).toBe(false);
    expect(await consentRequiredFor(db, { uid: 'u1', guest: false }, POLICY, BEFORE_EFFECTIVE)).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  it('정식 계정은 이전 호출 결과를 캐시하지 않고 매번 DB를 조회한다', async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({ rows: [{ n: 1 }] })
      .mockResolvedValueOnce({ rows: [{ n: 0 }] });
    const db = { execute } as unknown as Executor;

    expect(await consentRequiredFor(db, { uid: 'u-cache-check', guest: false }, POLICY, AFTER_EFFECTIVE)).toBe(false);
    expect(await consentRequiredFor(db, { uid: 'u-cache-check', guest: false }, POLICY, AFTER_EFFECTIVE)).toBe(true);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('consentStatus는 계정의 약관 필요 여부와 정책 메타를 반환한다', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ n: 0 }] });
    const db = { execute } as unknown as Executor;

    const status = await consentStatus(
      db,
      { id: 'u2', email: 'u2@example.test' } as Parameters<typeof consentStatus>[1],
      POLICY,
      AFTER_EFFECTIVE,
    );
    expect(status).toEqual({
      required: true,
      version: '2026-11-01',
      effectiveAt: '2026-11-01T00:00:00.000Z',
    });
  });
});
