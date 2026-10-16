// 개발 도구 패널의 운영 가드 — 앱 최상위가 공급한 개발 환경이 운영이면 조작을 흐리게 막고 대시보드 이동만 남긴다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import DevTools from './DevTools';
import { DevEnvContext, devEnvOf } from './devEnv';
import { newState } from '../../../game/rules/logic';
import { resetKeyScopes } from '../../ui/hotkeys';

beforeEach(() => { window.history.replaceState({}, '', '/?admin=1'); localStorage.clear(); });
afterEach(() => { cleanup(); resetKeyScopes(); window.history.replaceState({}, '', '/'); });

const show = (env: string) => {
  const dispatch = vi.fn();
  render(
    <DevEnvContext.Provider value={devEnvOf(env)}>
      <DevTools game={newState()} dispatch={dispatch} setToast={() => {}} account={null} uid={null} />
    </DevEnvContext.Provider>,
  );
  fireEvent.click(screen.getByRole('button', { name: '개발 도구' }));
  return { dispatch };
};

describe('개발 도구 운영 가드', () => {
  it('운영이면 운영 묶음에서 열리고 대시보드 이동만 누를 수 있다 — 이사 코드도 막힌다', () => {
    show('production');
    expect(screen.getByLabelText('대시보드 열기')).toBeInTheDocument();
    expect(screen.getAllByText(/운영 서버다 — 여기서는 대시보드 조회만/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '이사 코드 내보내기', hidden: true }).closest('[aria-hidden]')).not.toBeNull();
  });

  it('운영이면 다른 묶음의 조작은 흐림 처리 뒤에 숨는다', () => {
    show('production');
    fireEvent.click(screen.getByRole('button', { name: '프리셋' }));
    expect(screen.getByRole('button', { name: '태평양 네임드 직전', hidden: true }).closest('[aria-hidden]')).not.toBeNull();
  });

  it('알 수 없는 환경도 운영처럼 막는다', () => {
    show('');
    expect(screen.getAllByText(/운영 서버다/).length).toBeGreaterThan(0);
  });

  it('스테이징이면 프리셋부터 열리고 막지 않는다', () => {
    show('preview');
    expect(screen.queryByText(/운영 서버다/)).toBeNull();
    expect(screen.getByRole('button', { name: '태평양 네임드 직전' }).closest('[aria-hidden]')).toBeNull();
  });
});
