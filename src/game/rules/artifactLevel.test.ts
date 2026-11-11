// 유물 레벨 — 레벨 계수, 레벨별 효과, 레벨업 판정, 마미 와타의 거울(전설 고정 효과).
import { describe, it, expect } from 'vitest';
import { applyAction } from './actions';
import type { ActionDeps } from './actions';
import { newState, mutationWeightsOf, variantShare, migrate } from './logic';
import type { GameState } from './logic';
import { moveSpeed, effectiveBite } from './stats';
import { canAcceptQuest, canLevelUpArtifact } from './rules';
import type { BountyCtx } from './rules';
import {
  artifactEffectsAt, artifactExtraCookChanceAt, artifactLevelOf, extraCookChance, duelSpeedupScale, scaleAfterCuts, sumArtifactEffect, variantBoostOf, namedDailyCap, namedRewardOf, namedRewardStat, dailyClearCap,
} from './artifactLevel';
import {
  ARTIFACTS, ARTIFACT_MAX_LEVEL, ARTIFACT_LEVEL_COEF, artifactLevelCost, artifactHasLevel, artifactById,
} from '../content/artifacts';
import { bountyById } from '../content/bounties';
import { parseAction } from './actionSchema';

const deps = (): ActionDeps => {
  let n = 0;
  return { rng: () => 0, today: '2026-08-22', now: '2026-08-22T03:00:00.000Z', newUid: () => `uid-${++n}` };
};
const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });
const art = (id: string) => artifactById(id)!;
const rec = (count: number) => ({ count, maxSize: null, first: null });

describe('레벨 데이터', () => {
  it('최고 레벨 5, 계수 1·1.25·1.5·1.75·2, 레벨업 재료 1·2·4·8(합 15)', () => {
    expect(ARTIFACT_MAX_LEVEL).toBe(5);
    expect(ARTIFACT_LEVEL_COEF).toEqual([1, 1.25, 1.5, 1.75, 2]);
    expect([2, 3, 4, 5].map(artifactLevelCost)).toEqual([1, 2, 4, 8]);
    expect([2, 3, 4, 5].reduce((s, l) => s + artifactLevelCost(l), 0)).toBe(15);
  });

  it('희귀와 영웅만 레벨이 있고 전설은 없다', () => {
    expect(artifactHasLevel(art('abyss-angler'))).toBe(true);
    expect(artifactHasLevel(art('wreck-compass'))).toBe(true);
    expect(artifactHasLevel(art('mami-wata-mirror'))).toBe(false);
  });
});

describe('artifactLevelOf', () => {
  it('맵이 없거나 값이 없으면 Lv1, 갖지 않은 유물은 0', () => {
    expect(artifactLevelOf(seed({ artifacts: ['wreck-compass'] }), 'wreck-compass')).toBe(1);
    expect(artifactLevelOf(seed({ artifacts: ['wreck-compass'], artifactLevels: {} }), 'wreck-compass')).toBe(1);
    expect(artifactLevelOf(seed({ artifacts: ['wreck-compass'], artifactLevels: { 'wreck-compass': 3 } }), 'wreck-compass')).toBe(3);
    expect(artifactLevelOf(seed({ artifactLevels: { 'wreck-compass': 3 } }), 'wreck-compass')).toBe(0);
  });

  it('범위 밖 값은 1~5로 접고, 전설은 항상 1이다', () => {
    const st = (lv: number) => seed({ artifacts: ['wreck-compass'], artifactLevels: { 'wreck-compass': lv } });
    expect(artifactLevelOf(st(9), 'wreck-compass')).toBe(5);
    expect(artifactLevelOf(st(0), 'wreck-compass')).toBe(1);
    expect(artifactLevelOf(seed({ artifacts: ['mami-wata-mirror'], artifactLevels: { 'mami-wata-mirror': 4 } }), 'mami-wata-mirror')).toBe(1);
  });
});

