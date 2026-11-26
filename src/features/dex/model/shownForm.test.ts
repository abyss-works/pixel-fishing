import { describe, expect, it } from 'vitest';
import { FISH, newState } from '../../../game/rules/logic';
import { shownFormOf } from './shownForm';

const fish = FISH[0];
const rec = { count: 1, maxSize: 20, first: null };

describe('대표 폼', () => {
  it('아무것도 발견하지 못했으면 일반 폼이다', () => {
    expect(shownFormOf(newState(), fish.id)).toEqual({ form: 'normal', index: 0 });
  });

  it('일반 폼을 발견했으면 돌연변이도 발견했어도 일반 폼이다', () => {
    const game = newState();
    game.dex[fish.id] = { normal: rec, variant: rec };
    expect(shownFormOf(game, fish.id)).toEqual({ form: 'normal', index: 0 });
  });

  it('돌연변이만 발견했으면 돌연변이 폼이다', () => {
    const game = newState();
    game.dex[fish.id] = { variant: rec };
    expect(shownFormOf(game, fish.id)).toEqual({ form: 'variant', index: 1 });
  });
});
