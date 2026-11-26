import { describe, expect, it } from 'vitest';
import { FILTER_CHANNELS, isChannelShown, parseMessageFilter, serializeMessageFilter, toggleChannel } from './messageFilter';

describe('메시지 창 채널 표시', () => {
  it('토글 순서는 전체, 지역, 길드, 시스템이다', () => {
    expect(FILTER_CHANNELS).toEqual(['global', 'local', 'guild', 'system']);
  });

  it('모두 켜진 상태에서 하나를 끄면 나머지가 보인다', () => {
    expect(toggleChannel(FILTER_CHANNELS, 'global')).toEqual(['local', 'guild', 'system']);
    expect(toggleChannel(FILTER_CHANNELS, 'local')).toEqual(['global', 'guild', 'system']);
    expect(toggleChannel(FILTER_CHANNELS, 'guild')).toEqual(['global', 'local', 'system']);
  });

  it('마지막으로 켜져 있는 하나는 끌 수 없다', () => {
    expect(toggleChannel(['global'], 'global')).toEqual(['global']);
    expect(toggleChannel(['local'], 'local')).toEqual(['local']);
    expect(toggleChannel(['guild'], 'guild')).toEqual(['guild']);
    // 기록에 길드 글줄이 없으면 켜진 길드 채널은 셈하지 않는다
    expect(toggleChannel(['local', 'guild'], 'local', ['local', 'system'])).toEqual(['local', 'guild']);
  });

  it('꺼진 채널을 켜면 토글 순서대로 더한다', () => {
    expect(toggleChannel(['system'], 'global')).toEqual(['global', 'system']);
    expect(toggleChannel(['global', 'local', 'system'], 'guild')).toEqual(FILTER_CHANNELS);
  });

  it('표시 여부는 켜진 채널인지다', () => {
    expect(isChannelShown(FILTER_CHANNELS, 'guild')).toBe(true);
    expect(isChannelShown(['system'], 'local')).toBe(false);
  });

  it('저장값을 읽고 쓴다. 없거나 알 수 없으면 전체이고, 이전 chat 저장값은 global과 local을 함께 켠다', () => {
    expect(parseMessageFilter(null)).toEqual(FILTER_CHANNELS);
    expect(parseMessageFilter('etc')).toEqual(FILTER_CHANNELS);
    expect(parseMessageFilter('all')).toEqual(FILTER_CHANNELS);
    expect(parseMessageFilter('chat')).toEqual(['global', 'local']);
    expect(parseMessageFilter('chat,system')).toEqual(['global', 'local', 'system']);
    expect(parseMessageFilter(serializeMessageFilter(['local', 'guild', 'system']))).toEqual(['local', 'guild', 'system']);
  });
});
