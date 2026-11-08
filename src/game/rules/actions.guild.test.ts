// 길드 보너스 효과 — 받는 규칙(판매·가방·네임드 조우·일반 등급 가중치·돌연변이)이 효과 값을 한 번만, 더하는 방식으로
// 적용하는지와 리듀서가 주입된 효과로 판정하는지 확인한다. 효과가 없으면 모든 판정이 길드 없이와 같다.
import { describe, expect, it } from 'vitest';
import {
  bagCapacity, capOfBoat, fishDrawShares, makeInstance, mutationWeightsOf, namedWeightsOf, newState, sellSelected,
  variantShare, withVariantPoints, FISH,
} from './logic';
import type { FishInstance, GameState } from './logic';
import { applyAction, catchDrawOptions } from './actions';
import type { ActionDeps } from './actions';
import { NO_GUILD_EFFECTS, guildEffectsOf } from './guild';
import type { GuildEffects } from './guild';
import { BOUNTIES } from '../content/bounties';
import type { BountyCtx } from './rules';
import { powerZones, rodPower } from './stats';

const DAY = '2026-12-31T23:40:00Z'; // 낮, 게임 날짜 2027-01-01
const fx = (over: Partial<GuildEffects>): GuildEffects => ({ ...NO_GUILD_EFFECTS, ...over });
const deps = (rng: () => number, guild?: GuildEffects): ActionDeps =>
  ({ rng, today: '2027-01-01', now: DAY, newUid: () => 'new', guild });

const goldfish = FISH.find(f => f.id === 'goldfish')!;
const inst = (uid: string): FishInstance =>
  makeInstance(goldfish, { size: 10, form: 'normal' }, { uid, now: DAY, spot: 'pond', judgment: 'auto' });

describe('받는 규칙 — 효과 값 하나를 한 지점에서 더한다', () => {
  it('판매 총액에 판매가 비율을 한 번 더한다', () => {
    const st: GameState = { ...newState(), gold: 0, bag: [inst('a'), inst('b')] };
    const base = sellSelected(st, ['a', 'b']).gold;
    expect(sellSelected(st, ['a', 'b'], 0.06).gold).toBe(base + Math.round(base * 0.06));
    expect(sellSelected(st, ['a', 'b'], 0).gold).toBe(base);
  });

  it('배의 가방 칸에 가방 비율만큼 더한다. 래칫(이미 든 개체 수)은 그대로다', () => {
    expect(capOfBoat(1, 0.2)).toBe(capOfBoat(1) + Math.round(capOfBoat(1) * 0.2));
    expect(bagCapacity(1, [], 0.08)).toBe(capOfBoat(1, 0.08));
    const many = Array.from({ length: 500 }, (_, i) => inst(`m${i}`));
    expect(bagCapacity(1, many, 0.2)).toBe(500);
  });

  it('네임드 조우 가중치에 네임드 비율만큼 더한다. 없음 가중치는 그대로다', () => {
    const w = namedWeightsOf('river');
    expect(namedWeightsOf('river', 0.25)).toEqual({ named: w.named * 1.25, none: w.none });
  });

  it('돌연변이는 유물·해역이 정한 확률 위에 퍼센트포인트를 더한다(가중치 배수가 아니다)', () => {
    const forms = mutationWeightsOf(newState(), 'pond');
    expect(variantShare(withVariantPoints(forms, 0.05))).toBeCloseTo(variantShare(forms) + 0.05, 10);
    expect(withVariantPoints(forms, 0)).toBe(forms);
    expect(withVariantPoints({ variant: 1, normal: 0 }, 0.05)).toEqual({ variant: 1, normal: 0 });
  });

  it('일반 등급 가중치에서 희귀 비율만큼 한 번 뺀다', () => {
    const shares = (cut: number) => fishDrawShares('pond', { commonCut: cut });
    const commonOf = (cut: number) => shares(cut).filter(s => s.fish.rarity === 'common').reduce((a, s) => a + s.share, 0);
    const c = commonOf(0);
    // 일반 가중치 c를 (1 − 0.1)배로 — 비율로 c' = 0.9c / (0.9c + (1 − c))
    expect(commonOf(0.1)).toBeCloseTo(0.9 * c / (0.9 * c + (1 - c)), 10);
  });
});

