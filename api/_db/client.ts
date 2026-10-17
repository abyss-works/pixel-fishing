// 서버 함수의 Postgres 연결. Supabase의 transaction 모드 풀러(Supavisor)를 거친다.
// 풀러는 prepared statement와 연결 단위 세션 상태를 유지하지 않으므로 .prepare()와 트랜잭션 밖 SET을 쓰지 않는다.
import { attachDatabasePool } from '@vercel/functions';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { PoolConfig } from 'pg';
import { describeDbError } from './errors.js';

/** 저장 모듈 함수가 받는 실행 객체. 풀 기반 db와 트랜잭션 연결 모두 이 타입이다. */
export type Executor = NodePgDatabase;

export interface Database {
  db: Executor;
  pool: pg.Pool;
  /** 연결 하나에서 BEGIN·COMMIT·ROLLBACK을 수행하고 어떤 실패에서도 연결을 풀에 반환한다. */
  withTransaction<T>(work: (tx: Executor) => Promise<T>): Promise<T>;
}

export function createDatabase(config: PoolConfig): Database {
  const pool = new pg.Pool(config);
  // 유휴 연결의 오류는 풀이 연결을 폐기한다. 프로세스 종료를 막고 정제된 요약만 남긴다.
  pool.on('error', error => {
    console.warn('Database pool client error', describeDbError(error));
  });

  async function withTransaction<T>(work: (tx: Executor) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('begin');
    } catch (error) {
      // 상태를 알 수 없는 연결은 재사용하지 않고 폐기한다.
      client.release(error instanceof Error ? error : true);
      throw error;
    }
    try {
      const result = await work(drizzle({ client }));
      // 작업이 오류를 삼켜 트랜잭션이 중단된 상태면 COMMIT은 ROLLBACK으로 끝난다. 이를 성공으로 반환하지 않는다.
      const committed = await client.query('commit');
      if (committed.command === 'ROLLBACK') throw new Error('Transaction was rolled back instead of committed');
      client.release();
      return result;
    } catch (error) {
      try {
        await client.query('rollback');
        client.release();
      } catch (rollbackError) {
        client.release(rollbackError instanceof Error ? rollbackError : true);
      }
      throw error;
    }
  }

  return { db: drizzle({ client: pool }), pool, withTransaction };
}

let appDatabase: Database | null = null;

/** 배포 함수가 쓰는 데이터베이스. 인스턴스마다 한 번 만들고, DATABASE_URL이 없으면 실패한다. */
export function database(): Database {
  if (appDatabase) return appDatabase;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  appDatabase = createDatabase({
    connectionString,
    // 한 인스턴스가 여러 요청을 동시에 처리하므로 작게 시작한다(hamsudoku 운영 기준값).
    max: 3,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 5000,
  });
  // 함수 인스턴스가 일시 중지되기 전에 유휴 연결을 정리하도록 풀을 등록한다. Vercel 밖에서는 동작하지 않는다.
  attachDatabasePool(appDatabase.pool);
  return appDatabase;
}
