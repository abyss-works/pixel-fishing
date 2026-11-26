// GET /api/widget/summary 엔드포인트 — 데스크톱 위젯 초기·폴백 요약 상태 조회.
import type { IncomingMessage } from 'node:http';
import { loadWidgetSummary } from '../_data/widget.js';
import { database } from '../_db/client.js';
import { isUserOnline, presenceOf } from '../_server/livePresence.js';
import { toApiError } from '../errors.js';
import { reportServerIssue } from '../observability.js';
import { authenticateWidgetRequest, rejectIfWidgetApiDisabled } from './guard.js';
import type { WidgetRes } from './guard.js';

/** GET /api/widget/summary 핸들러 */
export async function widgetSummaryHandler(req: IncomingMessage, res: WidgetRes): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (rejectIfWidgetApiDisabled(res)) return;
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'method-not-allowed' });
      return;
    }
    if (!process.env.DATABASE_URL) {
      res.status(500).json({ error: 'server-config' });
      return;
    }

    const { db } = database();
    const auth = await authenticateWidgetRequest(req, res, db);
    if (!auth) return;

    const summary = await loadWidgetSummary(db, auth.uid, {
      isOnline: isUserOnline(auth.uid),
      presenceRegion: presenceOf(auth.uid)?.region ?? null,
    });
    res.status(200).json(summary);
  } catch (e) {
    const err = toApiError(e);
    if (err.status >= 500) await reportServerIssue(err.code, err.cause ?? err, err.context);
    if (!res.writableEnded && !res.destroyed) {
      res.status(err.status).json({ error: err.code });
    }
  }
}

export default widgetSummaryHandler;
