import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const env = vi.hoisted(() => ({ hidden: true, enabled: true, permission: 'granted' as NotificationPermission }));
const calls = vi.hoisted(() => ({ flash: [] as string[], notify: [] as { title: string; body: string; tag: string }[] }));

vi.mock('../../../platform/api/attention', () => ({
  isPageHidden: () => env.hidden,
  getAlertEnabled: () => env.enabled,
  notificationPermission: () => env.permission,
  flashTitle: (text: string) => { calls.flash.push(text); },
  showNotification: (n: { title: string; body: string; tag: string }) => { calls.notify.push(n); },
}));

import { alertBagFull, useBagFullAlert } from './bagFullAlert';

beforeEach(() => {
  Object.assign(env, { hidden: true, enabled: true, permission: 'granted' });
  calls.flash = []; calls.notify = [];
});
afterEach(() => { document.dispatchEvent(new Event('visibilitychange')); });

const comeBack = () => { env.hidden = false; Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); };
const leave = () => { env.hidden = true; Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); };

describe('alertBagFull', () => {
  it('탭 제목을 깜빡이고, 켜고 허용했으면 시스템 알림도 보낸다', () => {
    alertBagFull();
    expect(calls.flash).toEqual(['가방 가득 참']);
    expect(calls.notify).toEqual([{ title: '가방 가득 참', body: '가방이 가득 찼어요. 돌아와서 가방을 비워 주세요.', tag: 'pf-bag-full' }]);
  });

  it('권한이 없으면 탭 제목만 깜빡인다', () => {
    env.permission = 'default';
    alertBagFull();
    expect(calls.flash).toEqual(['가방 가득 참']);
    expect(calls.notify).toEqual([]);
  });

  it('알림을 꺼 두었으면 탭 제목만 깜빡인다', () => {
    env.enabled = false;
    alertBagFull();
    expect(calls).toMatchObject({ flash: ['가방 가득 참'], notify: [] });
  });
});

describe('useBagFullAlert', () => {
  it('자리를 비운 동안 가방이 가득 차면 한 번 알린다', () => {
    leave();
    const { rerender } = renderHook(({ full }) => useBagFullAlert(full), { initialProps: { full: false } });
    rerender({ full: true });
    expect(calls.flash).toHaveLength(1);
    expect(calls.notify).toHaveLength(1);
  });

  it('돌아오기 전에 가방이 비었다 다시 차도 다시 알리지 않는다', () => {
    leave();
    const { rerender } = renderHook(({ full }) => useBagFullAlert(full), { initialProps: { full: false } });
    rerender({ full: true });
    rerender({ full: false });
    rerender({ full: true });
    expect(calls.flash).toHaveLength(1);
  });

  it('게임 화면으로 돌아왔다 다시 자리를 비우면 다음 가득 참을 알린다', () => {
    leave();
    const { rerender } = renderHook(({ full }) => useBagFullAlert(full), { initialProps: { full: false } });
    rerender({ full: true });
    comeBack();
    rerender({ full: false });
    leave();
    rerender({ full: true });
    expect(calls.flash).toHaveLength(2);
  });

  it('게임 화면을 보는 동안 가득 차면 알리지 않는다', () => {
    env.hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    const { rerender } = renderHook(({ full }) => useBagFullAlert(full), { initialProps: { full: false } });
    rerender({ full: true });
    expect(calls.flash).toEqual([]);
  });

  it('이미 가득 찬 채 자리를 비웠다면 알리지 않는다', () => {
    env.hidden = false;
    const { rerender } = renderHook(({ full }) => useBagFullAlert(full), { initialProps: { full: true } });
    leave();
    rerender({ full: true });
    expect(calls.flash).toEqual([]);
  });
});