describe('레벨별 효과', () => {
  it('해구의 이빨 가속 단위 감소 10, 12.5, 15, 17.5, 20%', () => {
    const cuts = [1, 2, 3, 4, 5].map(l => artifactEffectsAt(art('abyss-angler'), l).duelSpeedupCut);
    expect(cuts).toEqual([0.1, 0.125, 0.15, 0.175, 0.2]);
  });

  it('침선의 나침반 항해 +10%에서 +20%', () => {
    expect(artifactEffectsAt(art('wreck-compass'), 5).sail).toBeCloseTo(0.2, 10);
  });

  it('진주 상인의 저울 추가 완성 확률 10, 12.5, 15, 17.5, 20%', () => {
    const chances = [1, 2, 3, 4, 5].map(l => artifactExtraCookChanceAt(art('varuna-scale'), l));
    expect(chances).toEqual([0.1, 0.125, 0.15, 0.175, 0.2]);
  });

  it('요리 효과가 없는 유물은 추가 완성 확률이 0이다', () => {
    expect(artifactExtraCookChanceAt(art('wreck-compass'), 5)).toBe(0);
  });

  it('코모로의 골판은 돌연변이 가중치를 25, 31.25, 37.5, 43.75, 50% 올린다', () => {
    const variants = [1, 2, 3, 4, 5].map(l => artifactEffectsAt(art('elder-scale'), l).mutationWeight!.variant);
    expect(variants).toEqual([1.25, 1.3125, 1.375, 1.4375, 1.5]);
    expect(artifactEffectsAt(art('elder-scale'), 5).mutationWeight!.normal).toBe(3);
  });

  it('최고 레벨을 넘는 입력은 Lv5로 접는다', () => {
    expect(artifactEffectsAt(art('abyss-angler'), 99).duelSpeedupCut).toBe(0.2);
  });
});

describe('레벨이 효과 함수에 반영된다', () => {
  it('mutationWeightsOf: 골판 Lv1은 1.25 : 3, Lv5는 1 : 2(점유율 1/3)', () => {
    const base = { artifacts: ['elder-scale'] };
    expect(mutationWeightsOf(base, 'pond')).toEqual({ variant: 1.25, normal: 3 });
    const lv5 = mutationWeightsOf({ ...base, artifactLevels: { 'elder-scale': 5 } }, 'pond');
    expect(variantShare(lv5)).toBeCloseTo(1 / 3, 10);
  });

  it('moveSpeed: 나침반 Lv5는 항해 +20%', () => {
    const lv1 = moveSpeed(seed({ boat: 1, artifacts: ['wreck-compass'] }), 'sail').value;
    const lv5 = moveSpeed(seed({ boat: 1, artifacts: ['wreck-compass'], artifactLevels: { 'wreck-compass': 5 } }), 'sail').value;
    const none = moveSpeed(seed({ boat: 1 }), 'sail').value;
    expect(lv1).toBeCloseTo(none * 1.1, 8);
    expect(lv5).toBeCloseTo(none * 1.2, 8);
  });

  it('duelSpeedupScale: 이빨 Lv5는 0.8, 없으면 1', () => {
    expect(duelSpeedupScale(seed())).toBe(1);
    expect(duelSpeedupScale(seed({ artifacts: ['abyss-angler'], artifactLevels: { 'abyss-angler': 5 } }))).toBeCloseTo(0.8, 10);
  });
});

