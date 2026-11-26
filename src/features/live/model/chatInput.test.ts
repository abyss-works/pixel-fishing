import { describe, expect, it } from 'vitest';
import { CHAT_INPUT_INITIAL, chatInputReducer, chatRoomOf, formatStatusNotice } from './chatInput';
import type { ChatInputState } from './chatInput';

const typing = (room: ChatInputState['room'] = 'local'): ChatInputState => ({ mode: 'typing', room });

describe('채팅 입력 상태머신', () => {
  it('처음에는 닫혀 있고 지역 방으로 보낸다', () => {
    expect(CHAT_INPUT_INITIAL).toEqual({ mode: 'closed', room: 'local' });
  });

  it('열기와 닫기는 입력 상태만 바꾸고 고른 방은 유지한다', () => {
    const opened = chatInputReducer({ mode: 'closed', room: 'guild' }, { type: 'open' });
    expect(opened).toEqual({ mode: 'typing', room: 'guild' });
    expect(chatInputReducer(opened, { type: 'close' })).toEqual({ mode: 'closed', room: 'guild' });
  });

  it('입력 중 Tab은 길드원이면 전체 -> 지역 -> 길드 순으로 바꾼다', () => {
    const local = chatInputReducer(typing('global'), { type: 'tab', inGuild: true });
    expect(local).toEqual(typing('local'));
    const guild = chatInputReducer(local, { type: 'tab', inGuild: true });
    expect(guild).toEqual(typing('guild'));
    expect(chatInputReducer(guild, { type: 'tab', inGuild: true })).toEqual(typing('global'));
  });

  it('길드가 없으면 입력 중 Tab으로 전체와 지역 사이만 오간다', () => {
    const global = chatInputReducer(typing('local'), { type: 'tab', inGuild: false });
    expect(global).toEqual(typing('global'));
    expect(chatInputReducer(global, { type: 'tab', inGuild: false })).toEqual(typing('local'));
  });

  it('닫힌 상태의 Tab은 아무것도 바꾸지 않는다', () => {
    const s: ChatInputState = { mode: 'closed', room: 'local' };
    expect(chatInputReducer(s, { type: 'tab', inGuild: true })).toBe(s);
  });

  it('방 버튼은 입력 상태와 무관하게 길드 소속에 맞춰 방을 순환한다', () => {
    const s1 = chatInputReducer({ mode: 'closed', room: 'global' }, { type: 'toggleRoom', inGuild: true });
    expect(s1).toEqual({ mode: 'closed', room: 'local' });
    const s2 = chatInputReducer(s1, { type: 'toggleRoom', inGuild: true });
    expect(s2).toEqual({ mode: 'closed', room: 'guild' });
    expect(chatInputReducer(s2, { type: 'toggleRoom', inGuild: true })).toEqual({ mode: 'closed', room: 'global' });

    const ng1 = chatInputReducer({ mode: 'closed', room: 'local' }, { type: 'toggleRoom', inGuild: false });
    expect(ng1).toEqual({ mode: 'closed', room: 'global' });
    expect(chatInputReducer(ng1, { type: 'toggleRoom', inGuild: false })).toEqual({ mode: 'closed', room: 'local' });
  });

  it('보낼 방은 길드를 떠나면 길드 선택만 지역으로 폴백하고 전체·지역은 유지한다', () => {
    expect(chatRoomOf(typing('guild'), true)).toBe('guild');
    expect(chatRoomOf(typing('guild'), false)).toBe('local');
    expect(chatRoomOf(typing('global'), false)).toBe('global');
    expect(chatRoomOf(typing('local'), false)).toBe('local');
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
