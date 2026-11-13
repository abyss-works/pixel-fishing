// 구글 인증 복귀의 분기 — 어느 표지와 오류 코드에서 무엇을 보이고 어디로 이어지는가.
import { describe, expect, it } from 'vitest';
import { GOOGLE_TAG, OVERWRITE_COPY, emailSignInFailureLines, googleOutcome, loginMethodOf, overwriteCanceledText } from './googleFlow';

const back = (tag: string, error: string | null = null) => googleOutcome({ tag, error });
const bodyOf = (o: ReturnType<typeof back>) => (o as { body: string }).body;

describe('로그인 방식', () => {
  it('이메일이 없는 계정은 게스트다', () => {
    expect(loginMethodOf(null, null)).toBe('guest');
    expect(loginMethodOf(null, [])).toBe('guest');
  });

  it('구글이 붙은 계정은 구글, 구글이 없는 계정은 이메일이다', () => {
    expect(loginMethodOf('a@gmail.test', ['google'])).toBe('google');
    expect(loginMethodOf('a@example.com', ['credential'])).toBe('email');
    expect(loginMethodOf('a@example.com', [])).toBe('email');
  });

  it('수단을 아직 읽지 못한 영구 계정은 모르는 상태(null)다', () => {
    expect(loginMethodOf('a@example.com', null)).toBeNull();
  });
});

describe('구글 연결 복귀', () => {
  it('게스트의 연결 성공은 진행이 이 계정에 저장된다는 알림이다', () => {
    expect(back(GOOGLE_TAG.linkGuest)).toEqual({ kind: 'toast', tone: 'info', text: '구글 계정을 연결했어요. 진행은 이 계정에 저장돼요.' });
  });

  it('이메일 계정의 연결 성공은 다음부터 구글로 로그인하라는 알림이다', () => {
    expect(back(GOOGLE_TAG.linkEmail)).toEqual({ kind: 'toast', tone: 'info', text: '구글 계정을 연결했어요. 다음부터는 구글 계정으로 로그인해 주세요.' });
  });

  it('게스트가 이미 다른 계정에 연결된 구글을 고르면 덮어쓰기 확인으로 이어진다', () => {
    expect(back(GOOGLE_TAG.linkGuest, 'account_already_linked_to_different_user')).toEqual({ kind: 'overwrite' });
  });

  it('이메일 계정이 같은 코드를 받으면 확인 없이 다른 구글 계정 안내와 문의 줄을 보인다', () => {
    expect(back(GOOGLE_TAG.linkEmail, 'account_already_linked_to_different_user')).toEqual({
      kind: 'notice', title: '구글 계정 연결',
      body: '이 구글 계정은 다른 계정에서 쓰고 있어 연결하지 않았어요.\n다른 구글 계정으로 연결해 주세요.\n이 구글 계정을 꼭 연결해야 한다면 개발자에게 문의해 주세요.',
    });
  });

  it.each([GOOGLE_TAG.linkGuest, GOOGLE_TAG.linkEmail])('unable_to_link_account는 %s에서도 안내 창이다', tag => {
    expect(back(tag, 'unable_to_link_account')).toEqual({
      kind: 'notice', title: '구글 계정 연결',
      body: '이 구글 계정으로는 연결할 수 없어요.\n다른 구글 계정으로 연결해 주세요.\n이 구글 계정을 꼭 연결해야 한다면 개발자에게 문의해 주세요.',
    });
  });

  it.each(['email_account_exists', 'account_not_linked'])('%s는 이메일 계정으로 로그인한 뒤 연결하라는 안내다', code => {
    expect(bodyOf(back(GOOGLE_TAG.linkGuest, code))).toBe(
      '이 구글 계정과 주소가 같은 이메일 계정이 있어요.\n계정 관리의 기존 이메일 계정으로 로그인을 눌러 그 계정으로 로그인해 주세요.\n그다음 같은 창에서 구글 계정을 연결해 주세요.');
  });

  it('이미 구글을 연결한 계정이 다른 구글을 고르면 안내한다', () => {
    expect(bodyOf(back(GOOGLE_TAG.linkEmail, 'google_already_connected'))).toBe(
      '고른 구글 계정은 연결하지 않았어요.\n이 계정에는 이미 다른 구글 계정이 연결돼 있어요.');
  });

  it('연결한 적 없는 구글로 로그인을 시도한 코드도 안내한다', () => {
    expect(bodyOf(back(GOOGLE_TAG.signIn, 'signup_disabled'))).toBe(
      '연결한 적 없는 구글 계정으로는 로그인할 수 없어요.\n게스트로 시작한 뒤 계정 관리에서 구글 계정을 연결해 주세요.');
  });

  it('코드마다 안내 본문이 서로 다르다', () => {
    const codes = ['account_already_linked_to_different_user', 'email_account_exists', 'google_already_connected', 'signup_disabled', 'unable_to_link_account'];
    const bodies = codes.map(c => bodyOf(back(GOOGLE_TAG.linkEmail, c)));
    expect(new Set(bodies).size).toBe(codes.length);
  });

  it('구글 화면에서 취소하고 돌아오면 정보 알림이다', () => {
    expect(back(GOOGLE_TAG.linkGuest, 'access_denied')).toEqual({ kind: 'toast', tone: 'info', text: '구글 계정을 연결하지 않았어요. 계정 관리에서 다시 연결할 수 있어요.' });
  });

  it('원인을 모르는 연결 실패는 경고 알림이다', () => {
    expect(back(GOOGLE_TAG.linkEmail, 'internal_server_error')).toEqual({ kind: 'toast', tone: 'warn', text: '구글 계정을 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.' });
  });
});

