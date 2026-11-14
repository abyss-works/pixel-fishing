// 친구 — 서버 함수(/api/friends)를 부른다. 친구 표를 브라우저에서 직접 읽지 않는다.
// 클라우드 미설정(로컬 dev·테스트)이면 null — 친구 기능이 없다. 세션이 아직 없으면 실패로 던진다(조회가 다시 시도한다).
import { AppError } from '../../core/errors';
import { isCloud } from './auth';
import type { FriendItem, FriendOp, FriendOpResult } from '../api/types';
import { isRateLimited, requestFailure } from './requestFailure';

/** 친구·받은 요청·보낸 요청 */
export async function readFriends(): Promise<FriendItem[] | null> {
  if (!isCloud) return null;
  const res = await fetch('/api/friends');
  if (res.status === 401) throw new AppError('unauthorized', 'friends read before session');
  if (!res.ok) throw requestFailure(res, 'friends read failed');
  return (await res.json() as { friends: FriendItem[] }).friends;
}

/** 요청·수락·삭제. 서버가 거절하면 오류 코드를 돌려주고, 연결 실패는 던진다 */
export async function friendAction(body: FriendOp): Promise<FriendOpResult> {
  const res = body.op === 'request'
    ? await fetch('/api/friends', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nickname: body.nickname }),
    })
    : await fetch(`/api/friends/${encodeURIComponent(body.uid)}`, { method: body.op === 'accept' ? 'PUT' : 'DELETE' });
  if (res.status >= 500) throw requestFailure(res, 'friend action failed');
  // 앱 서버의 429는 오류 코드를 싣는다(아래에서 거절로 돌려준다). 코드가 없는 429는 인그레스의 요청 한도다
  const json = await (isRateLimited(res) ? res.json().catch(() => ({})) : res.json()) as { result?: string; error?: string };
  if (isRateLimited(res) && typeof json.error !== 'string') throw requestFailure(res, 'friend action failed');
  return res.ok ? { ok: true, result: json.result ?? '' } : { ok: false, error: json.error ?? 'unknown' };
}