describe('canLevelUpArtifact', () => {
  const owned = (lv: number | undefined, mats: number, id = 'wreck-compass', mat = 'mat-wreck-compass') =>
    seed({ artifacts: [id], items: mats > 0 ? { [mat]: mats } : {}, artifactLevels: lv === undefined ? undefined : { [id]: lv } });

  it('갖지 않은 유물, 모르는 유물, 전설, 최고 레벨은 bad-request', () => {
    expect(canLevelUpArtifact(seed({ items: { 'mat-wreck-compass': 9 } }), 'wreck-compass')).toEqual({ ok: false, reason: 'bad-request' });
    expect(canLevelUpArtifact(owned(1, 1), 'nope')).toEqual({ ok: false, reason: 'bad-request' });
    expect(canLevelUpArtifact(owned(1, 9, 'mami-wata-mirror', 'mat-clouded-mirror'), 'mami-wata-mirror')).toEqual({ ok: false, reason: 'bad-request' });
    expect(canLevelUpArtifact(owned(5, 99), 'wreck-compass')).toEqual({ ok: false, reason: 'bad-request' });
  });

  it('재료가 다음 레벨 비용보다 모자라면 material-missing, 같으면 통과', () => {
    expect(canLevelUpArtifact(owned(undefined, 0), 'wreck-compass')).toEqual({ ok: false, reason: 'material-missing' });
    expect(canLevelUpArtifact(owned(2, 1), 'wreck-compass')).toEqual({ ok: false, reason: 'material-missing' });
    expect(canLevelUpArtifact(owned(2, 2), 'wreck-compass')).toEqual({ ok: true });
    expect(canLevelUpArtifact(owned(4, 8), 'wreck-compass')).toEqual({ ok: true });
    expect(canLevelUpArtifact(owned(4, 7), 'wreck-compass')).toEqual({ ok: false, reason: 'material-missing' });
  });
});

describe('levelUpArtifact 액션', () => {
  const act = { type: 'levelUpArtifact', artifact: 'wreck-compass' } as const;

  it('레벨이 없던 보유 유물은 Lv1로 읽어 Lv2로 올리고 재료 1개를 쓴다', () => {
    const out = applyAction(seed({ artifacts: ['wreck-compass'], items: { 'mat-wreck-compass': 3 } }), act, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.state.artifactLevels).toEqual({ 'wreck-compass': 2 });
    expect(out.state.items['mat-wreck-compass']).toBe(2);
    expect(out.state.artifacts).toEqual(['wreck-compass']);
    expect(out.events).toEqual([{ type: 'levelUpArtifact', payload: { artifact: 'wreck-compass', level: 2 } }]);
  });

  it('Lv4에서 Lv5로 올릴 때 재료 8개를 쓰고 0이 되면 행을 접는다', () => {
    const out = applyAction(seed({
      artifacts: ['wreck-compass'], items: { 'mat-wreck-compass': 8 }, artifactLevels: { 'wreck-compass': 4 },
    }), act, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.state.artifactLevels).toEqual({ 'wreck-compass': 5 });
    expect(out.state.items['mat-wreck-compass']).toBeUndefined();
  });

  it('다른 유물의 레벨은 건드리지 않는다', () => {
    const out = applyAction(seed({
      artifacts: ['wreck-compass', 'varuna-scale'], items: { 'mat-wreck-compass': 1 }, artifactLevels: { 'varuna-scale': 3 },
    }), act, deps());
    if (!out.ok) throw new Error(out.error);
    expect(out.state.artifactLevels).toEqual({ 'varuna-scale': 3, 'wreck-compass': 2 });
  });

  it('거부 — 재료 부족, 최고 레벨, 전설, 미보유, 문자열 아님', () => {
    const lack = applyAction(seed({ artifacts: ['wreck-compass'] }), act, deps());
    expect(lack).toEqual({ ok: false, error: 'material-missing' });
    const max = applyAction(seed({ artifacts: ['wreck-compass'], items: { 'mat-wreck-compass': 9 }, artifactLevels: { 'wreck-compass': 5 } }), act, deps());
    expect(max).toEqual({ ok: false, error: 'bad-request' });
    const legend = applyAction(seed({ artifacts: ['mami-wata-mirror'], items: { 'mat-clouded-mirror': 9 } }),
      { type: 'levelUpArtifact', artifact: 'mami-wata-mirror' }, deps());
    expect(legend).toEqual({ ok: false, error: 'bad-request' });
    expect(applyAction(seed({ items: { 'mat-wreck-compass': 9 } }), act, deps())).toEqual({ ok: false, error: 'bad-request' });
    expect(applyAction(seed(), { type: 'levelUpArtifact', artifact: 3 as unknown as string }, deps())).toEqual({ ok: false, error: 'bad-request' });
  });

  it('행동 스키마가 받아들이고 문자열이 아닌 id는 거른다', () => {
    expect(parseAction({ type: 'levelUpArtifact', artifact: 'wreck-compass' })).toEqual({ type: 'levelUpArtifact', artifact: 'wreck-compass' });
    expect(parseAction({ type: 'levelUpArtifact', artifact: 3 })).toBeNull();
    expect(parseAction({ type: 'levelUpArtifact' })).toBeNull();
  });
});

