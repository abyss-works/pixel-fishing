import { afterEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ hidden: true, enabled: true, permission: 'granted' as NotificationPermission }));
const calls = vi.hoisted(() => ({ flash: [] as string[], notify: [] as string[] }));

vi.mock('../../../platform/api/attention', () => ({
  isPageHidden: () => env.hidden,
  getUpdateAlertEnabled: () => env.enabled,
  notificationPermission: () => env.permission,
  flashTitle: (text: string) => { calls.flash.push(text); },
  showNotification: ({ tag }: { tag: string }) => { calls.notify.push(tag); },
}));

import { alertUpdate } from './updateAlert';

afterEach(() => {
  Object.assign(env, { hidden: true, enabled: true, permission: 'granted' });
  calls.flash = []; calls.notify = [];
});

describe('alertUpdate', () => {
  it('다른 화면을 보고 있으면 탭 제목을 깜빡이고, 알림을 켜고 허용했으면 시스템 알림도 보낸다', () => {
    alertUpdate();
    expect(calls).toEqual({ flash: ['업데이트'], notify: ['pf-update'] });
  });

  it('알림을 꺼 두었으면 제목만 깜빡인다', () => {
    env.enabled = false;
    alertUpdate();
    expect(calls).toEqual({ flash: ['업데이트'], notify: [] });
  });

  it('게임 화면을 보고 있으면 알리지 않는다', () => {
    env.hidden = false;
    alertUpdate();
    expect(calls).toEqual({ flash: [], notify: [] });
  });
});
