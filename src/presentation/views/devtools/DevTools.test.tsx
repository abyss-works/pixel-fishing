// 개발 도구 패널의 운영 런타임 차단 및 6개 묶음·시간/순간이동·스냅샷·계정 도구 UI 검증.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DevTools from './DevTools';
import { DevEnvContext, devEnvOf } from './devEnv';
import { api } from '../../../platform/api';
import { newState } from '../../../game/rules/logic';
import { resetKeyScopes } from '../../ui/hotkeys';
import { resetTimeOverride, getPhaseOverride } from '../../../features/gameplay/service/timeOverride';

beforeEach(() => {
  localStorage.clear();
  resetTimeOverride();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  resetKeyScopes();
  resetTimeOverride();
});

const renderPanel = (env: string, extraProps: Partial<Parameters<typeof DevTools>[0]> = {}) => {
  const dispatch = vi.fn().mockResolvedValue({ status: 'ok', state: newState(), result: { type: 'none' } });
  render(
    <DevEnvContext.Provider value={devEnvOf(env)}>
      <DevTools game={newState()} dispatch={dispatch} setToast={() => {}} granted={false} {...extraProps} />
    </DevEnvContext.Provider>,
  );
  return { dispatch };
};

const show = (env: string, extraProps: Partial<Parameters<typeof DevTools>[0]> = {}) => {
  const res = renderPanel(env, extraProps);
  fireEvent.click(screen.getByRole('button', { name: '개발 도구' }));
  return res;
};

describe('개발 도구 운영 가드', () => {
  it('운영(production) 환경에서는 granted가 참이어도 버튼과 패널을 렌더링하지 않고 F9도 무시한다', () => {
    renderPanel('production', { granted: true });
    expect(screen.queryByRole('button', { name: '개발 도구' })).toBeNull();
    fireEvent.keyDown(document, { key: 'F9' });
    expect(screen.queryByRole('dialog', { name: '개발 도구' })).toBeNull();
  });

  it('알 수 없는 환경도 렌더링하지 않는다', () => {
    renderPanel('', { granted: true });
    expect(screen.queryByRole('button', { name: '개발 도구' })).toBeNull();
  });

  it('스테이징(preview)이면 제한 안내 없이 빠른 프리셋부터 열린다', () => {
    show('preview');
    expect(screen.queryByText(/운영 서버다/)).toBeNull();
    expect(screen.getByRole('button', { name: '메갈로돈 네임드 직전' })).toBeInTheDocument();
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

    // 낮/밤 3단 스위치는 프리뷰에서도 동작한다 (시각 슬라이더는 로컬 전용)
    expect(screen.queryByLabelText('주기 내 시각 (10게임분)')).toBeNull();
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

  it('로컬 모드에서 25초 스텝 단위 슬라이더가 0~143 범위로 동작하고 낮/밤 막대 비율을 22시~06시 주기로 표시한다', () => {
    const { container } = (() => {
      show('local');
      fireEvent.click(screen.getByRole('button', { name: '이동·시간' }));
      return { container: document.body };
    })();

    const slider = screen.getByLabelText('주기 내 시각 (10게임분)') as HTMLInputElement;
    expect(slider.min).toBe('0');
    expect(slider.max).toBe('143');
    expect(slider.step).toBe('1');

    fireEvent.change(slider, { target: { value: '132' } }); // 55분 00초 = 게임 22:00 (밤 시작)
    expect(screen.getByText('22:00')).toBeInTheDocument();
    expect(screen.getByText('밤')).toBeInTheDocument();

    fireEvent.change(slider, { target: { value: '36' } }); // 15분 00초 = 게임 06:00 (낮 시작)
    expect(screen.getByText('06:00')).toBeInTheDocument();
    expect(screen.getByText('낮')).toBeInTheDocument();

    const segments = [...container.querySelectorAll('.rounded-full > span > span, .rounded-full > span')]
      .filter(el => (el as HTMLElement).style.width);
    expect(segments.map(el => parseFloat((el as HTMLElement).style.width))).toEqual([
      25,
      expect.closeTo((40 / 60) * 100, 3),
      expect.closeTo((5 / 60) * 100, 3),
    ]);
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

  it('계정·스냅샷 묶음의 계정 도구 3종 버튼이 승격·초기화·새 게스트 동작과 실행 기록을 수행한다', async () => {
    const promoteSpy = vi.spyOn(api.dev, 'promoteTestAccount')
      .mockResolvedValueOnce({ ok: true, email: 'qa-stage@pixel-fishing.test', isAnonymous: false })
      .mockResolvedValueOnce({ ok: false, msg: 'already permanent' });
    const resetState = { ...newState(), gold: 777 };
    const resetSpy = vi.spyOn(api.dev, 'resetDevAccount').mockResolvedValue({ state: resetState, version: 3 });
    const signOutSpy = vi.spyOn(api.auth, 'signOut').mockResolvedValue();
    const onAccountPromoted = vi.fn();
    const onAccountReset = vi.fn();
    const onReload = vi.fn();

    show('preview', { onAccountPromoted, onAccountReset, onReload });
    fireEvent.click(screen.getByRole('button', { name: '계정·스냅샷' }));

    fireEvent.click(screen.getByRole('button', { name: '테스트 정식 계정 승격' }));
    await waitFor(() => expect(onAccountPromoted).toHaveBeenCalledWith('qa-stage@pixel-fishing.test'));
    expect(screen.getByLabelText('실행 기록')).toHaveTextContent('테스트 정식 계정 승격 (qa-stage@pixel-fishing.test)');

    fireEvent.click(screen.getByRole('button', { name: '테스트 정식 계정 승격' }));
    await waitFor(() => expect(promoteSpy).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('실행 기록')).toHaveTextContent('테스트 정식 계정 승격 실패: already permanent');

    fireEvent.click(screen.getByRole('button', { name: '현재 계정 초기화' }));
    await waitFor(() => expect(onAccountReset).toHaveBeenCalledWith(resetState));
    expect(resetSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('실행 기록')).toHaveTextContent('현재 계정 초기화 (v3)');

    fireEvent.click(screen.getByRole('button', { name: '새 게스트 시작' }));
    await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1));
    expect(signOutSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('실행 기록')).toHaveTextContent('새 게스트 시작');
  });
});
