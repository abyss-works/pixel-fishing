// 서버 응답의 상태를 실패 종류로 바꾼다. 읽기·쓰기 어댑터가 공유하는 단일 판정이다.
// 인그레스의 요청 한도 응답(429)은 본문이 JSON이 아니므로 본문을 읽지 않고 상태만 본다.
import { AppError } from '../../core/errors';

/** 응답이 요청 한도 초과인가 */
export function isRateLimited(res: Response): boolean {
  return res.status === 429;
}

/** 실패한 응답의 AppError. 429는 rate-limited, 그 밖은 network다 */
export function requestFailure(res: Response, message: string): AppError {
  return new AppError(isRateLimited(res) ? 'rate-limited' : 'network', message, { status: res.status });
}
