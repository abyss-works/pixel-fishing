import { describe, expect, it } from 'vitest';
import { GOOGLE_TAG, googleOutcome } from '../../account/model/googleFlow';
import { adminSignInNotice } from './googleSignIn';

describe('관리자 구글 로그인 복귀 안내', () => {
  it('오류 없는 복귀는 안내가 없다', () => {
    expect(adminSignInNotice(null)).toBeNull();
  });

  it('연결한 적 없는 구글 계정(signup_disabled)은 관리자 계정에 연결한 구글로 다시 로그인하라고 안내한다', () => {
    expect(adminSignInNotice('signup_disabled')).toEqual({
      tone: 'warn',
      text: '연결한 적 없는 구글 계정으로는 로그인할 수 없어요.\n관리자 계정에 연결한 구글 계정으로 다시 로그인해 주세요.',
    });
  });

  it('주소가 같은 기존 계정이 있으면(account_not_linked) 연결된 구글 계정 또는 문의 안내를 두 줄로 보인다', () => {
    expect(adminSignInNotice('account_not_linked')).toEqual({
      tone: 'warn',
      text: '이 구글 계정과 주소가 같은 기존 계정이 있어 로그인할 수 없어요.\n관리자 계정에 연결된 구글 계정으로 다시 로그인하거나 운영자에게 문의해 주세요.',
    });
  });

  it('구글 화면에서 취소하고 돌아오면 정보 안내다', () => {
    expect(adminSignInNotice('access_denied')).toEqual({ tone: 'info', text: '구글 계정으로 로그인하지 않았어요.' });
  });

  it.each(['internal_server_error', 'unknown', ''])('그 밖의 코드(%j)는 두 줄 경고 안내다', code => {
    expect(adminSignInNotice(code)).toEqual({
      tone: 'warn', text: '구글 계정으로 로그인하지 못했어요.\n잠시 뒤 다시 시도해 주세요.',
    });
  });

  it('게임 토스트는 같은 두 문장을 한 줄로 쓴다', () => {
    expect(googleOutcome({ tag: GOOGLE_TAG.signIn, error: 'internal_server_error' })).toEqual({
      kind: 'toast', tone: 'warn', text: '구글 계정으로 로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요.',
    });
  });
});
