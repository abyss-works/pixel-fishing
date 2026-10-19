// 서버 데이터 계층 경계 검사 — 표마다 쓰기를 맡는 저장 모듈은 하나이고, SQL과 드라이버는 저장 모듈과 DB 모듈에만 둔다.
// transaction 모드 풀러와 맞지 않는 사용(prepared statement, 세션 잠금)과 PostgREST 경유 DB 접근도 막는다.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const API = join(import.meta.dirname, '..');

/** 쓰기 소유 — 저장 모듈 파일 → 그 모듈만 쓰는 표 */
const WRITE_OWNERS: Record<string, readonly string[]> = {
  '_data/save.ts': ['saves_current', 'fish_instances', 'records', 'saves'],
  '_data/profile.ts': ['profiles'],
  '_data/bounty.ts': ['bounty_accepts', 'bounty_clears', 'bounty_progress', 'bounty_tickets', 'bounty_licenses'],
  '_data/codes.ts': ['coupons', 'reliefs'],
  '_data/mail.ts': ['letters'],
  '_data/telemetry.ts': ['events'],
};

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '_dbTest' || name === '__snapshots__' ? [] : sources(path);
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

const files = sources(API).map(path => ({ path: relative(API, path).replaceAll('\\', '/'), src: readFileSync(path, 'utf8') }));
const WRITE = /\b(?:insert\s+into|update|delete\s+from)\s+public\.([a-z_]+)/gi;
const AUTH_WRITE = /\b(?:insert\s+into|update|delete\s+from)\s+auth\.([a-z_]+)/gi;
/** 인증 스키마(auth)를 쓰는 SQL을 가진 유일한 모듈 */
const AUTH_OWNER = '_data/account.ts';

describe('서버 데이터 계층 경계', () => {
  it('표를 쓰는 SQL은 그 표의 소유 저장 모듈에만 있다', () => {
    const violations = files.flatMap(({ path, src }) =>
      [...src.matchAll(WRITE)].map(m => m[1]).filter(table => !(WRITE_OWNERS[path] ?? []).includes(table))
        .map(table => `${path} -> ${table}`));
    expect(violations).toEqual([]);
  });

  it('인증 스키마(auth)를 쓰는 SQL은 계정 정리 모듈에만 있다', () => {
    const violations = files.filter(({ path }) => path !== AUTH_OWNER)
      .flatMap(({ path, src }) => [...src.matchAll(AUTH_WRITE)].map(m => `${path} -> ${m[1]}`));
    expect(violations).toEqual([]);
  });

  it('drizzle-orm 값과 pg 드라이버는 저장 모듈과 DB 모듈만 가져온다', () => {
    const violations = files
      .filter(({ path }) => !path.startsWith('_data/') && !path.startsWith('_db/'))
      .filter(({ src }) => /^import\s+(?!type\b)[^;]*from\s+'(?:drizzle-orm[^']*|pg)'/m.test(src))
      .map(({ path }) => path);
    expect(violations).toEqual([]);
  });

  it('transaction 모드 풀러와 맞지 않는 prepared statement와 세션 잠금을 쓰지 않는다', () => {
    const violations = files.filter(({ src }) => /\.prepare\(|pg_advisory_lock\(|pg_try_advisory_lock\(/.test(src))
      .map(({ path }) => path);
    expect(violations).toEqual([]);
  });

  it('서버 코드는 supabase-js로 표를 읽고 쓰지 않는다(인증 서버 조회만 쓴다)', () => {
    const violations = files.filter(({ src }) => /\.from\(\s*'[a-z_]+'\s*\)|\.rpc\(/.test(src)).map(({ path }) => path);
    expect(violations).toEqual([]);
  });
});
