// 마지막 위치 읽기 — 서버 읽기 함수(GET /api/me/position)가 세션 사용자의 마지막 바다 위치를 준다.
// 클라우드 미설정(로컬 dev·테스트)이면 기록이 없어 null이다. 그 밖의 실패는 던진다.
import { AppError } from '../../core/errors';
import { isCloud } from './auth';

export interface LastPosition {
  region: string;
  x: number;
  y: number;
}

export async function readLastPosition(): Promise<LastPosition | null> {
  if (!isCloud) return null;
  const res = await fetch('/api/me/position');
  if (!res.ok) throw new AppError('network', 'last position read failed', { status: res.status });
  const body = await res.json() as { position: LastPosition | null };
  return body.position;
}
