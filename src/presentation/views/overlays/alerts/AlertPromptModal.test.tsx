// 브라우저 알림 안내 카드 - 항목 순서, 나중에·닫기 X·허용 동작, 모두 끄면 허용이 흐려지는 것
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { resetAlerts } from '../../../../platform/api/attention';
import { resetAlertPrompt } from '../../../../features/alerts/service/alertPrompt';
import { resetSoundSettings } from '../../../../features/sound/service/useSound';
import AlertPromptModal from './AlertPromptModal';

const api = {
  permission: 'default' as NotificationPermission,
  answer: 'granted' as NotificationPermission,
  requestPermission: vi.fn(async () => { api.permission = api.answer; return api.permission; }),
};
const setToast = vi.fn();
const stored = () => ['pf-encounter-alert', 'pf-bag-full-alert', 'pf-update-alert'].map(k => localStorage.getItem(k));
const mount = () => render(<AlertPromptModal ready after={false} setToast={setToast} />);

beforeEach(() => {
  localStorage.clear();
  resetAlerts();
  resetAlertPrompt();
  resetSoundSettings();
  api.permission = 'default';
  api.answer = 'granted';
  api.requestPermission.mockClear();
  setToast.mockClear();
  vi.stubGlobal('Notification', api);
});
afterEach(() => { cleanup(); resetSoundSettings(); vi.unstubAllGlobals(); });

describe('AlertPromptModal', () => {
  it('세 알림을 네임드, 가방, 업데이트 순으로 두고 처음에는 모두 켜 둔다', () => {
    mount();
    const chips = screen.getAllByRole('button', { pressed: true });
    expect(chips.map(b => b.getAttribute('aria-label'))).toEqual(['네임드와 조우했을 때', '가방이 가득 찼을 때', '업데이트가 나왔을 때']);
  });

  it('나중에는 세 알림을 모두 끄고 닫는다 - 권한은 묻지 않는다', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: '나중에' }));
    expect(stored()).toEqual(['off', 'off', 'off']);
    expect(api.requestPermission).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('닫기 X는 나중에와 같다', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /닫기/ }));
    expect(stored()).toEqual(['off', 'off', 'off']);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('허용은 켠 알림만 켜서 저장하고 이 클릭에서 권한을 묻는다', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: '가방이 가득 찼을 때' }));
    fireEvent.click(screen.getByRole('button', { name: '허용' }));
    expect(api.requestPermission).toHaveBeenCalledTimes(1);
    expect(stored()).toEqual(['on', 'off', 'on']);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(setToast).not.toHaveBeenCalled();
  });

  it('세 알림을 모두 끄면 허용이 흐려진다', () => {
    mount();
    for (const name of ['네임드와 조우했을 때', '가방이 가득 찼을 때', '업데이트가 나왔을 때']) fireEvent.click(screen.getByRole('button', { name }));
    expect(screen.getByRole('button', { name: '허용' })).toBeDisabled();
  });

  it('브라우저가 거절하면 메시지 줄로 이유를 알린다', async () => {
    api.answer = 'denied';
    mount();
    fireEvent.click(screen.getByRole('button', { name: '허용' }));
    await waitFor(() => expect(setToast).toHaveBeenCalledTimes(1));
  });

  it('항목을 끄면 아이콘과 라벨을 흐린 비활성 색으로 표시한다', () => {
    mount();
    const labelText = screen.getByText('가방이 가득 찼을 때');
    expect(labelText).toHaveClass('text-text');
    expect(labelText).not.toHaveClass('text-text-dim');

    fireEvent.click(screen.getByRole('button', { name: '가방이 가득 찼을 때' }));
    expect(labelText).toHaveClass('text-text-dim', 'grayscale', 'brightness-75');
    expect(labelText.querySelector('[data-glyph="backpack"]')).not.toHaveClass('text-gold');
  });

  it('앞 차례 안내 창이 남아 있으면 뜨지 않는다', () => {
    render(<AlertPromptModal ready after setToast={setToast} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('소리 구획은 배경음·효과음을 기본 꺼짐으로 두고, 나중에·닫기 X를 눌러도 소리 선택을 초기화하지 않는다', () => {
    mount();
    const bgmBtn = screen.getByRole('button', { name: '배경음' });
    const sfxBtn = screen.getByRole('button', { name: '효과음' });
    expect(bgmBtn).toHaveAttribute('aria-pressed', 'false');
    expect(bgmBtn).toHaveTextContent('꺼짐');
    expect(sfxBtn).toHaveAttribute('aria-pressed', 'false');
    expect(sfxBtn).toHaveTextContent('꺼짐');

    fireEvent.click(bgmBtn);
    expect(bgmBtn).toHaveAttribute('aria-pressed', 'true');
    expect(bgmBtn).toHaveTextContent('켜짐');
    expect(localStorage.getItem('pf-sound-bgm')).toBe('on');

    fireEvent.click(screen.getByRole('button', { name: '나중에' }));
    expect(stored()).toEqual(['off', 'off', 'off']);
    expect(localStorage.getItem('pf-sound-bgm')).toBe('on');
    expect(localStorage.getItem('pf-sound-sfx')).toBeNull();
  });

  it('소리 토글은 닫기 X를 눌러도 독립적으로 저장소에 남는다', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: '효과음' }));
    fireEvent.click(screen.getByRole('button', { name: /닫기/ }));
    expect(stored()).toEqual(['off', 'off', 'off']);
    expect(localStorage.getItem('pf-sound-sfx')).toBe('on');
  });
});
