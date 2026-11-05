// 길드 — 서버 함수(/api/guilds, /api/guild-memberships)를 부른다. 길드 표를 브라우저에서 직접 읽지 않는다.
// 로컬 모드(클라우드 미설정)에는 길드 기능이 없어 부르는 쪽이 조회하지 않는다. 세션이 아직 없으면 실패로 던진다(조회가 다시 시도한다).
import { AppError } from '../../core/errors';
import { isCloud } from './auth';
import type { GuildInfo, GuildOp, GuildOpResult } from '../api/types';

/** 내 길드. 길드가 없거나 로컬 모드면 null */
export async function readGuild(): Promise<GuildInfo | null> {
  if (!isCloud) return null;
  const res = await fetch('/api/guilds/me');
  if (res.status === 401) throw new AppError('unauthorized', 'guild read before session');
  if (!res.ok) throw new AppError('network', 'guild read failed', { status: res.status });
  return (await res.json() as { guild: GuildInfo | null }).guild;
}

const json = (method: string, body: unknown): RequestInit =>
  ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

function request(op: GuildOp): [string, RequestInit] {
  const guild = (id: string) => `/api/guilds/${encodeURIComponent(id)}`;
  switch (op.op) {
    case 'create': return ['/api/guilds', json('POST', { name: op.name })];
    case 'join': return ['/api/guild-memberships', json('POST', { code: op.code })];
    case 'invite': return [`${guild(op.guildId)}/invites`, { method: 'POST' }];
    case 'remove': return [`${guild(op.guildId)}/members/${encodeURIComponent(op.uid)}`, { method: 'DELETE' }];
    case 'handover': return [`${guild(op.guildId)}/leader`, json('PUT', { uid: op.uid })];
    case 'donate': return [`${guild(op.guildId)}/bonuses/${encodeURIComponent(op.bonus)}/donations`, json('POST', { amount: op.amount })];
  }
}

/** 만들기·가입·코드 발급·떠나기·내보내기·위임·보너스 기부. 서버가 거절하면 오류 코드를 돌려주고, 연결 실패는 던진다 */
export async function guildAction(op: GuildOp): Promise<GuildOpResult> {
  const res = await fetch(...request(op));
  if (res.status >= 500) throw new AppError('network', 'guild action failed', { status: res.status });
  if (res.ok) return { ok: true };
  const body = await res.json() as { error?: string };
  return { ok: false, error: body.error ?? 'unknown' };
}