describe('세이브', () => {
  it('newState는 레벨 맵을 두지 않는다 — 올린 유물이 없으면 필드가 없다', () => {
    expect(newState().artifactLevels).toBeUndefined();
  });

  it('레벨 필드가 없는 기존 세이브는 맵이 비고 보유 유물은 Lv1로 읽힌다(v 그대로)', () => {
    const raw = { ...newState(), artifacts: ['wreck-compass'], artifactLevels: undefined };
    const s = migrate(raw);
    expect(s.v).toBe(9);
    expect(s.artifactLevels).toBeUndefined();
    expect(artifactLevelOf(s, 'wreck-compass')).toBe(1);
  });

  it('레벨 맵 위생 — 정수 1~5이고 보유한 레벨 유물만 남는다', () => {
    const raw = { ...newState(), artifacts: ['wreck-compass', 'mami-wata-mirror', 'varuna-scale'],
      artifactLevels: {
        'wreck-compass': 3, 'mami-wata-mirror': 2, 'varuna-scale': 2.5, 'abyss-angler': 4, nope: 3,
      } };
    expect(migrate(raw).artifactLevels).toEqual({ 'wreck-compass': 3 });
    const bad = migrate({ ...newState(), artifacts: ['wreck-compass'], artifactLevels: { 'wreck-compass': 9 } });
    expect(bad.artifactLevels).toEqual({ 'wreck-compass': 5 });
    expect(migrate({ ...newState(), artifacts: ['wreck-compass'], artifactLevels: 'x' }).artifactLevels).toBeUndefined();
    expect(migrate({ ...newState(), artifacts: ['wreck-compass'], artifactLevels: { 'wreck-compass': 1 } }).artifactLevels).toBeUndefined();
  });
});

