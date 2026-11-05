import { describe, expect, it } from 'vitest';
import { MESSAGE_KEEP, appendMessage, channelsOf, createMessage, isAtBottom, mergeMessages } from './messageFeed';
import { REJECT_TEXT } from '../../../game/rules/rules';

describe('메시지 피드', () => {
  it('메시지는 시각 HH:MM과 채널을 가진다 — 기본 채널은 시스템', () => {
    const m = createMessage(1, '항구에 닿았다.', { now: new Date(2026, 9, 17, 9, 5) });
    expect(m).toMatchObject({ id: 1, ts: '09:05', channel: 'system', tone: 'info' });
    expect(m.author).toBeUndefined();
  });

  it('톤은 부르는 쪽이 넘긴 값을 그대로 쓴다 — 세 톤 모두', () => {
    expect(createMessage(1, REJECT_TEXT['not-enough-gold'], { tone: 'warn' }).tone).toBe('warn');
    expect(createMessage(2, '일반 등급 [붕어] 획득!', { tone: 'gold' }).tone).toBe('gold');
    expect(createMessage(3, '태평양에 들어섰어요.', { tone: 'info' }).tone).toBe('info');
  });

  it('톤을 넘기지 않으면 문구와 무관하게 info다 — 문구로 톤을 추정하지 않는다', () => {
    for (const text of [REJECT_TEXT['not-enough-gold'], '전시 중에는 팔리지 않아요.', '참치 획득!']) {
      expect(createMessage(1, text).tone).toBe('info');
    }
  });

  it('보관 상한을 넘으면 오래된 것부터 버린다', () => {
    let list = Array.from({ length: MESSAGE_KEEP }, (_, i) => createMessage(i, `m${i}`));
    list = appendMessage(list, createMessage(MESSAGE_KEEP, 'new'));
    expect(list).toHaveLength(MESSAGE_KEEP);
    expect(list[0].id).toBe(1);
    expect(list.at(-1)?.text).toBe('new');
  });

  it('맨 아래에서 여유 안쪽이면 맨 아래를 보고 있는 것으로 친다', () => {
    expect(isAtBottom({ scrollHeight: 500, scrollTop: 400, clientHeight: 100 })).toBe(true);
    expect(isAtBottom({ scrollHeight: 500, scrollTop: 395, clientHeight: 100 })).toBe(true);
    expect(isAtBottom({ scrollHeight: 500, scrollTop: 300, clientHeight: 100 })).toBe(false);
    expect(isAtBottom({ scrollHeight: 100, scrollTop: 0, clientHeight: 100 })).toBe(true);
  });

  it('채널 목록은 등장 순서대로 중복 없이 모은다', () => {
    const list = [createMessage(1, 'a'), createMessage(2, 'b')];
    expect(channelsOf(list)).toEqual(['system']);
  });

  it('채널이 다른 기록은 만든 시각 순으로 합치고, 같은 시각이면 앞 기록이 먼저다', () => {
    const t = (min: number) => new Date(2026, 9, 17, 9, min);
    const system = [createMessage(1, '가', { now: t(1) }), createMessage(2, '다', { now: t(3) })];
    const chat = [createMessage(1, '나', { channel: 'chat', author: '가람', now: t(2), from: { uid: 'u', chatId: 1 } }),
      createMessage(2, '라', { channel: 'chat', now: t(3) })];
    expect(mergeMessages(system, chat).map(m => m.text)).toEqual(['가', '나', '다', '라']);
    expect(mergeMessages(system, [])).toEqual(system);
  });
});
