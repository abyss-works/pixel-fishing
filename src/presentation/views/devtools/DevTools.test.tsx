// 개발 도구 패널의 운영 가드 및 6개 묶음·시간/순간이동·스냅샷 UI 검증.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DevTools from './DevTools';
import { DevEnvContext, devEnvOf } from './devEnv';
import { newState } from '../../../game/rules/logic';
import { resetKeyScopes } from '../../ui/hotkeys';
import { resetTimeOverride, getPhaseOverride } from '../../../features/gameplay/service/timeOverride';

beforeEach(() => {
  window.history.replaceState({}, '', '/?admin=1');
  localStorage.clear();
  resetTimeOverride();
});
afterEach(() => {
  cleanup();
  resetKeyScopes();
  resetTimeOverride();
  window.history.replaceState({}, '', '/');
});

const show = (env: string, extraProps: Partial<Parameters<typeof DevTools>[0]> = {}) => {
  const dispatch = vi.fn().mockResolvedValue({ status: 'ok', state: newState(), result: { type: 'none' } });
  render(
    <DevEnvContext.Provider value={devEnvOf(env)}>
      <DevTools game={newState()} dispatch={dispatch} setToast={() => {}} granted={false} {...extraProps} />
    </DevEnvContext.Provider>,
  );
  fireEvent.click(screen.getByRole('button', { name: '개발 도구' }));
  return { dispatch };
};

describe('개발 도구 운영 가드', () => {
  it('운영이면 계정·스냅샷 묶음에서 열리고 대시보드 이동만 누를 수 있다 — 스냅샷·이사 코드도 막힌다', () => {
    show('production');
    expect(screen.getByLabelText('대시보드 열기')).toBeInTheDocument();
    expect(screen.getAllByText(/운영 서버다 — 여기서는 대시보드 조회만/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '이사 코드 내보내기', hidden: true }).closest('[aria-hidden]')).not.toBeNull();
    expect(screen.getByRole('button', { name: '현재 상태 저장', hidden: true }).closest('[aria-hidden]')).not.toBeNull();
  });

  it('운영이면 다른 묶음의 조작은 흐림 처리 뒤에 숨는다', () => {
    show('production');
    fireEvent.click(screen.getByRole('button', { name: '빠른 프리셋' }));
    expect(screen.getByRole('button', { name: '메갈로돈 네임드 직전', hidden: true }).closest('[aria-hidden]')).not.toBeNull();
  });

  it('알 수 없는 환경도 운영처럼 막는다', () => {
    show('');
    expect(screen.getAllByText(/운영 서버다/).length).toBeGreaterThan(0);
  });

  it('스테이징이면 빠른 프리셋부터 열리고 막지 않는다', () => {
    show('preview');
    expect(screen.queryByText(/운영 서버다/)).toBeNull();
    expect(screen.getByRole('button', { name: '메갈로돈 네임드 직전' }).closest('[aria-hidden]')).toBeNull();
  });
});

describe('6개 묶음과 기능 UI', () => {
  it('검색어와 구역 필터로 프리셋을 거른다', () => {
    show('local');
    fireEvent.change(screen.getByLabelText('개발 도구 검색'), { target: { value: 'v0.20' } });
    expect(screen.getByRole('button', { name: 'v0.20.0 신콘텐츠 QA 패키지' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '메갈로돈 네임드 직전' })).toBeNull();
  });

  it('이동·시간 묶음에서 낮/밤 3단 스위치와 순간이동 버튼이 동작한다', async () => {
    const onTeleportBase = vi.fn().mockResolvedValue(true);
    const onTeleportSpot = vi.fn().mockResolvedValue(true);
    show('preview', { onTeleportBase, onTeleportSpot });
    fireEvent.click(screen.getByRole('button', { name: '이동·시간' }));

    // 낮/밤 3단 스위치는 프리뷰에서도 동작한다 (분 슬라이더는 로컬 전용)
    expect(screen.queryByLabelText('주기 내 시각 (분)')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '밤 고정' }));
    expect(getPhaseOverride()).toBe('night');
    fireEvent.click(screen.getByRole('button', { name: '낮 고정' }));
    expect(getPhaseOverride()).toBe('day');
    fireEvent.click(screen.getByRole('button', { name: '실제' }));
    expect(getPhaseOverride()).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /부산항/ }));
    await waitFor(() => expect(onTeleportBase).toHaveBeenCalledWith('harbor'));
    fireEvent.click(screen.getByRole('button', { name: /마을 연못/ }));
    await waitFor(() => expect(onTeleportSpot).toHaveBeenCalledWith('pond'));
  });

  it('수배 묶음에 네임드별 출현 해역 동적 안내가 표시된다', () => {
    show('local');
    fireEvent.click(screen.getByRole('button', { name: '수배' }));
    expect(screen.getByText(/아다마스토르\(남대서양 · 남대서양 용승대 전용\)/)).toBeInTheDocument();
    expect(screen.getByText(/구아반세스\(북대서양 · 버뮤다 삼각지대 전용\)/)).toBeInTheDocument();
  });

  it('계정·스냅샷 묶음에서 스냅샷 저장·복원과 관리자 전용 문구를 확인한다', () => {
    const { dispatch } = show('local');
    fireEvent.click(screen.getByRole('button', { name: '계정·스냅샷' }));
    expect(screen.getByText(/관리자 전용/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('스냅샷 이름'), { target: { value: '백업1' } });
    fireEvent.click(screen.getByRole('button', { name: '현재 상태 저장' }));
    expect(screen.getByText('백업1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '복원' }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'debug',
      command: 'snapshot.restore',
    }));
  });
});
