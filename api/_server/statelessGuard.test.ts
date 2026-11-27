// 서버 무상태성(Stateless) 정적 가드 — 멀티 파드 환경에서 프로세스 메모리에 의존하는
// 모듈 수준 가변 Map/Set 캐시와 인메모리 속도 제한(createRateLimiter)의 신규 도입을 차단한다.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const API = join(import.meta.dirname, '..');

/**
 * 허용 예외 목록 — Wave 2 이관 대기 또는 병렬 브랜치 이관 중인 기존 파일만 명시한다.
 * 새 파일이나 이관 완료 파일(consent.ts, mailbox.ts 등)을 여기에 추가하지 않는다.
 */
const ALLOWLIST: Record<string, string> = {
  // 요청 내 비동기 작업 완료 대기 추적용(요청 간 캐시·상태 공유 없음, 종료 드레인 전용)
  '_server/afterResponse.ts': 'pending promise tracking for graceful drain',
  // 인메모리 레이트 리미터 구현체(Wave 2 Valkey 이관 대기)
  '_server/rateLimit.ts': 'in-memory rate limiter implementation pending Wave 2 migration',
  // Wave 1 병렬 브랜치에서 DB/Valkey 이관 진행 중
  'guildInvites.ts': 'createRateLimiter pending parallel Wave 1 migration',
  // 클라이언트 메트릭 비콘 속도 제한(Wave 2 Valkey 이관 대기)
  'clientMetrics.ts': 'createRateLimiter pending Wave 2 migration',
};

function collectApiSources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === '_dbTest' || name === '__snapshots__' ? [] : collectApiSources(full);
    }
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [full] : [];
  });
}

const MODULE_LEVEL_COLLECTION = /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*new\s+(?:Map|Set)\b/gm;
const UPPER_CASE_CONST = /^[A-Z][A-Z0-9_]*$/;
const RATE_LIMITER_USE = /\bcreateRateLimiter\b/;

interface Violation {
  path: string;
  reasons: string[];
}

function findViolations(files: { path: string; src: string }[]): Violation[] {
  const violations: Violation[] = [];
  for (const { path, src } of files) {
    const reasons: string[] = [];
    for (const match of src.matchAll(MODULE_LEVEL_COLLECTION)) {
      const varName = match[1];
      if (!UPPER_CASE_CONST.test(varName)) {
        reasons.push(`module-level mutable Map/Set (${varName})`);
      }
    }
    if (RATE_LIMITER_USE.test(src)) {
      reasons.push('createRateLimiter');
    }
    if (reasons.length > 0 && !(path in ALLOWLIST)) {
      violations.push({ path, reasons });
    }
  }
  return violations;
}

describe('서버 무상태성 정적 가드', () => {
  const files = collectApiSources(API).map(full => ({
    path: relative(API, full).replaceAll('\\', '/'),
    src: readFileSync(full, 'utf8'),
  }));

  it('허용 목록 밖 서버 모듈에 모듈 수준 가변 Map/Set 캐시와 createRateLimiter가 없다', () => {
    expect(findViolations(files)).toEqual([]);
  });

  it('이관 완료된 consent.ts와 mailbox.ts는 허용 목록에 없으며 허용 목록의 모든 경로가 실제 존재한다', () => {
    expect(ALLOWLIST).not.toHaveProperty('_data/consent.ts');
    expect(ALLOWLIST).not.toHaveProperty('_data/mailbox.ts');
    for (const rel of Object.keys(ALLOWLIST)) {
      expect(existsSync(join(API, rel))).toBe(true);
    }
  });
});
