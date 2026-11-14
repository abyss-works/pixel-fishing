// 길드 — 서버 함수(/api/guilds, /api/guild-memberships, /api/guild-requests, /api/guild-invites)를 부른다. 길드 표를 브라우저에서 직접 읽지 않는다.
// 로컬 모드(클라우드 미설정)에는 길드 기능이 없어 부르는 쪽이 조회하지 않는다. 세션이 아직 없으면 실패로 던진다(조회가 다시 시도한다).
// 초대 링크(/g/코드)로 열린 첫 화면은 부팅 때 주소에서 코드를 꺼내 들고 주소를 첫 화면으로 되돌린다.
import { AppError } from '../../core/errors';
import { GUILD_LINK_PREFIX, normalizeGuildCode } from '../../game/rules/guild';
import { isCloud } from './auth';
import type { GuildInvitePreview, GuildOp, GuildOpResult, GuildState } from '../api/types';
import { isRateLimited, requestFailure } from './requestFailure';

const NO_GUILD: GuildState = { guild: null, request: null };

/** 내 길드와, 길드가 없으면 내가 넣어 둔 가입 신청. 로컬 모드면 둘 다 null */
export async function readGuild(): Promise<GuildState> {
  if (!isCloud) return NO_GUILD;
  const res = await fetch('/api/guilds/me');
  if (res.status === 401) throw new AppError('unauthorized', 'guild read before session');
  if (!res.ok) throw requestFailure(res, 'guild read failed');
  const body = await res.json() as Partial<GuildState>;
  return { guild: body.guild ?? null, request: body.request ?? null };
}

/** 초대 링크 미리보기. 없는 코드면 null이고, 그 밖의 실패는 던진다 */
export async function readGuildInvite(code: string): Promise<GuildInvitePreview | null> {
  if (!isCloud) return null;
  const res = await fetch(`/api/guild-invites/${encodeURIComponent(code)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw requestFailure(res, 'guild invite read failed');
  return (await res.json() as { invite: GuildInvitePreview }).invite;
}

const json = (method: string, body: unknown): RequestInit =>
  ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

function request(op: GuildOp): [string, RequestInit] {
  const guild = (id: string) => `/api/guilds/${encodeURIComponent(id)}`;
  switch (op.op) {
    case 'create': return ['/api/guilds', json('POST', { name: op.name })];
    case 'rename': return [`${guild(op.guildId)}/name`, json('PUT', { name: op.name })];
    case 'join': return ['/api/guild-memberships', json('POST', op.via ? { code: op.code, via: op.via } : { code: op.code })];
    case 'settings': {
      const body: Record<string, unknown> = {};
      if (op.joinMode !== undefined) body.joinMode = op.joinMode;
      if (op.pitch !== undefined) body.pitch = op.pitch;
      return [guild(op.guildId), json('PATCH', body)];
    }
    case 'approve': return [`${guild(op.guildId)}/requests/${encodeURIComponent(op.uid)}/approval`, { method: 'POST' }];
    case 'reject': return [`${guild(op.guildId)}/requests/${encodeURIComponent(op.uid)}`, { method: 'DELETE' }];
    case 'cancelRequest': return ['/api/guild-requests/me', { method: 'DELETE' }];
    case 'remove': return [`${guild(op.guildId)}/members/${encodeURIComponent(op.uid)}`, { method: 'DELETE' }];
    case 'handover': return [`${guild(op.guildId)}/leader`, json('PUT', { uid: op.uid })];
    case 'donate': return [`${guild(op.guildId)}/bonuses/${encodeURIComponent(op.bonus)}/donations`, json('POST', { amount: op.amount })];
  }
}

/** 길드 요청. 서버가 거절하면 오류 코드를 돌려주고, 연결 실패는 던진다. 들어오기는 들어갔는지 신청이 됐는지를 싣는다 */
export async function guildAction(op: GuildOp): Promise<GuildOpResult> {
  const res = await fetch(...request(op));
  if (res.status >= 500 || isRateLimited(res)) throw requestFailure(res, 'guild action failed');
  const body = await res.json().catch(() => ({})) as { error?: string; result?: string };
  if (!res.ok) return { ok: false, error: body.error ?? 'unknown' };
  return body.result === 'joined' || body.result === 'requested' ? { ok: true, result: body.result } : { ok: true };
}

/**
 * 초대 링크로 열린 주소면 길드 코드를 꺼내고 주소를 첫 화면(/)으로 되돌린다. 아니면 null.
 * 새로고침하거나 뒤로 가도 같은 초대가 다시 뜨지 않게 주소에서 바로 지운다.
 */
export function takeGuildInviteLanding(): string | null {
  if (typeof window === 'undefined') return null;
  const path = window.location.pathname;
  if (!path.startsWith(GUILD_LINK_PREFIX)) return null;
  const code = normalizeGuildCode(decodeURIComponent(path.slice(GUILD_LINK_PREFIX.length)).replace(/\/$/, ''));
  window.history.replaceState(window.history.state, '', '/');
  return code;
}
