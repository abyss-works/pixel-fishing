// 감사 이벤트 포획 조회 단일화 정적 가드 — 운영·무결성 데이터 모듈에서
// 원시 `type = 'catch'` 하드코딩으로 이벤트 포획(구형 eventCatch 포함)이 누락되는 재발을 차단한다.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DATA_DIR = import.meta.dirname;
const MONITORED_FILES = [
  'activity.ts',
  'admin.ts',
  'adminBalance.ts',
  'adminFunnel.ts',
  'integrity.ts',
  'widget.ts',
];

const RAW_CATCH_TYPE_SQL = /\b(?:e\.)?type\s*=\s*'catch'/;

describe('감사 이벤트 포획 조회 단일화 가드', () => {
  it('운영·무결성·위젯 SQL 모듈은 원시 type = \'catch\' 대신 isCatchEventSql을 사용한다', () => {
    const violations: string[] = [];
    for (const file of MONITORED_FILES) {
      const src = readFileSync(join(DATA_DIR, file), 'utf8');
      if (RAW_CATCH_TYPE_SQL.test(src)) violations.push(file);
    }
    expect(violations).toEqual([]);
  });

  it('관리자 지역명 미러(REGION_NAMES)에 championship 표시명이 등록되어 있다', () => {
    const regionsSrc = readFileSync(join(DATA_DIR, '../../src/features/admin/model/regions.ts'), 'utf8');
    expect(regionsSrc).toMatch(/\bchampionship:\s*'[^']+'/);
  });
});
