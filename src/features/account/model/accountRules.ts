// 계정 규칙 — 계정 만들기 넛지와 비밀번호 길이.

/** 넛지를 띄우는 명성 기준 — 진행이 이만큼 쌓인 게스트에게만 계정을 권한다 */
export const ACCOUNT_NUDGE_FAME = 500;

/** 비밀번호 최소 길이 — 인증 서버(Supabase Auth) 기본 최소 길이와 같은 값이어야 한다 */
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