describe('마미 와타의 거울, 전설, 효과 고정', () => {
  const mirror = art('mami-wata-mirror');

  it('전설 등급이고 항해 보너스가 없다', () => {
    expect(mirror.grade).toBe('legendary');
    expect(mirror.effects).toEqual({});
    expect(ARTIFACTS.every(a => (a.grade === 'legendary') === !artifactHasLevel(a))).toBe(true);
  });

  it('하루 네임드 상한은 거울이 있으면 +1이고 일반 의뢰 상한은 그대로다', () => {
    expect(namedDailyCap(seed())).toBe(1);
    expect(namedDailyCap(seed({ artifacts: ['mami-wata-mirror'] }))).toBe(2);
    expect(dailyClearCap(seed({ artifacts: ['mami-wata-mirror'] }), 'general')).toBe(1);
    expect(dailyClearCap(seed({ artifacts: ['mami-wata-mirror'] }), 'named')).toBe(2);
  });

  it('토벌 골드는 -30%이고 하루 두 번 합은 거울이 없을 때 한 번의 1.4배다', () => {
    expect(namedRewardOf(seed(), 1000)).toBe(1000);
    const has = seed({ artifacts: ['mami-wata-mirror'] });
    expect(namedRewardOf(has, 1000)).toBe(700);
    expect(namedRewardOf(has, 1000) * 2).toBe(1400);
  });

  it('토벌 골드 내역은 원본, 유물 이름의 증감, 합계를 돌려주고 합계가 namedRewardOf와 같다', () => {
    expect(namedRewardStat(seed(), 1000)).toEqual({ base: 1000, mods: [], value: 1000 });
    const has = seed({ artifacts: ['mami-wata-mirror'] });
    const stat = namedRewardStat(has, 1000);
    expect(stat).toEqual({
      base: 1000, mods: [{ id: 'relic-mami-wata-mirror', label: '마미 와타의 거울', delta: -300 }], value: 700,
    });
    expect(stat.value).toBe(namedRewardOf(has, 1000));
    const odd = namedRewardStat(has, 1234);
    expect(odd.base + odd.mods.reduce((sum, mod) => sum + mod.delta, 0)).toBe(odd.value);
  });

  it('일반 의뢰 보상에는 페널티가 붙지 않는다', () => {
    const q = 'pacific-easy-common';
    const bounty: BountyCtx = { clearsToday: { general: 0, named: 0 }, tickets: [], complete: [q], active: [q] };
    const plain = applyAction(seed(), { type: 'deliverBounty', questId: q }, { ...deps(), bounty });
    const withMirror = applyAction(seed({ artifacts: ['mami-wata-mirror'] }), { type: 'deliverBounty', questId: q }, { ...deps(), bounty });
    if (!plain.ok || !withMirror.ok) throw new Error('rejected');
    expect(withMirror.state.gold).toBe(plain.state.gold);
  });

  it('네임드 납품은 골드만 30% 줄고 재료는 1개 그대로다', () => {
    const q = 'pacific-named-megalodon';
    const bounty: BountyCtx = { clearsToday: { general: 0, named: 0 }, tickets: [], complete: [q], active: [q] };
    const plain = applyAction(seed(), { type: 'deliverBounty', questId: q }, { ...deps(), bounty });
    const withMirror = applyAction(seed({ artifacts: ['mami-wata-mirror'] }), { type: 'deliverBounty', questId: q }, { ...deps(), bounty });
    if (!plain.ok || !withMirror.ok) throw new Error('rejected');
    const reward = bountyById(q)!.reward;
    expect(plain.state.gold).toBe(reward);
    expect(withMirror.state.gold).toBe(Math.floor(reward * 0.7));
    expect(withMirror.state.items['mat-abyss-lantern']).toBe(1);
    expect(plain.state.items['mat-abyss-lantern']).toBe(1);
  });

  it('canAcceptQuest: 거울이 있으면 네임드를 하루 두 번 수주할 수 있다', () => {
    const q = 'pacific-named-megalodon';
    const dex = Object.fromEntries(['mackerel', 'hairtail', 'anglerfish', 'seabream', 'yellowtail', 'squid',
      'tuna', 'coelacanth', 'oarfish', 'shark', 'kraken', 'moonveil', 'abyssveil'].map(f => [f, { normal: rec(1) }]));
    const base = { location: { kind: 'base', id: 'harbor' }, dex } as const;
    const once: BountyCtx = { clearsToday: { general: 0, named: 1 }, tickets: [], complete: [], active: [] };
    const twice: BountyCtx = { ...once, clearsToday: { general: 0, named: 2 } };
    expect(canAcceptQuest(seed({ ...base }), q, 'harbor', once)).toEqual({ ok: false, reason: 'daily-cleared' });
    const mirror = seed({ ...base, artifacts: ['mami-wata-mirror'] });
    expect(canAcceptQuest(mirror, q, 'harbor', once)).toEqual({ ok: true });
    expect(canAcceptQuest(mirror, q, 'harbor', twice)).toEqual({ ok: false, reason: 'daily-cleared' });
  });
});

