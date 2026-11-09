import { describe, expect, it } from 'vitest';
import { abortReason, DEFAULT_LIMITS, exitCodeOf, nextRetryMs, parseSteps, parseTarget, PROD_HOST } from './plan';

describe('parseTarget', () => {
  it('origin만 돌려준다', () => {
    expect(parseTarget('https://pixel-fishing-preview.abyssworks.dev/')).toBe('https://pixel-fishing-preview.abyssworks.dev');
    expect(parseTarget('http://localhost:3000/x?y=1')).toBe('http://localhost:3000');
  });

  it.each([
    `https://${PROD_HOST}`,
    `https://${PROD_HOST}/`,
    `HTTPS://${PROD_HOST.toUpperCase()}`,
    `https://${PROD_HOST}.`,
    `https://${PROD_HOST}:443/path`,
  ])('운영 도메인 %s는 거부한다', (raw) => {
    expect(() => parseTarget(raw)).toThrow(/운영/);
  });

  it('운영 도메인은 감시용 옵션에서만 허용한다', () => {
    expect(parseTarget(`https://${PROD_HOST}`, { allowProd: true })).toBe(`https://${PROD_HOST}`);
  });

  it('http와 https가 아니거나 주소가 아니면 거부한다', () => {
    expect(() => parseTarget('ftp://example.com')).toThrow();
    expect(() => parseTarget('not a url')).toThrow();
    expect(() => parseTarget('')).toThrow();
  });
});

describe('parseSteps', () => {
  it('쉼표로 나눈 양의 정수 목록을 돌려준다', () => {
    expect(parseSteps('10,25, 50,100')).toEqual([10, 25, 50, 100]);
  });

  it.each(['', '0', '-5,10', '1.5', 'a,b', '10,,20'])('잘못된 값 "%s"는 거부한다', (raw) => {
    expect(() => parseSteps(raw)).toThrow();
  });

  it('줄어드는 단계는 거부한다', () => {
    expect(() => parseSteps('50,10')).toThrow(/증가/);
  });
});

describe('abortReason', () => {
  const ok = { actions: 100, errors: 0, probeMs: [100, 120, 130] };

  it('한도 안이면 계속한다', () => {
    expect(abortReason(ok, DEFAULT_LIMITS)).toBeNull();
  });

  it('오류율이 한도를 넘으면 오류율 초과다', () => {
    expect(abortReason({ ...ok, errors: 6 }, DEFAULT_LIMITS)).toBe('error-rate');
  });

  it('오류율이 한도와 같으면 계속한다', () => {
    expect(abortReason({ ...ok, errors: 5 }, DEFAULT_LIMITS)).toBeNull();
  });

  it('액션 수가 최소 표본보다 적으면 오류율을 판정하지 않는다', () => {
    expect(abortReason({ actions: 4, errors: 4, probeMs: [] }, DEFAULT_LIMITS)).toBeNull();
  });

  it('probe p95가 한도를 넘으면 probe 초과다', () => {
    expect(abortReason({ ...ok, probeMs: [100, 100, 2000] }, DEFAULT_LIMITS)).toBe('probe');
  });

  it('probe 표본이 최소보다 적으면 판정하지 않는다', () => {
    expect(abortReason({ ...ok, probeMs: [9000, 9000] }, DEFAULT_LIMITS)).toBeNull();
  });

  it('두 조건이 함께 넘으면 오류율을 먼저 알린다', () => {
    expect(abortReason({ actions: 100, errors: 50, probeMs: [9000, 9000, 9000] }, DEFAULT_LIMITS)).toBe('error-rate');
  });
});

describe('exitCodeOf', () => {
  it('완료만 0이다', () => {
    expect(exitCodeOf('completed')).toBe(0);
    for (const r of ['error-rate', 'probe', 'version-mismatch', 'interrupted'] as const) expect(exitCodeOf(r)).not.toBe(0);
  });
});

describe('nextRetryMs', () => {
  it('두 배씩 늘고 상한에서 멈춘다', () => {
    expect(nextRetryMs(1000)).toBe(2000);
    expect(nextRetryMs(20_000)).toBe(30_000);
    expect(nextRetryMs(30_000)).toBe(30_000);
  });
});
