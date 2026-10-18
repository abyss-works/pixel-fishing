import { describe, expect, it } from 'vitest';
import { encounterAlertText, shouldAlertEncounter } from './encounterAlert';
import { CHALLENGE_WINDOW_MS } from '../../../game/rules/balance';

describe('조우 알림 문구', () => {
  it('구역 이름과 흔적이 남는 시간을 알린다', () => {
    const text = encounterAlertText('pacific-named-megalodon', CHALLENGE_WINDOW_MS)!;
    expect(text.title).toBe('흔적 발견');
    expect(text.body).toContain('태평양');
    expect(text.body).toContain('4시간');
  });

  it('네임드 이름은 알림에 드러내지 않는다 — 이름은 승부에서 이긴 뒤에 공개된다', () => {
    const text = encounterAlertText('pacific-named-megalodon', CHALLENGE_WINDOW_MS)!;
    expect(`${text.title} ${text.body}`).not.toContain('메갈로돈');
  });

  it('알 수 없는 의뢰나 네임드가 아닌 의뢰는 알리지 않는다', () => {
    expect(encounterAlertText('없는-의뢰', CHALLENGE_WINDOW_MS)).toBeNull();
    expect(encounterAlertText('pacific-easy-common', CHALLENGE_WINDOW_MS)).toBeNull();
  });
});

describe('조우 알림 여부', () => {
  const base = { pageHidden: true, enabled: true, permission: 'granted' as const };

  it('화면을 보고 있으면 아무것도 하지 않는다 — 토스트와 흔적 카드로 충분하다', () => {
    expect(shouldAlertEncounter({ ...base, pageHidden: false })).toEqual({ flash: false, notify: false });
  });

  it('다른 화면을 보고 있으면 제목을 깜빡이고, 켜 두고 허용했으면 시스템 알림도 띄운다', () => {
    expect(shouldAlertEncounter(base)).toEqual({ flash: true, notify: true });
  });

  it('알림을 끄거나 권한이 없으면 제목만 깜빡인다', () => {
    expect(shouldAlertEncounter({ ...base, enabled: false })).toEqual({ flash: true, notify: false });
    expect(shouldAlertEncounter({ ...base, permission: 'default' })).toEqual({ flash: true, notify: false });
    expect(shouldAlertEncounter({ ...base, permission: 'denied' })).toEqual({ flash: true, notify: false });
    expect(shouldAlertEncounter({ ...base, permission: 'unsupported' })).toEqual({ flash: true, notify: false });
  });
});
