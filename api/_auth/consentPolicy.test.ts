// 약관과 처리방침의 현재 판과 시행일 — 설정에서 읽고, 확인이 필요한 계정을 판정한다.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { consentInEffect, consentPolicy, consentRequired, parseConsentPolicy } from './consentPolicy.js';

describe('parseConsentPolicy', () => {
  it('판은 시행일 문자열이고 시행 시각은 그 날짜의 UTC 0시다', () => {
    const policy = parseConsentPolicy('2026-12-01');
    expect(policy.version).toBe('2026-12-01');
    expect(policy.effectiveAt.toISOString()).toBe('2026-12-01T00:00:00.000Z');
  });

  it.each([undefined, '', '  ', '2026-12', '2026-13-01', '2026-02-30', '12/01/2026', '2026-12-01T00:00:00Z', ' 2026-12-01'])(
    '날짜 형식이 아닌 값 %j는 실패한다', raw => {
      expect(() => parseConsentPolicy(raw)).toThrowError(expect.objectContaining({ status: 500, code: 'server-config' }));
    });
});

describe('consentPolicy', () => {
  let saved: string | undefined;
  beforeEach(() => { saved = process.env.CONSENT_EFFECTIVE_DATE; });
  afterEach(() => {
    if (saved === undefined) delete process.env.CONSENT_EFFECTIVE_DATE;
    else process.env.CONSENT_EFFECTIVE_DATE = saved;
  });

  it('설정이 없으면 기본값 없이 server-config로 실패한다', () => {
    delete process.env.CONSENT_EFFECTIVE_DATE;
    expect(() => consentPolicy()).toThrowError(expect.objectContaining({ status: 500, code: 'server-config' }));
  });

  it('설정 값을 호출할 때마다 읽는다', () => {
    process.env.CONSENT_EFFECTIVE_DATE = '2027-01-15';
    expect(consentPolicy().version).toBe('2027-01-15');
    process.env.CONSENT_EFFECTIVE_DATE = '2027-02-01';
    expect(consentPolicy().version).toBe('2027-02-01');
  });
});

describe('consentRequired', () => {
  const policy = parseConsentPolicy('2026-12-01');
  const day = (iso: string) => new Date(iso);

  it('시행일 전에는 기록이 없어도 확인이 필요하지 않다', () => {
    expect(consentRequired(policy, day('2026-11-30T23:59:59.999Z'), { guest: false, accepted: false })).toBe(false);
  });

  it('시행일 당일 UTC 0시부터 확인이 필요하다', () => {
    expect(consentRequired(policy, day('2026-12-01T00:00:00.000Z'), { guest: false, accepted: false })).toBe(true);
    expect(consentRequired(policy, day('2026-12-01T00:00:00.001Z'), { guest: false, accepted: false })).toBe(true);
  });

  it('시행일이 지나도 현재 판을 수락했으면 필요하지 않다', () => {
    expect(consentRequired(policy, day('2026-12-05T00:00:00Z'), { guest: false, accepted: true })).toBe(false);
  });

  it('게스트는 시행일이 지나도 필요하지 않다', () => {
    expect(consentRequired(policy, day('2026-12-05T00:00:00Z'), { guest: true, accepted: false })).toBe(false);
  });
});

describe('consentInEffect', () => {
  const policy = parseConsentPolicy('2026-12-01');
  it('시행일 UTC 0시 직전까지는 시행 전이고 0시부터 시행 중이다', () => {
    expect(consentInEffect(policy, new Date('2026-11-30T23:59:59.999Z'))).toBe(false);
    expect(consentInEffect(policy, new Date('2026-12-01T00:00:00.000Z'))).toBe(true);
  });
});
