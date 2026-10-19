// Vercel Cron: 빈 익명 계정을 매일 한 번 정리한다.
// 기본은 dry-run이다. 대상을 세어 요약만 돌려주고, PURGE_ANON_ENABLED가 정확히 1일 때만 지운다.
// 인증: Vercel이 CRON_SECRET을 Authorization: Bearer로 자동 첨부한다. 불일치와 부재는 401.
// 주의: Node (req,res) 시그니처를 사용한다. Web 표준 시그니처로 배포하면 요청이 모두 500으로 실패한다.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { purgeAccount, selectPurgeTargets } from '../_data/account.js';
import { database } from '../_db/client.js';
import type { Database } from '../_db/client.js';
import { reportServerIssue } from '../observability.js';

type Req = IncomingMessage;
type Res = ServerResponse & { status: (code: number) => Res; json: (b: unknown) => void };

/** 마지막 활동이 이 일수보다 오래된 계정만 대상이다 */
const IDLE_DAYS = 7;
/** 한 번의 실행이 다루는 계정 수 상한. 넘는 대상은 다음 실행이 이어서 지운다 */
const BATCH_LIMIT = 500;
/** 응답에 싣는 대상 id 개수. 앞 8자리만 싣는다 */
const SAMPLE_SIZE = 5;

interface PurgeSummary {
  dryRun: boolean;
  /** 마지막 활동이 이 시각보다 이른 계정이 대상이다 */
  cutoff: string;
  /** 조건에 맞는 계정 전체 수 */
  targets: number;
  /** 이번 실행이 다루는 계정 수. 상한이 적용되며, dry-run이면 삭제를 켰을 때 다룰 수다 */
  batch: number;
  deleted: number;
  /** 선정 뒤 조건에서 벗어나 지우지 않은 계정 수 */
  skipped: number;
  failed: number;
  /** 대상 id의 앞 8자리 */
  sample: string[];
}

function reqEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`missing env: ${key}`);
  return v;
}

/** 지우다 실패한 첫 계정. id는 앞 8자리다 */
interface PurgeFailure { id: string; error: unknown }

/** 대상을 고르고, enabled이면 계정마다 따로 지운다. 한 계정의 실패는 세고 나머지를 이어서 처리한다 */
async function runPurge(
  { db, withTransaction }: Pick<Database, 'db' | 'withTransaction'>, enabled: boolean, now: Date,
): Promise<{ summary: PurgeSummary; firstFailure?: PurgeFailure }> {
  const cutoff = new Date(now.getTime() - IDLE_DAYS * 86_400_000).toISOString();
  const found = await selectPurgeTargets(db, cutoff, BATCH_LIMIT);
  const summary: PurgeSummary = {
    dryRun: !enabled, cutoff, targets: found.total, batch: found.ids.length,
    deleted: 0, skipped: 0, failed: 0, sample: found.ids.slice(0, SAMPLE_SIZE).map(id => id.slice(0, 8)),
  };
  let firstFailure: PurgeFailure | undefined;
  if (enabled) {
    for (const uid of found.ids) {
      try {
        if (await purgeAccount(withTransaction, uid, cutoff)) summary.deleted += 1;
        else summary.skipped += 1;
      } catch (error) {
        summary.failed += 1;
        firstFailure ??= { id: uid.slice(0, 8), error };
      }
    }
  }
  return { summary, firstFailure };
}

export default async function handler(req: Req, res: Res): Promise<void> {
  if (req.method !== 'GET') { res.status(405).json({ error: 'method-not-allowed' }); return; }
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'unauthorized' }); return;
  }
  try {
    reqEnv('DATABASE_URL');
    const { summary, firstFailure } = await runPurge(database(), process.env.PURGE_ANON_ENABLED === '1', new Date());
    console.log('== anon purge ==', JSON.stringify(summary));
    if (firstFailure) {
      // 재시도가 없어 Sentry가 유일 알림이다. 실패 계정이 여럿이어도 첫 실패 하나만 보고한다
      await reportServerIssue('anon-purge', firstFailure.error, { ...summary, failedId: firstFailure.id });
      res.status(500).json({ error: 'anon-purge-failed', ...summary });
      return;
    }
    res.status(200).json(summary);
  } catch (e) {
    await reportServerIssue('anon-purge', e);
    res.status(500).json({ error: 'anon-purge-failed' });
  }
}
