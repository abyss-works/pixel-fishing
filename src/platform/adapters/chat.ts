// 채팅 신고와 개인 차단 — 서버 함수(/api/blocks, /api/chat/messages/:id/reports)를 부른다. 채팅 쓰기와 받기는 실시간 채널이 맡는다.
// 실패는 던지지 않고 이유로 돌려준다. 화면이 짧은 안내로 보인다.

/** 신고·차단이 실패한 이유. guest는 계정(이메일) 유저가 아니다, missing은 대상 메시지·계정이 없다 */
export type ChatActionError = 'guest' | 'missing' | 'failed';
export interface BlockedUser { uid: string; nick: string | null }

async function callChat<T>(path: string, init?: RequestInit): Promise<T | { error: ChatActionError }> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    return { error: 'failed' };
  }
  if (res.status === 403) return { error: 'guest' };
  if (res.status === 404) return { error: 'missing' };
  if (!res.ok) return { error: 'failed' };
  return await res.json() as T;
}

/** 내가 차단한 사람 목록 */
export const readBlocks = () => callChat<{ blocks: BlockedUser[] }>('/api/blocks');

/** 차단하거나 푼다. 바뀐 목록을 돌려준다 */
export const changeBlock = (op: 'block' | 'unblock', uid: string) =>
  callChat<{ blocks: BlockedUser[] }>(`/api/blocks/${encodeURIComponent(uid)}`, { method: op === 'block' ? 'PUT' : 'DELETE' });

/** 채팅 메시지를 신고한다 */
export const reportChat = (id: number) => callChat<{ reported: true }>(`/api/chat/messages/${id}/reports`, { method: 'POST' });
