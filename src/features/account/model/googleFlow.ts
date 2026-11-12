// 구글 연결과 로그인의 분기. 구글 인증 화면을 다녀온 주소의 표지와 오류 코드를 보고
// 무엇을 알리고 어디로 이어지는지 정한다. 화면은 이 판정을 그리기만 한다.

/** 구글 공식 버튼의 문구. 게임 계정 창과 관리자 로그인 화면이 함께 쓴다 */
export const GOOGLE_BUTTON_LABEL = 'Google로 계속하기';

/** 구글 인증을 시작할 때 복귀 주소에 싣는 표지. 시작한 사람이 누구였는지를 돌아온 뒤에도 알기 위해서다 */
export const GOOGLE_TAG = {
  linkGuest: 'link-guest',
  linkEmail: 'link-email',
  signIn: 'sign-in',
} as const;

/** 이용약관과 개인정보 처리방침 페이지의 주소. 게임 주소 아래에 두고 로그인하지 않아도 볼 수 있다 */
export const LEGAL_PATHS = { terms: '/terms', privacy: '/privacy' } as const;

/** 지금 계정의 로그인 방식 */
export type LoginMethod = 'guest' | 'email' | 'google';

/** 계정 이메일과 붙은 로그인 수단에서 로그인 방식을 정한다. 영구 계정의 수단을 읽지 못했으면 null이다 */
export function loginMethodOf(account: string | null, providers: string[] | null): LoginMethod | null {
  if (account === null) return 'guest';
  if (providers === null) return null;
  return providers.includes('google') ? 'google' : 'email';
}

export type GoogleOutcome =
  | { kind: 'toast'; text: string; tone: 'info' | 'warn' }
  /** 알릴 것이 없다. 구글 로그인 성공은 부팅의 진행 불러오기 알림이 같은 사실을 알린다 */
  | { kind: 'none' }
  /** 고른 구글 계정이 이미 다른 계정에 연결돼 있다. 그 계정으로 로그인해 지금 게스트 진행을 버릴지 묻는다 */
  | { kind: 'overwrite' }
  | { kind: 'notice'; title: string; body: string };

/** 게스트가 고른 구글 계정이 이미 다른 계정에 연결돼 있을 때 뜨는 확인 창의 문구. 그 구글 계정에 진행이 있는지는 가리지 않는다 */
export const OVERWRITE_COPY = {
  title: '구글 계정으로 로그인',
  body: '이 구글 계정은 다른 계정에서 쓰고 있어요.',
  warn: '로그인을 누르면 그 계정의 진행으로 바뀌어요.\n지금 게스트 진행은 사라져요.',
  back: '되돌아가기를 누르면 게스트로 남고, 다른 구글 계정으로 연결할 수 있어요.',
  confirm: '로그인',
  cancel: '되돌아가기',
} as const;

/** 덮어쓰기 확인에서 되돌아갔을 때의 알림 */
export const overwriteCanceledText = '연결하지 않았어요. 다른 구글 계정으로 연결해 보세요.';

/** 구글 인증 화면을 열지 못했을 때의 알림 */
export const googleStartFailedText = '구글 계정 선택 화면을 열지 못했어요. 잠시 뒤 다시 시도해 주세요.';

/** 구글 로그인에서 계정을 고르지 않고 돌아왔을 때의 알림 */
export const SIGN_IN_CANCELED_TEXT = '구글 계정으로 로그인하지 않았어요.';

/** 원인을 모르는 구글 로그인 실패를 알리는 두 문장. 게임 토스트는 한 줄로, 관리자 로그인 화면은 문장마다 줄을 나눠 쓴다 */
export const SIGN_IN_FAILED_SENTENCES = ['구글 계정으로 로그인하지 못했어요.', '잠시 뒤 다시 시도해 주세요.'] as const;
export const SIGN_IN_FAILED_TEXT = SIGN_IN_FAILED_SENTENCES.join(' ');

/** 구글 계정과 주소가 같은 이메일 계정이 있다는 사실의 안내 첫 문장. 게임 안내와 관리자 로그인 화면이 함께 쓴다 */
export const EMAIL_ACCOUNT_EXISTS_LEAD = '이 구글 계정과 주소가 같은 이메일 계정이 있어요.';

const FAIL_TITLE = '구글 계정 연결';

const NOTICE_BODY = {
  linkedElsewhere: '이 구글 계정은 다른 계정에서 쓰고 있어 연결하지 않았어요.\n다른 구글 계정으로 연결해 주세요.\n이 구글 계정을 꼭 연결해야 한다면 개발자에게 문의해 주세요.',
  emailAccountExists: `${EMAIL_ACCOUNT_EXISTS_LEAD}\n계정 관리의 이메일 계정으로 로그인을 눌러 그 계정으로 로그인해 주세요.\n그다음 같은 창에서 구글 계정을 연결해 주세요.`,
  alreadyConnected: '고른 구글 계정은 연결하지 않았어요.\n이 계정에는 이미 다른 구글 계정이 연결돼 있어요.',
  signupDisabled: '연결한 적 없는 구글 계정으로는 로그인할 수 없어요.\n게스트로 시작한 뒤 계정 관리에서 구글 계정을 연결해 주세요.',
  unableToLink: '이 구글 계정으로는 연결할 수 없어요.\n다른 구글 계정으로 연결해 주세요.\n이 구글 계정을 꼭 연결해야 한다면 개발자에게 문의해 주세요.',
} as const;

const notice = (body: string): GoogleOutcome => ({ kind: 'notice', title: FAIL_TITLE, body });

/** 구글 인증에서 돌아온 결과를 화면 반응으로 바꾼다. 우리가 붙인 표지가 아니면 null이다 */
export function googleOutcome({ tag, error }: { tag: string; error: string | null }): GoogleOutcome | null {
  if (tag !== GOOGLE_TAG.linkGuest && tag !== GOOGLE_TAG.linkEmail && tag !== GOOGLE_TAG.signIn) return null;
  const signIn = tag === GOOGLE_TAG.signIn;

  if (!error) {
    if (signIn) return { kind: 'none' };
    return {
      kind: 'toast', tone: 'info',
      text: tag === GOOGLE_TAG.linkGuest
        ? '구글 계정을 연결했어요. 진행은 이 계정에 저장돼요.'
        : '구글 계정을 연결했어요. 다음부터는 구글 계정으로 로그인해 주세요.',
    };
  }

  if (error === 'account_already_linked_to_different_user') {
    return tag === GOOGLE_TAG.linkGuest ? { kind: 'overwrite' } : notice(NOTICE_BODY.linkedElsewhere);
  }
  if (error === 'email_account_exists' || error === 'account_not_linked') return notice(NOTICE_BODY.emailAccountExists);
  if (error === 'google_already_connected') return notice(NOTICE_BODY.alreadyConnected);
  if (error === 'signup_disabled') return notice(NOTICE_BODY.signupDisabled);
  if (error === 'unable_to_link_account') return notice(NOTICE_BODY.unableToLink);

  // 구글 화면에서 취소하고 돌아온 경우와 원인을 모르는 실패를 나눈다
  if (error === 'access_denied') {
    return {
      kind: 'toast', tone: 'info',
      text: signIn ? SIGN_IN_CANCELED_TEXT : '구글 계정을 연결하지 않았어요. 계정 관리에서 다시 연결할 수 있어요.',
    };
  }
  return {
    kind: 'toast', tone: 'warn',
    text: signIn ? SIGN_IN_FAILED_TEXT : '구글 계정을 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.',
  };
}
