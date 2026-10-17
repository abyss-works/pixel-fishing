import { describe, expect, it } from 'vitest';
import { MESSAGE_KEEP, appendMessage, channelsOf, classifyTone, createMessage } from './messageFeed';

describe('메시지 피드', () => {
  it('메시지는 시각 HH:MM과 채널을 가진다 — 기본 채널은 시스템', () => {
    const m = createMessage(1, '항구에 닿았다.', { now: new Date(2026, 9, 17, 9, 5) });
    expect(m).toMatchObject({ id: 1, ts: '09:05', channel: 'system', tone: 'info' });
    expect(m.author).toBeUndefined();
  });

  it('톤은 명시값이 우선이고, 없으면 문구로 추정한다', () => {
    expect(classifyTone('골드가 부족하다.')).toBe('warn');
    expect(classifyTone('참치 획득!')).toBe('gold');
    expect(createMessage(1, '참치 획득!', { tone: 'info' }).tone).toBe('info');
  });

  it('보관 상한을 넘으면 오래된 것부터 버린다', () => {
    let list = Array.from({ length: MESSAGE_KEEP }, (_, i) => createMessage(i, `m${i}`));
    list = appendMessage(list, createMessage(MESSAGE_KEEP, 'new'));
    expect(list).toHaveLength(MESSAGE_KEEP);
    expect(list[0].id).toBe(1);
    expect(list.at(-1)?.text).toBe('new');
  });

  it('채널 목록은 등장 순서대로 중복 없이 모은다', () => {
    const list = [createMessage(1, 'a'), createMessage(2, 'b')];
    expect(channelsOf(list)).toEqual(['system']);
  });
});
