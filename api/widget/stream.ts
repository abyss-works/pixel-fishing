// GET /api/widget/stream 엔드포인트 — 데스크톱 위젯 실시간 SSE 구독 및 초기 summary_sync 전송.
import type { IncomingMessage } from 'node:http';
import { loadWidgetSummary } from '../_data/widget.js';
import { database } from '../_db/client.js';
import { isUserOnline, presenceOf } from '../_server/livePresence.js';
import { widgetHub } from '../_server/widgetHub.js';
import { toApiError } from '../errors.js';
import { reportServerIssue } from '../observability.js';
import { authenticateWidgetRequest, rejectIfWidgetApiDisabled } from './guard.js';
import type { WidgetRes } from './guard.js';

/** GET /api/widget/stream 핸들러 */
export async function widgetStreamHandler(req: IncomingMessage, res: WidgetRes): Promise<void> {
  try {
    if (rejectIfWidgetApiDisabled(res)) return;
    if (req.method !== 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      res.status(405).json({ error: 'method-not-allowed' });
      return;
    }
    if (!process.env.DATABASE_URL) {
      res.setHeader('Cache-Control', 'no-store');
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
    if (req.destroyed || res.writableEnded || res.destroyed) return;

    const hub = widgetHub();
    const client = hub.addClient(auth.uid, res);
    hub.sendSummarySync(client, summary);
  } catch (e) {
    const err = toApiError(e);
    if (err.status >= 500) await reportServerIssue(err.code, err.cause ?? err, err.context);
    if (!res.headersSent && !res.writableEnded && !res.destroyed) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(err.status).json({ error: err.code });
    }
  }
}

export default widgetStreamHandler;