describe('구글 로그인 복귀', () => {
  it('성공은 따로 알리지 않는다 (부팅의 진행 불러오기 알림이 같은 사실을 알린다)', () => {
    expect(back(GOOGLE_TAG.signIn)).toEqual({ kind: 'none' });
  });

  it('구글 화면에서 취소하면 로그인하지 않았다는 정보 알림이다', () => {
    expect(back(GOOGLE_TAG.signIn, 'access_denied')).toEqual({ kind: 'toast', tone: 'info', text: '구글 계정으로 로그인하지 않았어요.' });
  });

  it('원인을 모르는 실패는 경고 알림이다', () => {
    expect(back(GOOGLE_TAG.signIn, 'internal_server_error')).toEqual({ kind: 'toast', tone: 'warn', text: '구글 계정으로 로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요.' });
  });
});

describe('알 수 없는 표지', () => {
  it('우리가 붙인 표지가 아니면 아무것도 하지 않는다', () => {
    expect(back('other')).toBeNull();
  });
});

describe('덮어쓰기 취소', () => {
  it('게스트로 남고 다른 구글 계정으로 연결할 수 있다는 알림이다', () => {
    expect(overwriteCanceledText).toBe('연결하지 않았어요. 다른 구글 계정으로 연결해 보세요.');
  });
});

describe('덮어쓰기 확인 창 문구', () => {
  it('이미 다른 계정에 연결된 구글 계정을 알리고 로그인을 묻는다', () => {
    expect(OVERWRITE_COPY).toEqual({
      title: '구글 계정으로 로그인',
      body: '이 구글 계정은 다른 계정에서 쓰고 있어요.',
      warn: '로그인을 누르면 그 계정의 진행으로 바뀌어요.\n지금 게스트 진행은 사라져요.',
      back: '되돌아가기를 누르면 게스트로 남고, 다른 구글 계정으로 연결할 수 있어요.',
      confirm: '로그인',
      cancel: '되돌아가기',
    });
  });
});

describe('이메일 로그인 실패 안내', () => {
  it('인증 실패는 새 계정을 만들 수 없다는 사실과 구글 버튼 안내를 세 줄로 알린다', () => {
    expect(emailSignInFailureLines('invalid_credentials')).toEqual(
      ['로그인하지 못했어요.', '이메일로는 새 계정을 만들 수 없어요.', '이메일 계정이 없거나 이미 구글 계정을 연결했다면 Google로 계속하기를 눌러 주세요.']);
  });

  it('요청 과다는 잠시 뒤 다시 시도하라고 알린다', () => {
    expect(emailSignInFailureLines('over_email_send_rate_limit'))
      .toEqual(['로그인하지 못했어요.', '요청이 너무 잦아요.', '잠시 뒤 다시 시도해 주세요.']);
  });

  it('이메일 형식 오류는 두 줄이다', () => {
    expect(emailSignInFailureLines('validation_failed')).toEqual(['로그인하지 못했어요.', '이메일 형식을 확인해 주세요.']);
  });

  it('서버에 닿지 못한 실패는 연결 실패를 알린다', () => {
    expect(emailSignInFailureLines('network'))
      .toEqual(['로그인하지 못했어요.', '서버에 연결하지 못했어요.', '잠시 뒤 다시 시도해 주세요.']);
  });

  it.each([undefined, '', 'unknown_code', 'weak_password'])('그 밖의 실패(%s)는 두 줄이다', code => {
    expect(emailSignInFailureLines(code)).toEqual(['로그인하지 못했어요.', '잠시 뒤 다시 시도해 주세요.']);
  });
});
