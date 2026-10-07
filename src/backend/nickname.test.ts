// 백엔드 닉네임 — 표시용 읽기(getNickname)는 백엔드 경계에 둔다.
// 쓰기는 dispatch(setNickname) 단일 경로 (서버 권위).
import { describe, it, expect } from 'vitest';
import { LocalBackend } from './local';
import { newState } from '../game/logic';
import { checkNickname } from '../game/nickname';

describe('LocalBackend 닉네임', () => {
  it('첫 조회에 게스트명을 지어내고 이후에는 같은 값을 돌려준다', () => {
    const b = new LocalBackend(newState());
    const first = b.getNickname();
    expect(typeof first).toBe('string');
    expect(checkNickname(first).ok).toBe(true);
    expect(b.getNickname()).toBe(first);
  });

  it('setNickname 성공 후 조회값이 바뀐다', () => {
    const b = new LocalBackend(newState());
    const r = b.dispatch({ type: 'setNickname', nickname: '날치' });
    if (r.status !== 'ok') throw new Error(r.error);
    expect(b.getNickname()).toBe('날치');
  });

  it('형태가 틀리면 거부하고 기존 값을 유지한다', () => {
    const b = new LocalBackend(newState());
    const before = b.getNickname();
    const r = b.dispatch({ type: 'setNickname', nickname: '__' });
    expect(r.status).toBe('rejected');
    expect(b.getNickname()).toBe(before);
  });
});
