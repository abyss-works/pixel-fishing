// 공개 프로필 — 서버 읽기 함수(GET /api/players/:uid)를 부른다. 다른 사용자의 표를 브라우저에서 직접 읽지 않는다.
// 클라우드 미설정(로컬 dev·테스트)이면 null이다. 그 밖의 실패는 던진다(조회가 다시 시도한다).
import { AppError } from '../../core/errors';
import { isCloud } from './auth';

/**
 * 다른 플레이어에게 보이는 정보. dexFish는 일반 폼으로 한 번이라도 낚은 어종 id, artifacts는 가진 유물 id,
 * account는 게스트가 아닌 계정인가
 */
export interface PublicProfile {
  nickname: string | null; boat: number; rod: number; fame: number;
  dexFish: string[]; artifacts: string[]; account: boolean;
}

export async function readPlayer(uid: string): Promise<PublicProfile | null> {
  if (!isCloud) return null;
  const res = await fetch(`/api/players/${encodeURIComponent(uid)}`);
  if (!res.ok) throw new AppError('network', 'player read failed', { status: res.status });
  return await res.json() as PublicProfile;
}

/** 친구 요청 닉네임 자동완성 후보 — 앞부분이 같은 계정 유저. 클라우드 미설정이면 빈 목록이다. 그 밖의 실패는 던진다 */
export async function searchPlayers(prefix: string): Promise<{ uid: string; nickname: string }[]> {
  if (!isCloud) return [];
  const res = await fetch(`/api/players?nickname=${encodeURIComponent(prefix)}`);
  if (!res.ok) throw new AppError('network', 'player search failed', { status: res.status });
  return ((await res.json()) as { players: { uid: string; nickname: string }[] }).players;
}
