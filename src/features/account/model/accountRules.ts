// 계정 규칙 — 계정 만들기 넛지와 비밀번호 길이, 게스트 진행의 판정.
import { guestHasNoProgress } from '../../../game/rules/guest';
import type { GameState } from '../../../game/rules/logic';
import type { SyncState } from '../../gameplay/service/types';

/** 넛지를 띄우는 명성 기준 — 진행이 이만큼 쌓인 게스트에게만 계정을 권한다 */
export const ACCOUNT_NUDGE_FAME = 500;

/** 비밀번호 최소 길이 — 인증 서버에 설정한 최소 길이와 같은 값이어야 한다 */
export const MIN_PASSWORD_LENGTH = 6;

export const passwordLongEnough = (password: string): boolean => password.length >= MIN_PASSWORD_LENGTH;

/** 계정 만들기 넛지 — 명성 기준을 넘은 게스트에게 하루(KST 날짜) 한 번, 그날 첫 접속에서 띄운다 */
export function shouldNudgeAccount(s: {
  configured: boolean;
  /** 계정 여부 확인이 끝났는가 — 끝나기 전에는 계정 사용자도 게스트처럼 보인다 */
  accountChecked: boolean;
  signedIn: boolean;
  fame: number;
  lastNudgedDay: string | null;
  today: string;
}): boolean {
  if (!s.configured || !s.accountChecked || s.signedIn) return false;
  if (s.fame < ACCOUNT_NUDGE_FAME) return false;
  return s.lastNudgedDay !== s.today;
}

/** 게스트가 계정을 바꿀 때 버려지는 진행이 있는가. reading은 세이브를 읽는 중이라 아직 모른다 */
export type GuestProgress = 'reading' | 'nothing' | 'some';

/**
 * 세이브를 읽기 전의 상태는 기본값이라 낚은 수가 0으로 보이므로 읽은 뒤에만 판정한다.
 * sync는 세이브 연결 상태, blocked는 불러오는 중이거나 진행을 막는 창이 떠 있는지다.
 * 읽지 못했으면 진행이 있는 것으로 보아 확인을 거친다.
 */
export function guestProgress({ sync, blocked, game }: { sync: SyncState; blocked: boolean; game: GameState }): GuestProgress {
  if (sync === 'connecting') return 'reading';
  if (sync !== 'on') return 'some';
  if (blocked) return 'reading';
  return guestHasNoProgress(game) ? 'nothing' : 'some';
}
