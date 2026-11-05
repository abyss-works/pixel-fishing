import { describe, expect, it } from 'vitest';
import { FILTER_CHANNELS, isChannelShown, parseMessageFilter, serializeMessageFilter, toggleChannel } from './messageFilter';

describe('메시지 창 채널 표시', () => {
  it('모두 켜진 상태에서 하나를 끄면 나머지가 보인다', () => {
    expect(toggleChannel(FILTER_CHANNELS, 'chat')).toEqual(['guild', 'system']);
    expect(toggleChannel(FILTER_CHANNELS, 'guild')).toEqual(['chat', 'system']);
  });

  it('마지막으로 켜져 있는 하나는 끌 수 없다', () => {
    expect(toggleChannel(['chat'], 'chat')).toEqual(['chat']);
    expect(toggleChannel(['guild'], 'guild')).toEqual(['guild']);
    // 기록에 길드 글줄이 없으면 켜진 길드 채널은 셈하지 않는다
    expect(toggleChannel(['chat', 'guild'], 'chat', ['chat', 'system'])).toEqual(['chat', 'guild']);
  });

  it('꺼진 채널을 켜면 토글 순서대로 더한다', () => {
    expect(toggleChannel(['system'], 'chat')).toEqual(['chat', 'system']);
    expect(toggleChannel(['chat', 'system'], 'guild')).toEqual(FILTER_CHANNELS);
  });

  it('표시 여부는 켜진 채널인지다', () => {
    expect(isChannelShown(FILTER_CHANNELS, 'guild')).toBe(true);
    expect(isChannelShown(['system'], 'chat')).toBe(false);
  });

  it('저장값을 읽고 쓴다. 없거나 알 수 없으면 전체이고, 이전 형식도 읽는다', () => {
    expect(parseMessageFilter(null)).toEqual(FILTER_CHANNELS);
    expect(parseMessageFilter('etc')).toEqual(FILTER_CHANNELS);
    expect(parseMessageFilter('all')).toEqual(FILTER_CHANNELS);
    expect(parseMessageFilter('chat')).toEqual(['chat']);
    expect(parseMessageFilter(serializeMessageFilter(['guild', 'system']))).toEqual(['guild', 'system']);
  });
});
