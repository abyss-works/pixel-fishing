import { describe, expect, it } from 'vitest';
import {
  foldInitial, isFolded, messageFoldReducer, parseSeaFolded, scanPosts, serializeSeaFolded,
} from './messageFold';
import type { FoldState } from './messageFold';

const at = (s: FoldState, ...events: Parameters<typeof messageFoldReducer>[1][]) =>
  events.reduce(messageFoldReducer, s);

describe('메시지 창 접기 상태', () => {
  it('바다는 저장값으로, 거점은 늘 접힘으로 시작한다', () => {
    expect(isFolded(foldInitial('sea', false))).toBe(false);
    expect(isFolded(foldInitial('sea', true))).toBe(true);
    expect(isFolded(foldInitial('base', false))).toBe(true);
  });

  it('거점에 들어가면 접히고, 바다로 나가면 바다에서 쓰던 상태로 돌아간다', () => {
    const sea = foldInitial('sea', false);
    const base = at(sea, { type: 'enter', place: 'base' });
    expect(isFolded(base)).toBe(true);
    const unfoldedInBase = at(base, { type: 'toggle' });
    expect(isFolded(unfoldedInBase)).toBe(false);
    expect(isFolded(at(unfoldedInBase, { type: 'enter', place: 'sea' }))).toBe(false);
    const foldedSea = at(foldInitial('sea', true), { type: 'enter', place: 'base' }, { type: 'toggle' }, { type: 'enter', place: 'sea' });
    expect(isFolded(foldedSea)).toBe(true);
  });

  it('거점에 다시 들어가면 펼쳐 뒀어도 다시 접힌다', () => {
    const s = at(foldInitial('base', false), { type: 'toggle' }, { type: 'enter', place: 'sea' }, { type: 'enter', place: 'base' });
    expect(isFolded(s)).toBe(true);
  });

  it('바다에서 접거나 펼친 상태는 바다 상태로 남는다', () => {
    const s = at(foldInitial('sea', false), { type: 'toggle' });
    expect(s.sea).toBe(true);
    expect(at(s, { type: 'enter', place: 'base' }).sea).toBe(true);
  });

  it('접힘에서 입력을 시작하면 임시로 펼쳐지고 끝나면 직전 상태로 돌아간다', () => {
    const folded = foldInitial('base', false);
    const typing = at(folded, { type: 'typing', on: true });
    expect(isFolded(typing)).toBe(false);
    expect(isFolded(at(typing, { type: 'typing', on: false }))).toBe(true);
  });

  it('펼침에서 입력하면 펼침 그대로다', () => {
    const open = foldInitial('sea', false);
    const typing = at(open, { type: 'typing', on: true });
    expect(isFolded(typing)).toBe(false);
    expect(isFolded(at(typing, { type: 'typing', on: false }))).toBe(false);
  });

  it('입력 중 임시 펼침에서 접기 버튼을 누르면 접힌 채로 남는다', () => {
    const s = at(foldInitial('sea', false), { type: 'typing', on: true }, { type: 'toggle' });
    expect(isFolded(s)).toBe(true);
    expect(s.sea).toBe(true);
  });

  it('접힌 동안 새 글이 오면 표시가 켜지고 펼치면 꺼진다', () => {
    const folded = foldInitial('base', false);
    const dotted = at(folded, { type: 'post' });
    expect(dotted.unread).toBe(true);
    expect(at(dotted, { type: 'toggle' }).unread).toBe(false);
  });

  it('펼쳐 있거나 입력 중에는 새 글 표시를 켜지 않는다', () => {
    expect(at(foldInitial('sea', false), { type: 'post' }).unread).toBe(false);
    expect(at(foldInitial('base', false), { type: 'typing', on: true }, { type: 'post' }).unread).toBe(false);
  });

  it('입력을 시작해 펼쳐지면 새 글 표시가 꺼진다', () => {
    const s = at(foldInitial('base', false), { type: 'post' }, { type: 'typing', on: true });
    expect(s.unread).toBe(false);
  });

  it('장소를 옮기면 새 글 표시가 꺼진다', () => {
    expect(at(foldInitial('base', false), { type: 'post' }, { type: 'enter', place: 'sea' }).unread).toBe(false);
  });

  it('바뀌지 않는 전이는 같은 상태 객체를 돌려준다', () => {
    const s = foldInitial('sea', false);
    expect(messageFoldReducer(s, { type: 'enter', place: 'sea' })).toBe(s);
    expect(messageFoldReducer(s, { type: 'typing', on: false })).toBe(s);
    expect(messageFoldReducer(s, { type: 'post' })).toBe(s);
  });
});

describe('바다 접힘 저장값', () => {
  it('접힘만 1로 저장하고 없거나 알 수 없는 값은 펼침으로 읽는다', () => {
    expect(serializeSeaFolded(true)).toBe('1');
    expect(serializeSeaFolded(false)).toBe('0');
    expect(parseSeaFolded('1')).toBe(true);
    expect(parseSeaFolded('0')).toBe(false);
    expect(parseSeaFolded(null)).toBe(false);
    expect(parseSeaFolded('x')).toBe(false);
  });
});

describe('새 글 판정', () => {
  const log = [
    { at: 100, channel: 'system' as const },
    { at: 200, channel: 'chat' as const },
    { at: 300, channel: 'guild' as const },
  ];
  it('기준 시각 뒤에 켜 둔 채널에 온 글이 있으면 새 글이다', () => {
    expect(scanPosts(log, ['chat', 'guild', 'system'], 250)).toEqual({ fresh: true, since: 300 });
  });
  it('꺼 둔 채널의 글은 새 글이 아니지만 기준 시각은 넘어간다', () => {
    expect(scanPosts(log, ['chat', 'system'], 250)).toEqual({ fresh: false, since: 300 });
  });
  it('기록이 비었거나 모두 이전 글이면 새 글이 아니고 기준 시각은 그대로다', () => {
    expect(scanPosts([], ['chat'], 50)).toEqual({ fresh: false, since: 50 });
    expect(scanPosts(log, ['chat', 'guild', 'system'], 300)).toEqual({ fresh: false, since: 300 });
  });
});
