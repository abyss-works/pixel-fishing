import { describe, expect, it } from 'vitest';
import { CHAT_INPUT_INITIAL, chatInputReducer, chatRoomOf } from './chatInput';
import type { ChatInputState } from './chatInput';

const typing = (room: ChatInputState['room'] = 'world'): ChatInputState => ({ mode: 'typing', room });

describe('채팅 입력 상태머신', () => {
  it('처음에는 닫혀 있고 월드로 보낸다', () => {
    expect(CHAT_INPUT_INITIAL).toEqual({ mode: 'closed', room: 'world' });
  });

  it('열기와 닫기는 입력 상태만 바꾸고 고른 방은 유지한다', () => {
    const opened = chatInputReducer({ mode: 'closed', room: 'guild' }, { type: 'open' });
    expect(opened).toEqual({ mode: 'typing', room: 'guild' });
    expect(chatInputReducer(opened, { type: 'close' })).toEqual({ mode: 'closed', room: 'guild' });
  });

  it('입력 중 Tab은 길드원이면 월드와 길드를 번갈아 바꾼다', () => {
    const guild = chatInputReducer(typing('world'), { type: 'tab', inGuild: true });
    expect(guild).toEqual(typing('guild'));
    expect(chatInputReducer(guild, { type: 'tab', inGuild: true })).toEqual(typing('world'));
  });

  it('길드가 없으면 Tab을 눌러도 월드에 머문다', () => {
    const s = typing('world');
    expect(chatInputReducer(s, { type: 'tab', inGuild: false })).toBe(s);
  });

  it('닫힌 상태의 Tab은 아무것도 바꾸지 않는다', () => {
    const s: ChatInputState = { mode: 'closed', room: 'world' };
    expect(chatInputReducer(s, { type: 'tab', inGuild: true })).toBe(s);
  });

  it('방 버튼은 입력 상태와 무관하게 길드원일 때만 방을 바꾼다', () => {
    expect(chatInputReducer({ mode: 'closed', room: 'world' }, { type: 'toggleRoom', inGuild: true }))
      .toEqual({ mode: 'closed', room: 'guild' });
    const s = typing('world');
    expect(chatInputReducer(s, { type: 'toggleRoom', inGuild: false })).toBe(s);
  });

  it('보낼 방은 길드를 떠나면 고른 방과 무관하게 월드다', () => {
    expect(chatRoomOf(typing('guild'), true)).toBe('guild');
    expect(chatRoomOf(typing('guild'), false)).toBe('world');
  });
});
