// 구글 인증 복귀의 분기 — 어느 표지와 오류 코드에서 무엇을 보이고 어디로 이어지는가.
import { describe, expect, it } from 'vitest';
import { GOOGLE_TAG, googleOutcome, loginMethodOf, overwriteCanceledText } from './googleFlow';

const back = (tag: string, error: string | null = null) => googleOutcome({ tag, error });

describe('로그인 방식', () => {
  it('이메일이 없는 계정은 게스트다', () => {
    expect(loginMethodOf(null, null)).toBe('guest');
    expect(loginMethodOf(null, [])).toBe('guest');
  });

  it('구글이 붙은 계정은 구글, 구글이 없는 계정은 이메일이다', () => {
    expect(loginMethodOf('a@gmail.com', ['google'])).toBe('google');
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

  it('이메일 계정이 같은 코드를 받으면 확인 없이 다른 구글 계정과 문의 안내를 보인다', () => {
    const out = back(GOOGLE_TAG.linkEmail, 'account_already_linked_to_different_user');
    expect(out).toMatchObject({ kind: 'notice' });
    expect(out).not.toEqual({ kind: 'overwrite' });
  });

  it.each(['email_account_exists', 'account_not_linked'])('%s는 이메일로 로그인한 뒤 계정 관리에서 연결하라는 안내다', code => {
    const out = back(GOOGLE_TAG.linkGuest, code);
    expect(out).toMatchObject({ kind: 'notice' });
    expect((out as { body: string }).body).toContain('계정 관리');
  });

  it('이미 구글을 연결한 계정이 다른 구글을 고르면 안내한다', () => {
    expect(back(GOOGLE_TAG.linkEmail, 'google_already_connected')).toMatchObject({ kind: 'notice' });
  });

  it('연결한 적 없는 구글로 로그인을 시도한 코드도 안내한다', () => {
    expect(back(GOOGLE_TAG.signIn, 'signup_disabled')).toMatchObject({ kind: 'notice' });
  });

  it('코드마다 안내 본문이 서로 다르다', () => {
    const codes = ['account_already_linked_to_different_user', 'email_account_exists', 'google_already_connected', 'signup_disabled'];
    const bodies = codes.map(c => (back(GOOGLE_TAG.linkEmail, c) as { body: string }).body);
    expect(new Set(bodies).size).toBe(codes.length);
  });

  it('알 수 없는 코드는 연결하지 않았다는 알림이다 (구글 화면에서 취소한 경우를 포함한다)', () => {
    expect(back(GOOGLE_TAG.linkGuest, 'access_denied')).toEqual({ kind: 'toast', tone: 'warn', text: '구글 계정을 연결하지 않았어요. 계정 관리에서 다시 연결할 수 있어요.' });
  });
});

describe('구글 로그인 복귀', () => {
  it('성공하면 그 계정의 진행을 불러왔다는 알림이다', () => {
    expect(back(GOOGLE_TAG.signIn)).toEqual({ kind: 'toast', tone: 'info', text: '구글 계정으로 로그인했어요. 그 계정의 진행을 불러왔어요.' });
  });

  it('알 수 없는 코드는 로그인하지 못했다는 경고다', () => {
    expect(back(GOOGLE_TAG.signIn, 'access_denied')).toMatchObject({ kind: 'toast', tone: 'warn' });
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
