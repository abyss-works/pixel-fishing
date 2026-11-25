// 백엔드 닉네임 — 표시용 읽기(getProfile)는 백엔드 경계에 둔다.
// 쓰기는 dispatch(setNickname) 단일 경로 (서버 권위).
import { describe, it, expect } from 'vitest';
import { LocalGameGateway } from './localGameGateway';
import { newState } from '../../game/rules/logic';
import { checkNickname } from '../../game/rules/nickname';

describe('LocalGameGateway 닉네임', () => {
  it('성공 상태와 닫힌 개발 도구 판정을 돌려준다', () => {
    const profile = new LocalGameGateway(newState()).getProfile();
    expect(profile.ok).toBe(true);
    if (!profile.ok) throw new Error('expected ok profile');
    expect(profile.devTools).toBe(false);
  });

  it('첫 조회에 게스트명을 지어내고 이후에는 같은 값을 돌려준다', () => {
    const b = new LocalGameGateway(newState());
    const first = b.getProfile();
    if (!first.ok) throw new Error('expected ok profile');
    expect(typeof first.nickname).toBe('string');
    expect(checkNickname(first.nickname).ok).toBe(true);
    const second = b.getProfile();
    expect(second).toEqual(first);
  });

  it('setNickname 성공 후 조회값이 바뀐다', () => {
    const b = new LocalGameGateway(newState());
    const r = b.dispatch({ type: 'setNickname', nickname: '날치' });
    if (r.status !== 'ok') throw new Error(r.error);
    const profile = b.getProfile();
    if (!profile.ok) throw new Error('expected ok profile');
    expect(profile.nickname).toBe('날치');
  });

  it('형태가 틀리면 거부하고 기존 값을 유지한다', () => {
    const b = new LocalGameGateway(newState());
    const before = b.getProfile();
    if (!before.ok) throw new Error('expected ok profile');
    const r = b.dispatch({ type: 'setNickname', nickname: '__' });
    expect(r.status).toBe('rejected');
    const after = b.getProfile();
    if (!after.ok) throw new Error('expected ok profile');
    expect(after.nickname).toBe(before.nickname);
  });
});