describe('리듀서 — 주입된 길드 효과로 판정한다', () => {
  it('판매는 판매가 보너스를 더한 골드를 준다', () => {
    const st: GameState = { ...newState(), gold: 0, bag: [inst('a'), inst('b')] };
    const plain = applyAction(st, { type: 'sell', uids: ['a', 'b'] }, deps(() => 0));
    const boosted = applyAction(st, { type: 'sell', uids: ['a', 'b'] }, deps(() => 0, guildEffectsOf(5, { sell: 3 })));
    if (!plain.ok || !boosted.ok) throw new Error('sell failed');
    const base = plain.state.gold;
    expect(boosted.state.gold).toBe(base + Math.round(base * 0.06));
    expect(boosted.result).toEqual({ type: 'sell', gold: boosted.state.gold });
  });

  it('가방이 배의 칸만큼 차 있어도 가방 보너스만큼은 놓아주지 않고 담는다', () => {
    const cap = capOfBoat(0);
    const st: GameState = { ...newState(), bag: Array.from({ length: cap }, (_, i) => inst(`b${i}`)) };
    const catchPond = { type: 'catch', spot: 'pond', judgment: 'auto' } as const;
    const plain = applyAction(st, catchPond, deps(() => 0.5));
    const boosted = applyAction(st, catchPond, deps(() => 0.5, guildEffectsOf(2, { bag: 1 })));
    if (!plain.ok || !boosted.ok) throw new Error('catch failed');
    expect(plain.state.bag).toHaveLength(cap);
    expect(boosted.state.bag).toHaveLength(cap + 1);
    expect(boosted.events.some(e => e.type === 'autoRelease')).toBe(false);
  });

  it('네임드 조우 보너스는 조우 가중치를 늘린다', () => {
    const named = BOUNTIES.find(q => q.difficulty === 'named' && q.zone === 'pacific')!;
    const st: GameState = { ...newState(), boat: 2, location: { kind: 'base', id: 'harbor' } };
    const bounty = { active: [named.id], complete: [], tickets: [], clearsToday: { general: 0, named: 0 } } satisfies BountyCtx;
    const w = namedWeightsOf('sea');
    // 보너스 +25%로만 명중하는 난수 — 길드 없이 경계(named / 합) 위, 보너스 경계 아래
    const r = (w.named / (w.named + w.none) + w.named * 1.25 / (w.named * 1.25 + w.none)) / 2;
    const run = (guild?: GuildEffects) => applyAction(st, { type: 'catch', spot: 'sea', judgment: 'auto' },
      { ...deps(() => r, guild), bounty });
    const plain = run();
    const boosted = run(guildEffectsOf(5, { named: 5 }));
    if (!plain.ok || !boosted.ok) throw new Error('catch failed');
    expect(plain.events.some(e => e.type === 'ticket')).toBe(false);
    expect(boosted.events.find(e => e.type === 'ticket')?.payload).toEqual({ questId: named.id });
  });

  it('희귀 어종 보너스는 방치 캐치에서도 일반 등급 가중치를 줄인다', () => {
    const st = newState();
    const o = catchDrawOptions('auto', rodPower(st), 'pond', powerZones(st, 'pond').mult, { phase: 'day' });
    const commonOf = (cut: number) => fishDrawShares('pond', { ...o, commonCut: cut })
      .filter(s => s.fish.rarity === 'common').reduce((a, s) => a + s.share, 0);
    const r = (commonOf(0) + commonOf(0.1)) / 2; // 일반 등급 경계 사이 — 일반 등급이 먼저 놓인다
    const rarityOf = (guild?: GuildEffects) => {
      const out = applyAction(st, { type: 'catch', spot: 'pond', judgment: 'auto' }, deps(() => r, guild));
      if (!out.ok || out.result.type !== 'catch') throw new Error('catch failed');
      const fishId = out.result.fishId;
      return FISH.find(f => f.id === fishId)?.rarity;
    };
    expect(rarityOf()).toBe('common');
    expect(rarityOf(guildEffectsOf(5, { rare: 5 }))).not.toBe('common');
  });

  it('돌연변이 보너스는 돌연변이 확률에 퍼센트포인트를 더한다', () => {
    const st = newState();
    const share = variantShare(mutationWeightsOf(st, 'pond'));
    const r = share + 0.02; // 길드 없이는 일반 폼, +5%p면 돌연변이
    const formOf = (guild?: GuildEffects) => {
      const out = applyAction(st, { type: 'catch', spot: 'pond', judgment: 'auto' }, deps(() => r, guild));
      if (!out.ok || out.result.type !== 'catch') throw new Error('catch failed');
      return out.result.info.form;
    };
    expect(formOf()).toBe('normal');
    expect(formOf(fx({ mutation: 0.05 }))).toBe('variant');
  });
});
