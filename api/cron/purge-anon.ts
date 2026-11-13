// 예약 작업: 미접속 익명 계정(진행이 없는 계정 7일, 진행이 있어도 1년)을 매일 한 번 정리한다. 같은 실행에서 보관 기간이 지난 채팅과 채팅 신고도 지운다.
// 계정 정리의 기본은 dry-run이다. 대상을 세어 요약만 돌려주고, PURGE_ANON_ENABLED가 정확히 1일 때만 지운다.
// 채팅 보관 기간 정리는 보관 정책이라 dry-run 설정과 무관하게 항상 지운다.
// 인증: 예약 실행기가 CRON_SECRET을 Authorization: Bearer로 첨부한다. 불일치와 부재는 401.
// 주의: Node (req,res) 시그니처를 사용한다. Web 표준 시그니처로 배포하면 요청이 모두 500으로 실패한다.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { purgeAccount, selectPurgeTargets } from '../_data/account.js';
import { deleteExpiredChat } from '../_data/chat.js';
import { database } from '../_db/client.js';
import type { Database } from '../_db/client.js';
import { reportServerIssue } from '../observability.js';
import { inStage, logCronFailure } from '../cronFailure.js';

type Req = IncomingMessage;
type Res = ServerResponse & { status: (code: number) => Res; json: (b: unknown) => void };

/** 한 번의 실행이 다루는 계정 수 상한. 넘는 대상은 다음 실행이 이어서 지운다 */
const BATCH_LIMIT = 500;
/** 응답에 싣는 대상 id 개수. 앞 8자리만 싣는다 */
const SAMPLE_SIZE = 5;

interface PurgeSummary {
  dryRun: boolean;
  /** 진행이 없는 계정은 마지막 접속이 이 시각보다 이르면 대상이다 */
  cutoff: string;
  /** 진행과 관계없이 마지막 접속이 이 시각보다 이르면 대상이다 */
  staleCutoff: string;
  /** 조건에 맞는 계정 전체 수 */
  targets: number;
  /** targets 가운데 staleCutoff 규칙에 해당하는 수 */
  staleTargets: number;
  /** 이번 실행이 다루는 계정 수. 상한이 적용되며, dry-run이면 삭제를 켰을 때 다룰 수다 */
  batch: number;
  deleted: number;
  /** 선정 뒤 조건에서 벗어나 지우지 않은 계정 수 */
  skipped: number;
  failed: number;
  /** 대상 id의 앞 8자리 */
  sample: string[];
  /** 보관 기간이 지나 지운 채팅 메시지와 신고 기록 수 */
  chat: { messages: number; reports: number };
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
  const chat = await inStage('expire-chat', () => deleteExpiredChat(db, now.toISOString()));
  const found = await inStage('select-targets', () => selectPurgeTargets(db, now, BATCH_LIMIT));
  const summary: PurgeSummary = {
    dryRun: !enabled, cutoff: found.cutoffs.idle, staleCutoff: found.cutoffs.stale, targets: found.total, staleTargets: found.stale,
    batch: found.ids.length,
    deleted: 0, skipped: 0, failed: 0, sample: found.ids.slice(0, SAMPLE_SIZE).map(id => id.slice(0, 8)), chat,
  };
  let firstFailure: PurgeFailure | undefined;
  if (enabled) {
    for (const uid of found.ids) {
      try {
        if (await purgeAccount(withTransaction, uid, now)) summary.deleted += 1;
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
      logCronFailure('purge-anon', firstFailure.error, 'purge-account', { failedId: firstFailure.id, failed: summary.failed, deleted: summary.deleted });
      // 재시도가 없어 Sentry가 유일 알림이다. 실패 계정이 여럿이어도 첫 실패 하나만 보고한다
      await reportServerIssue('anon-purge', firstFailure.error, { ...summary, failedId: firstFailure.id });
      res.status(500).json({ error: 'anon-purge-failed', ...summary });
      return;
    }
    res.status(200).json(summary);
  } catch (e) {
    logCronFailure('purge-anon', e, 'setup');
    await reportServerIssue('anon-purge', e);
    res.status(500).json({ error: 'anon-purge-failed' });
  }
}
