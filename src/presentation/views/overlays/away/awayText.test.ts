// 방치 결과 보고 문구 — 놓아줌과 기운으로 바꿈이 섞이는 경우를 가른다.
import { describe, expect, it } from 'vitest';
import { summarizeAway } from '../../../../game/rules/away';
import type { AwayEvent } from '../../../../game/rules/away';
import { bagFullText, bagTimelineText } from './awayText';

const T0 = '2026-11-05T05:00:00.000Z';
const at = (min: number) => new Date(Date.parse(T0) + min * 60_000).toISOString();
const W = { from: T0, to: at(134), awayMs: 134 * 60_000 };
const release = (min: number): AwayEvent => ({
  type: 'autoRelease', at: at(min),
  payload: { uids: ['r'], reason: 'bag-full', fish: [{ uid: 'r', fishId: 'mackerel', form: 'normal' }] },
});
const extract = (min: number, uids: string[]): AwayEvent => ({
  type: 'autoExtractEnergy', at: at(min),
  payload: { uids, reason: 'bag-full', energy: { common: uids.length } },
});

describe('가방이 찼을 때의 한 줄', () => {
  it('놓아주기만 있으면 기존 문구 그대로다', () => {
    expect(bagFullText(summarizeAway([release(92)], W))).toBe('1시간 32분 만에 가방이 차서 1마리를 놓아줬어요.');
  });

  it('기운으로 바꾸기만 있으면 기운 문구를 쓴다', () => {
    expect(bagFullText(summarizeAway([extract(92, ['a', 'b'])], W)))
      .toBe('1시간 32분 만에 가방이 차서 2마리를 생명의 기운으로 바꿨어요.');
  });

  it('둘 다 있으면 한 문장으로 잇는다', () => {
    expect(bagFullText(summarizeAway([extract(92, ['a', 'b']), release(100)], W)))
      .toBe('1시간 32분 만에 가방이 차서 2마리를 생명의 기운으로 바꾸고 1마리를 놓아줬어요.');
  });

  it('떠날 때 이미 차 있었으면 시간 대신 이미 차 있음으로 시작한다', () => {
    expect(bagFullText(summarizeAway([extract(0, ['a'])], W)))
      .toBe('가방이 이미 차 있어서 1마리를 생명의 기운으로 바꿨어요.');
  });

  it('가방이 차지 않았으면 null이다', () => {
    expect(bagFullText(summarizeAway([], W))).toBeNull();
  });
});

describe('extracted가 없는 옛 응답', () => {
  const legacy = () => {
    const { extracted: _omitted, ...rest } = summarizeAway([release(92)], W);
    return rest as unknown as ReturnType<typeof summarizeAway>;
  };

  it('기운으로 바꾼 수 0으로 다뤄 놓아준 문구만 쓴다', () => {
    expect(bagFullText(legacy())).toBe('1시간 32분 만에 가방이 차서 1마리를 놓아줬어요.');
    expect(bagTimelineText(legacy())).toMatch(/1마리\(.+\)를 놓아줌$/);
  });
});

describe('가방 타임라인 문구', () => {
  it('기운으로 바꾼 수는 이름표 기운으로 바꿈으로 적는다', () => {
    expect(bagTimelineText(summarizeAway([extract(92, ['a', 'b'])], W))).toContain('2마리를 기운으로 바꿈');
  });

  it('놓아준 수와 같이 있으면 둘 다 적는다', () => {
    const text = bagTimelineText(summarizeAway([extract(92, ['a']), release(100)], W));
    expect(text).toContain('1마리를 기운으로 바꿈');
    expect(text).toContain('를 놓아줌');
  });

  it('놓아주기만 있으면 기존 문구 그대로다', () => {
    expect(bagTimelineText(summarizeAway([release(92)], W))).toMatch(/^1시간 32분 만에 가득 참\. 이후 42분 동안 1마리\(.+\)를 놓아줌$/);
  });
});
