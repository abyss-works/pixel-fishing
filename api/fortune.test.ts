// 일일 운세 이력 핸들러 단위 테스트 — 주간 경계 계산과 HTTP 메서드/설정 가드를 검증한다.
import { afterEach, describe, expect, it } from 'vitest';
import handler, { fortuneSinceDay } from './fortune.js';

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

describe('fortuneSinceDay', () => {
  it('이번 주 월요일에서 7일 전인 지난주 월요일을 돌려준다', () => {
    expect(fortuneSinceDay('2030-03-04')).toBe('2030-02-25'); // 월요일
    expect(fortuneSinceDay('2030-03-06')).toBe('2030-02-25'); // 수요일
    expect(fortuneSinceDay('2030-03-10')).toBe('2030-02-25'); // 일요일
    expect(fortuneSinceDay('2031-01-01')).toBe('2030-12-23'); // 연도 경계(수요일)
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

  it('DATABASE_URL이 없으면 500 server-config를 반환한다', async () => {
    delete process.env.DATABASE_URL;
    const res = mkRes();
    await handler({ method: 'GET', headers: {} } as never, res as never);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'server-config' });
  });
});
