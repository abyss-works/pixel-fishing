// 서버 추첨 가중치 조정 배수가 리듀서의 다섯 판정 채널에만 곱해지는지 고정한다.
import { describe, expect, it } from 'vitest';
import { applyAction } from './actions';
import type { ActionDeps } from './actions';
import { endedFirstCatch } from './firstCatch';
import { newState } from './logic';
import type { GameState } from './logic';

const NOW = '2026-08-22T03:00:00.000Z';

const baseState = (): GameState => ({
  ...newState(),
  firstCatch: endedFirstCatch(),
  fortune: { day: '2026-08-22', kind: 'gold', index: 3 },
});

function depsWith(values: readonly number[], integrityModifier: number, over: Partial<ActionDeps> = {}): ActionDeps {
  let n = 0;
  let uid = 0;
  return {
    rng: () => values[Math.min(n++, values.length - 1)] ?? 0,
    today: '2026-08-22',
    now: NOW,
    newUid: () => `uid-${++uid}`,
    integrityModifier,
    ...over,
  };
}

function catchWith(values: readonly number[], integrityModifier: number) {
  const out = applyAction(baseState(), { type: 'catch', spot: 'pond', judgment: 'normal' }, depsWith(values, integrityModifier));
  if (!out.ok) throw new Error(out.error);
  return out;
}

describe('catch 서버 추첨 가중치 조정 배수', () => {
  it('희귀 이상 등급 가중치에 곱해져 줄어든 몫은 일반으로 이동한다', () => {
    const neutral = catchWith([0.8, 0, 0.5, 0.5, 0.9], 1);
    const modified = catchWith([0.8, 0, 0.5, 0.5, 0.9], 0.4);
    expect(neutral.state.bag[0].fishId).not.toBe(modified.state.bag[0].fishId);
    expect(neutral.result.type).toBe('catch');
    expect(modified.result.type).toBe('catch');
    if (neutral.result.type === 'catch' && modified.result.type === 'catch') {
      expect(neutral.result.info.isNew).toBe(true);
      expect(modified.result.info.isNew).toBe(true);
    }
  });

  it('전설 추가 배수에도 곱해진다', () => {
    const neutral = catchWith([0.995, 0, 0.5, 0.5, 0.9], 1);
    const modified = catchWith([0.995, 0, 0.5, 0.5, 0.9], 0.4);
    expect(neutral.state.bag[0].fishId).toBe('goldcarp');
    expect(modified.state.bag[0].fishId).not.toBe('goldcarp');
  });

  it('돌연변이 폼 가중치에 곱해지고 난수 소비 횟수는 바뀌지 않는다', () => {
    const neutral = catchWith([0, 0, 0.5, 0.5, 0.2], 1);
    const modified = catchWith([0, 0, 0.5, 0.5, 0.2], 0.4);
    expect(neutral.state.bag[0].form).toBe('variant');
    expect(modified.state.bag[0].form).toBe('normal');
    expect(neutral.state.bag[0].fishId).toBe(modified.state.bag[0].fishId);
  });

  it('월척 판정의 최종 배수에 곱해진다', () => {
    const neutral = catchWith([0, 0, 0.584, 0, 0.9], 1);
    const modified = catchWith([0, 0, 0.584, 0, 0.9], 0.4);
    if (neutral.result.type !== 'catch' || modified.result.type !== 'catch') throw new Error('catch expected');
    expect(neutral.result.info.isBig).toBe(true);
    expect(modified.result.info.isBig).toBe(false);
  });

  it('네임드 조우 확률의 최종 배수에 곱해진다', () => {
    const bounty = {
      clearsToday: { general: 0, named: 0 },
      tickets: [],
      complete: [],
      active: ['pacific-named-megalodon'],
    };
    const run = (modifier: number) => applyAction(
      { ...baseState(), boat: 1 },
      { type: 'catch', spot: 'sea', judgment: 'normal' },
      depsWith([0.0007, 0, 0, 0, 0.5, 0.5, 0.9], modifier, { bounty }),
    );
    const neutral = run(1);
    const modified = run(0.4);
    if (!neutral.ok || !modified.ok) throw new Error('catch failed');
    expect(neutral.events.some(e => e.type === 'ticket')).toBe(true);
    expect(modified.events.some(e => e.type === 'ticket')).toBe(false);
  });
});
