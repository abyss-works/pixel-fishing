// Vercel Cron — 콜드 아카이브 (매일 1회). 계약: mgmt/spec/cold-archive.md 3절.
// 인증: Vercel이 CRON_SECRET을 Authorization: Bearer로 자동 첨부한다 — 불일치·부재는 401.
// ⚠️ Node (req,res) 시그니처 — Web 표준 시그니처로 배포하면 전부 500 (api/action.ts 머리말 사고).
import type { IncomingMessage, ServerResponse } from 'node:http';
import { runArchive } from '../cold-archive.js';
import { reportServerIssue } from '../observability.js';

type Req = IncomingMessage;
type Res = ServerResponse & { status: (code: number) => Res; json: (b: unknown) => void };

function reqEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`missing env: ${key}`);
  return v;
}

export default async function handler(req: Req, res: Res): Promise<void> {
  if (req.method !== 'GET') { res.status(405).json({ error: 'method-not-allowed' }); return; }
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'unauthorized' }); return;
  }
  try {
    const summary = await runArchive({
      supabaseUrl: reqEnv('VITE_SUPABASE_URL'),
      supabaseKey: reqEnv('SUPABASE_SERVICE_ROLE_KEY'),
      r2AccountId: reqEnv('R2_ACCOUNT_ID'),
      r2Bucket: reqEnv('R2_BUCKET'),
      r2AccessKeyId: reqEnv('R2_ACCESS_KEY_ID'),
      r2SecretAccessKey: reqEnv('R2_SECRET_ACCESS_KEY'),
      r2Prefix: process.env.R2_PREFIX ?? 'pixel-fishing/cold',
      cutoffDays: Math.max(1, parseInt(process.env.ARCHIVE_CUTOFF_DAYS ?? '7', 10)),
      tmpDir: process.env.ARCHIVE_TMP_DIR ?? '/tmp',
    });
    res.status(200).json(summary);
  } catch (e) {
    await reportServerIssue('cold-archive', e);   // 재시도가 없어 Sentry가 유일 알림 (스펙 3절)
    res.status(500).json({ error: 'archive-failed' });
  }
}
