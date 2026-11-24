import { describe, expect, it } from 'vitest';
import { CHAT_INPUT_INITIAL, chatInputReducer, chatRoomOf, formatStatusNotice } from './chatInput';
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

describe('채팅 오류 안내 문장 줄바꿈', () => {
  it('두 문장 이상이면 문장 끝마다 줄을 바꾼다', () => {
    expect(formatStatusNotice('메시지를 너무 빨리 보내고 있어요. 잠시 뒤에 보내 주세요.'))
      .toBe('메시지를 너무 빨리 보내고 있어요.\n잠시 뒤에 보내 주세요.');
    expect(formatStatusNotice('연결이 끊겼어요! 잠시 뒤 다시 시도해 주세요? 네.'))
      .toBe('연결이 끊겼어요!\n잠시 뒤 다시 시도해 주세요?\n네.');
  });

  it('한 문장이나 이미 줄바꿈된 안내는 그대로 둔다', () => {
    expect(formatStatusNotice('이용이 제한된 계정이라 채팅을 쓸 수 없어요.'))
      .toBe('이용이 제한된 계정이라 채팅을 쓸 수 없어요.');
    expect(formatStatusNotice('첫째 문장이에요.\n둘째 문장이에요.'))
      .toBe('첫째 문장이에요.\n둘째 문장이에요.');
  });

  it('소수점이나 Lv.5처럼 공백 없는 마침표에서는 줄을 바꾸지 않는다', () => {
    expect(formatStatusNotice('Lv.5부터 쓸 수 있어요.')).toBe('Lv.5부터 쓸 수 있어요.');
  });
});
