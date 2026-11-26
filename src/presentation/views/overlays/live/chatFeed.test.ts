import { describe, expect, it } from 'vitest';
import { chatMessages } from './chatFeed';

describe('chatMessages', () => {
  it('ChatLine의 staffBadge가 있을 때만 Msg에 전달하고 없으면 키를 생략한다', () => {
    const out = chatMessages([
      { id: 1, uid: 'u1', nick: '관리자', text: '안녕', at: '2026-11-27T00:00:00.000Z', staffBadge: 'admin' },
      { id: 2, uid: 'u2', nick: '운영자', text: '반가워', at: '2026-11-27T00:00:01.000Z', staffBadge: 'maintainer' },
      { id: 3, uid: 'u3', nick: '일반', text: '안녕!', at: '2026-11-27T00:00:02.000Z' },
    ], 'global');

    expect(out[0].staffBadge).toBe('admin');
    expect(out[1].staffBadge).toBe('maintainer');
    expect(out[2].staffBadge).toBeUndefined();
    expect('staffBadge' in out[2]).toBe(false);
  });
});
