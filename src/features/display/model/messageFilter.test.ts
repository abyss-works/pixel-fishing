import { describe, expect, it } from 'vitest';
import { isChannelShown, parseMessageFilter, toggleChannel } from './messageFilter';

describe('메시지 창 채널 표시', () => {
  it('둘 다 켜진 상태에서 하나를 끄면 다른 하나만 보인다', () => {
    expect(toggleChannel('all', 'chat')).toBe('system');
    expect(toggleChannel('all', 'system')).toBe('chat');
  });

  it('마지막으로 켜져 있는 하나는 끌 수 없다', () => {
    expect(toggleChannel('chat', 'chat')).toBe('chat');
    expect(toggleChannel('system', 'system')).toBe('system');
  });

  it('꺼진 채널을 켜면 둘 다 보인다', () => {
    expect(toggleChannel('chat', 'system')).toBe('all');
    expect(toggleChannel('system', 'chat')).toBe('all');
  });

  it('표시 여부는 전체이거나 그 채널일 때만 참이다', () => {
    expect(isChannelShown('all', 'chat')).toBe(true);
    expect(isChannelShown('system', 'chat')).toBe(false);
    expect(isChannelShown('chat', 'chat')).toBe(true);
  });

  it('저장값이 없거나 알 수 없으면 전체다', () => {
    expect(parseMessageFilter(null)).toBe('all');
    expect(parseMessageFilter('etc')).toBe('all');
    expect(parseMessageFilter('chat')).toBe('chat');
  });
});
