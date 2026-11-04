// 본인 데이터 읽기 — 서버 읽기 함수(/api/me)가 세션 쿠키의 사용자 행만 돌려준다. 브라우저는 표를 직접 읽지 않는다.
// 세션이 없으면 unauthorized, 그 밖의 실패는 network로 던진다(조회가 다시 시도한다).
import { AppError } from '../../core/errors';

export type MePart = 'state' | 'bounty' | 'profile';

export async function readMe<T>(part: MePart): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/me?q=${part}`);
  } catch (cause) {
    throw new AppError('network', `${part} request failed`, {}, { cause });
  }
  if (res.status === 401) throw new AppError('unauthorized', `${part} read before session`);
  if (!res.ok) throw new AppError('network', `${part} read failed`, { status: res.status });
  return await res.json() as T;
}
