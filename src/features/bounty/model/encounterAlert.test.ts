import { describe, expect, it } from 'vitest';
import { encounterAlertText } from './encounterAlert';

describe('조우 알림 문구', () => {
  it('구역 이름과 흔적이 남는 시간을 알린다', () => {
    const text = encounterAlertText('pacific-named-megalodon')!;
    expect(text.title).toBe('흔적 발견');
    expect(text.body).toContain('태평양');
    expect(text.body).toContain('다음 날 새벽 4시까지');
  });

  it('네임드 이름은 알림에 드러내지 않는다 — 이름은 승부에서 이긴 뒤에 공개된다', () => {
    const text = encounterAlertText('pacific-named-megalodon')!;
    expect(`${text.title} ${text.body}`).not.toContain('메갈로돈');
  });

  it('알 수 없는 의뢰나 네임드가 아닌 의뢰는 알리지 않는다', () => {
    expect(encounterAlertText('없는-의뢰')).toBeNull();
    expect(encounterAlertText('pacific-easy-common')).toBeNull();
  });
});
