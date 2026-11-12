// 관리자 구글 로그인에서 돌아온 결과 코드를 화면 안내로 바꾼다. 결과의 종류는 서버가 돌려준 코드로만 가른다.
import { EMAIL_ACCOUNT_EXISTS_LEAD, SIGN_IN_CANCELED_TEXT, SIGN_IN_FAILED_SENTENCES } from '../../account/model/googleFlow';

export interface AdminSignInNotice {
  tone: 'info' | 'warn';
  text: string;
}

const SIGNUP_DISABLED_TEXT = '연결한 적 없는 구글 계정으로는 로그인할 수 없어요.\n관리자 계정에 연결한 구글 계정으로 다시 로그인해 주세요.';
const ACCOUNT_NOT_LINKED_TEXT = [
  EMAIL_ACCOUNT_EXISTS_LEAD,
  '게임의 계정 관리에서 그 이메일 계정으로 로그인해 이 구글 계정을 연결해 주세요.',
  '그다음 여기서 다시 로그인해 주세요.',
].join('\n');

/** 돌아온 주소의 결과 코드(없으면 null)를 로그인 화면의 안내로 바꾼다. 안내할 것이 없으면 null이다 */
export function adminSignInNotice(error: string | null): AdminSignInNotice | null {
  if (error === null) return null;
  if (error === 'signup_disabled') return { tone: 'warn', text: SIGNUP_DISABLED_TEXT };
  if (error === 'account_not_linked') return { tone: 'warn', text: ACCOUNT_NOT_LINKED_TEXT };
  if (error === 'access_denied') return { tone: 'info', text: SIGN_IN_CANCELED_TEXT };
  return { tone: 'warn', text: SIGN_IN_FAILED_SENTENCES.join('\n') };
}
