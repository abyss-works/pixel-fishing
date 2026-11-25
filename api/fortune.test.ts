// 일일 운세 이력 핸들러 단위 테스트 — 월 파싱·범위 계산과 HTTP 메서드·입력·설정 가드를 검증한다.
import { afterEach, describe, expect, it } from 'vitest';
import handler, { fortuneMonthRange, parseFortuneMonth } from './fortune.js';

function mkRes() {
  const r = {
    statusCode: 0,
    body: null as unknown,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) { r.headers[name] = value; },
    status(code: number) { r.statusCode = code; return r; },
    json(b: unknown) { r.body = b; },
  };
  return r;
}

describe('parseFortuneMonth / fortuneMonthRange', () => {
  it('month 미지정 시 currentDay의 YYYY-MM을 사용하고, 유효한 월만 통과시킨다', () => {
    expect(parseFortuneMonth(undefined, '2030-03-06')).toBe('2030-03');
    expect(parseFortuneMonth('2030-01', '2030-03-06')).toBe('2030-01');
    expect(parseFortuneMonth('2030-12', '2030-03-06')).toBe('2030-12');

    for (const bad of ['', '2030-00', '2030-13', '2030-3', '203003', '0000-01', '2030-ab', ['2030-03']]) {
      expect(parseFortuneMonth(bad, '2030-03-06')).toBeNull();
    }
  });

  it('해당 월 시작일과 다음 달 시작일(연도 경계 포함)을 계산한다', () => {
    expect(fortuneMonthRange('2030-03')).toEqual({ fromDay: '2030-03-01', toDay: '2030-04-01' });
    expect(fortuneMonthRange('2030-12')).toEqual({ fromDay: '2030-12-01', toDay: '2031-01-01' });
  });
});

describe('api/fortune 핸들러 규약', () => {
  const prevUrl = process.env.DATABASE_URL;
  afterEach(() => {
    if (prevUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevUrl;
  });

  it('GET 외 메서드는 405를 반환한다', async () => {
    const res = mkRes();
    await handler({ method: 'POST', headers: {} } as never, res as never);
    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ error: 'method-not-allowed' });
    expect(res.headers['Cache-Control']).toBe('private, no-store');
  });

  it('잘못된 month 쿼리는 400 bad-month를 반환한다', async () => {
    for (const month of ['', '2030-00', '2030-13', '2030-3', 'bad']) {
      const res = mkRes();
      await handler({ method: 'GET', query: { month }, headers: {} } as never, res as never);
      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: 'bad-month' });
    }
  });

  it('DATABASE_URL이 없으면 500 server-config를 반환한다', async () => {
    delete process.env.DATABASE_URL;
    const res = mkRes();
    await handler({ method: 'GET', headers: {} } as never, res as never);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'server-config' });
  });
});
