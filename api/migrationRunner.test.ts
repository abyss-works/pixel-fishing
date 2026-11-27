import { describe, expect, it } from 'vitest';
import {
  filterMigrationFileNames,
  ledgerStateAction,
  planMigrationFiles,
  resolveMigrationRole,
  usesMigrationRole,
} from './_server/migrationRunner.js';

describe('마이그레이션 파일 목록', () => {
  it('번호 up 파일만 번호 순서로 남기고 down 파일과 다른 파일은 뺀다', () => {
    expect(filterMigrationFileNames([
      '0002_second.sql',
      'not-a-migration.sql',
      '0001_first.down.sql',
      '0001_first.sql',
      '0010_later.sql',
      '0003_extra.down.sql',
      'README.md',
    ])).toEqual(['0001_first.sql', '0002_second.sql', '0010_later.sql']);
  });

  it('번호가 네 자리가 아니거나 이름 규칙이 다르면 뺀다', () => {
    expect(filterMigrationFileNames([
      '001_a.sql',
      '00001_a.sql',
      '0001.sql',
      '0001_a.SQL',
      '0001_a.sql',
    ])).toEqual(['0001_a.sql']);
  });
});

describe('적용 계획', () => {
  it('ledger에 기록된 파일은 건너뛰고 누락 파일만 순서대로 남긴다', () => {
    expect(planMigrationFiles(
      ['0001_a.sql', '0002_b.sql', '0003_c.sql', '0004_d.sql'],
      new Set(['0001_a.sql', '0003_c.sql']),
    )).toEqual(['0002_b.sql', '0004_d.sql']);
  });

  it('ledger에만 있는 이름은 적용 계획에 영향을 주지 않는다', () => {
    expect(planMigrationFiles(['0002_b.sql'], new Set(['0001_a.sql', '0002_b.sql', '9999_gone.sql']))).toEqual([]);
  });
});

describe('ledger 상태 판정', () => {
  it('ledger가 있으면 그대로 쓴다', () => {
    expect(ledgerStateAction(true, true)).toBe('use-existing-ledger');
    expect(ledgerStateAction(true, false)).toBe('use-existing-ledger');
  });

  it('ledger가 없고 기존 앱 표가 있으면 중단한다', () => {
    expect(ledgerStateAction(false, true)).toBe('abort-existing-database');
  });

  it('ledger와 기존 앱 표가 모두 없으면 빈 데이터베이스로 보고 ledger를 만든다', () => {
    expect(ledgerStateAction(false, false)).toBe('create-ledger');
  });
});

describe('마이그레이션 역할 결정', () => {
  it('인자가 환경 변수보다 우선하고 환경 변수가 기본값보다 우선한다', () => {
    expect(resolveMigrationRole('migration_owner', 'env_role')).toBe('migration_owner');
    expect(resolveMigrationRole(undefined, 'env_role')).toBe('env_role');
    expect(resolveMigrationRole()).toBe('app');
  });

  it('빈 역할 이름은 명확한 오류로 거부한다', () => {
    expect(() => resolveMigrationRole('')).toThrow(/역할 이름/);
  });
});

describe('역할 전환 예외', () => {
  it('엔진 설정 마이그레이션만 역할 전환 없이 실행한다', () => {
    expect(usesMigrationRole('0011_pgrst_max_rows.sql')).toBe(false);
    expect(usesMigrationRole('0012_letters.sql')).toBe(true);
  });
});
