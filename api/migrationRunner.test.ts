import { describe, expect, it } from 'vitest';
import {
  filterMigrationFileNames,
  buildMigrationConnectionString,
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

describe('마이그레이션 접속 주소', () => {
  it('명시 접속 주소가 있으면 그대로 쓴다', () => {
    expect(buildMigrationConnectionString({ MIGRATION_DATABASE_URL: 'postgresql://example/db' } as NodeJS.ProcessEnv))
      .toBe('postgresql://example/db');
  });

  it('분리 값으로 실제 앱 데이터베이스 주소를 만들고 사용자·비밀번호를 인코딩한다', () => {
    expect(buildMigrationConnectionString({
      MIGRATION_DB_HOST: 'db.example.test',
      MIGRATION_DB_PORT: '15432',
      MIGRATION_DB_USER: 'user@example',
      MIGRATION_DB_PASSWORD: 'p@ss/word',
      MIGRATION_DB_NAME: 'app',
    } as NodeJS.ProcessEnv)).toBe('postgresql://user%40example:p%40ss%2Fword@db.example.test:15432/app');
  });

  it('분리 값이 없으면 필요한 환경 변수를 알리는 오류를 낸다', () => {
    expect(() => buildMigrationConnectionString({} as NodeJS.ProcessEnv)).toThrow(/MIGRATION_DATABASE_URL/);
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
