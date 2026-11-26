// 데스크톱 위젯 API 공용 가드 — 환경 기능 플래그, 클라이언트 버전 검증(426), Bearer 인증·약관·제재 검사와 SSE 종료 훅을 맡는다.
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import {
  WIDGET_CLIENT_HEADER,
  WIDGET_CLIENT_VALUE,
  WIDGET_MIN_CLIENT_VERSION,
  WIDGET_VERSION_HEADER,
  isMinWidgetVersionSupported,
} from '../../src/game/rules/widget.js';
import { consentPolicy } from '../_auth/consentPolicy.js';
import { consentRequiredFor } from '../_data/consent.js';
import { findWidgetTokenWithUser, sha256Hex, touchWidgetToken } from '../_data/widget.js';
import type { WidgetTokenSaveState } from '../_data/widget.js';
import type { Executor } from '../_db/client.js';
import { reportServerIssue } from '../observability.js';

export type WidgetRes = ServerResponse & {
  status: (code: number) => WidgetRes;
  json: (body: unknown) => void;
};

export interface WidgetAuthContext {
  uid: string;
  tokenHash: string;
  clientVersion: string;
  spotId: string | null;
  saveState: WidgetTokenSaveState | null;
}

export interface AuthenticateWidgetOptions {
  minVersion?: string;
  now?: Date;
  touchLastSeen?: boolean;
}

const TOUCH_THROTTLE_MS = 5 * 60_000;

let widgetDisconnect: (uid: string) => void = () => {};

/** 위젯 SSE 허브 기동 시 사용자 단위 강제 종료 콜백을 등록한다 */
export function provideWidgetDisconnect(fn: (uid: string) => void): void {
  widgetDisconnect = fn;
}

/** 대상 사용자의 활성 위젯 SSE 연결을 즉시 종료한다. 허브 미등록 상태에서는 아무 일도 하지 않는다 */
export function disconnectWidgetUser(uid: string): void {
  widgetDisconnect(uid);
}

/** 운영 환경에서 WIDGET_API_ENABLED 플래그가 꺼져 있으면 위젯 API를 비활성화한다 */
export function isWidgetApiDisabled(): boolean {
  return process.env.DEPLOY_ENV === 'production' && process.env.WIDGET_API_ENABLED !== 'true';
}

/** 위젯 API가 비활성화되어 있으면 404 not-found를 응답하고 true를 돌려준다 */
export function rejectIfWidgetApiDisabled(res: WidgetRes): boolean {
  if (!isWidgetApiDisabled()) return false;
  res.status(404).json({ error: 'not-found' });
  return true;
}

function singleHeader(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** 요청 헤더에서 위젯 클라이언트 식별자와 버전 문자열을 읽는다 */
export function readWidgetClientHeaders(headers: IncomingHttpHeaders): {
  client: string | null;
  version: string | null;
} {
  return {
    client: singleHeader(headers[WIDGET_CLIENT_HEADER]),
    version: singleHeader(headers[WIDGET_VERSION_HEADER]),
  };
}

/** 위젯 전용 식별 헤더와 최소 semver 버전을 검증한다 */
export function validateWidgetClientVersion(
  headers: IncomingHttpHeaders,
  minVersion: string = WIDGET_MIN_CLIENT_VERSION,
): { ok: true; version: string } | { ok: false; minVersion: string } {
  const { client, version } = readWidgetClientHeaders(headers);
  if (client !== WIDGET_CLIENT_VALUE || !version || !isMinWidgetVersionSupported(version, minVersion)) {
    return { ok: false, minVersion };
  }
  return { ok: true, version };
}

/** Authorization: Bearer <token> 헤더에서 원문 토큰을 추출한다 */
export function parseBearerToken(headers: IncomingHttpHeaders): string | null {
  const raw = singleHeader(headers.authorization);
  if (!raw) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(raw);
  return m ? m[1] : null;
}

function resolveSpotId(lastSpot: string | null, saveData: unknown): string | null {
  if (typeof lastSpot === 'string' && lastSpot.length > 0) return lastSpot;
  if (!saveData || typeof saveData !== 'object') return null;
  const location = (saveData as { location?: unknown }).location;
  if (!location || typeof location !== 'object') return null;
  const { kind, id } = location as { kind?: unknown; id?: unknown };
  if (kind === 'spot' && typeof id === 'string' && id.length > 0) return id;
  return null;
}

/**
 * 위젯 요청의 기능 플래그, 클라이언트 버전(426), Bearer 토큰(401),
 * 구글 정식 계정·스테이징 관리자·제재·약관 수락 여부(403)를 순서대로 검증한다.
 * 거부 시 응답을 직접 작성하고 null을 돌려준다.
 */
export async function authenticateWidgetRequest(
  req: IncomingMessage,
  res: WidgetRes,
  db: Executor,
  opts: AuthenticateWidgetOptions = {},
): Promise<WidgetAuthContext | null> {
  if (rejectIfWidgetApiDisabled(res)) return null;

  const ver = validateWidgetClientVersion(req.headers, opts.minVersion);
  if (!ver.ok) {
    res.status(426).json({ error: 'version-mismatch', minVersion: ver.minVersion });
    return null;
  }

  const token = parseBearerToken(req.headers);
  if (!token) {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }

  const now = opts.now ?? new Date();
  const nowISO = now.toISOString();
  const row = await findWidgetTokenWithUser(db, sha256Hex(token), nowISO);
  if (!row) {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }

  if (row.isGuest || !row.hasGoogle) {
    res.status(403).json({ error: 'unsupported-account' });
    return null;
  }

  if (process.env.DEPLOY_ENV === 'preview' && !row.isAdmin) {
    res.status(403).json({ error: 'unsupported-account' });
    return null;
  }

  if (row.restricted) {
    res.status(403).json({ error: 'account-restricted' });
    return null;
  }

  if (await consentRequiredFor(db, { uid: row.userId, guest: false }, consentPolicy(), now)) {
    res.status(403).json({ error: 'consent-required' });
    return null;
  }

  if (opts.touchLastSeen !== false && now.getTime() - row.lastSeenAt.getTime() >= TOUCH_THROTTLE_MS) {
    void touchWidgetToken(db, row.tokenHash, nowISO).catch(e => {
      void reportServerIssue('widget-token-touch', e, { uid: row.userId });
    });
  }

  return {
    uid: row.userId,
    tokenHash: row.tokenHash,
    clientVersion: row.clientVersion,
    spotId: resolveSpotId(row.lastSpot, row.saveState?.data),
    saveState: row.saveState,
  };
}