describe('바깥섬의 봉돌, 입질 대기', () => {
  const sinker = art('outer-isle-sinker');

  it('입질 대기 감소는 Lv1 10%에 레벨 계수를 곱해 10, 12.5, 15, 17.5, 20%다', () => {
    const cuts = [1, 2, 3, 4, 5].map(l => artifactEffectsAt(sinker, l).biteWaitCut);
    expect(cuts).toEqual([0.1, 0.125, 0.15, 0.175, 0.2]);
    expect(artifactHasLevel(sinker)).toBe(true);
  });

  it('유효 입질 대기는 최소와 최대 모두 감소율만큼 줄고 기여 내역에 유물이 남는다', () => {
    const plain = effectiveBite(seed({ rod: 29 }), 'sthelena');
    const withRelic = effectiveBite(seed({ rod: 29, artifacts: ['outer-isle-sinker'] }), 'sthelena');
    expect(withRelic.min.value).toBeCloseTo(plain.min.value * 0.9, 10);
    expect(withRelic.max.value).toBeCloseTo(plain.max.value * 0.9, 10);
    expect(withRelic.min.mods.some(m => m.id === 'relic-outer-isle-sinker' && m.label === '바깥섬의 봉돌')).toBe(true);
    expect(plain.min.mods.some(m => m.id.startsWith('relic-'))).toBe(false);
  });

  it('파워 미달의 추가 대기에도 감소율이 걸린다', () => {
    const plain = effectiveBite(seed({ rod: 1 }), 'sthelena');
    const withRelic = effectiveBite(seed({ rod: 1, artifacts: ['outer-isle-sinker'] }), 'sthelena');
    expect(plain.min.mods.some(m => m.id === 'power')).toBe(true);
    expect(withRelic.min.value).toBeCloseTo(plain.min.value * 0.9, 10);
  });
});

// 보너스 효과의 합산 — 같은 종류의 유물 효과는 더해 한 번 적용한다
describe('유물 효과 — 같은 종류는 합한 뒤 한 번 적용한다', () => {
  it('결투 가속: 감소율을 더해 (1 − 합), 합이 1을 넘어도 0 아래로 내려가지 않는다', () => {
    expect(scaleAfterCuts([])).toBe(1);
    expect(scaleAfterCuts([0.1])).toBeCloseTo(0.9, 12);
    expect(scaleAfterCuts([0.1, 0.2])).toBeCloseTo(0.7, 12); // 곱이면 0.72
    expect(scaleAfterCuts([0.6, 0.5])).toBe(0);
  });
  it('보유 유물의 효과를 모두 더한다', () => {
    const s = seed({ artifacts: ['wreck-compass', 'varuna-scale'] });
    expect(sumArtifactEffect(s, e => e.sail)).toBeCloseTo(0.1, 12);
    expect(sumArtifactEffect(s, e => (e.sail ?? 0) + (e.biteWaitCut ?? 0))).toBeCloseTo(0.1, 12);
    expect(sumArtifactEffect(seed(), e => e.sail)).toBe(0);
  });
  it('추가 완성 확률과 돌연변이 증가율은 유물이 하나라 값이 그대로다', () => {
    expect(extraCookChance(seed({ artifacts: ['varuna-scale'], artifactLevels: { 'varuna-scale': 5 } }))).toBeCloseTo(0.2, 12);
    expect(extraCookChance(seed({ artifacts: ['varuna-scale'] }))).toBeCloseTo(0.1, 12);
    expect(variantBoostOf(seed({ artifacts: ['elder-scale'], artifactLevels: { 'elder-scale': 5 } }))).toBeCloseTo(0.5, 12);
    expect(extraCookChance(seed())).toBe(0);
    expect(extraCookChance(seed({ artifacts: ['wreck-compass'] }))).toBe(0);
    expect(variantBoostOf(seed())).toBe(0);
  });
});
