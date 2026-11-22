import { describe, it, expect } from 'vitest';
import { ARTIFACTS } from '../../../game/content/artifacts';
import { newState } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import { BOUNTIES, BOUNTY_ZONES, offeredQuestsFor } from '../../../game/content/bounties';
import { BOATS } from '../../../game/content/boats';
import { NAMED } from '../../../game/content/named';
import { SPOTS } from '../../../game/content/spots';
import { DEBUG_COMMAND_IDS } from '../../../game/rules/debug';
import {
  DEV_COMMANDS, devBaseTargets, devNamedLocations, devSpotTargets, devZoneOptions, parseDevArgs,
} from './commands';
import { DEV_PRESETS, filterPresets, planPreset } from './presets';

const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });

describe('개발 도구 명령 목록', () => {
  it('서버 명령 목록과 1:1이다 — 서버가 받지 않는 명령을 패널에 두지 않는다', () => {
    expect(DEV_COMMANDS.map(c => c.id).sort()).toEqual([...DEBUG_COMMAND_IDS].sort());
  });

  it('구역 선택지는 수배 구역 표에서 나온다', () => {
    expect(devZoneOptions().map(o => o.value)).toEqual(BOUNTY_ZONES);
    expect(devZoneOptions()[0].label).toBe('태평양');
  });

  it('거점 7곳, 해역 15곳, 네임드 8종 위치 메타를 콘텐츠 표에서 파생한다', () => {
    expect(devBaseTargets()).toHaveLength(7);
    expect(devSpotTargets()).toHaveLength(SPOTS.length);
    expect(devNamedLocations()).toHaveLength(NAMED.length);
    expect(devNamedLocations().find(n => n.id === 'adamastor')?.place).toContain('용승대');
    expect(devNamedLocations().find(n => n.id === 'guabancex')?.place).toContain('버뮤다');
  });

  it('입력은 정수로 읽고 빈 칸은 보내지 않는다 — stats.set 전부 빈 칸이면 거부', () => {
    const stats = DEV_COMMANDS.find(c => c.id === 'stats.set')!;
    expect(parseDevArgs(stats, { gold: '1000.9', fame: '' })).toEqual({ ok: true, args: { gold: 1000 } });
    expect(parseDevArgs(stats, { gold: '많이' })).toEqual({ ok: false });
    expect(parseDevArgs(stats, {})).toEqual({ ok: false });

    const grant = DEV_COMMANDS.find(c => c.id === 'bounty.grantMaterial')!;
    expect(parseDevArgs(grant, { artifact: 'wreck-compass', count: '12' })).toEqual({ ok: true, args: { artifact: 'wreck-compass', count: 12 } });
    const dex = DEV_COMMANDS.find(c => c.id === 'dex.completeZone')!;
    expect(parseDevArgs(dex, { zone: 'indian' })).toEqual({ ok: true, args: { zone: 'indian' } });

    const dexFill = DEV_COMMANDS.find(c => c.id === 'dex.fill')!;
    expect(parseDevArgs(dexFill, { zone: 'village', form: 'variant', big: 'true' }))
      .toEqual({ ok: true, args: { zone: 'village', form: 'variant', big: true } });

    const itemsGrant = DEV_COMMANDS.find(c => c.id === 'items.grant')!;
    expect(parseDevArgs(itemsGrant, { itemId: 'energy-common', count: '1.5' }))
      .toEqual({ ok: true, args: { itemId: 'energy-common', count: 1.5 } });
  });
});

describe('프리셋', () => {
  const ctx = (game: GameState) => ({ game });

  it('네임드마다 네임드 직전 프리셋이 있다 — 구역당 하나가 아니다', () => {
    const named = BOUNTIES.filter(q => q.difficulty === 'named');
    expect(DEV_PRESETS.filter(p => p.id.startsWith('named-ready:')).map(p => p.id))
      .toEqual(named.map(q => `named-ready:${q.id}`));
    expect(named.map(q => q.zone).filter(z => z === 'southatlantic')).toHaveLength(2);
    for (const zone of BOUNTY_ZONES) expect(named.some(q => q.zone === zone), zone).toBe(true);
  });

  it('유물마다 교환 직전 프리셋이 있고 그 유물의 재료를 준다', () => {
    expect(DEV_PRESETS.filter(p => p.id.startsWith('relic-ready:')).map(p => p.id))
      .toEqual(ARTIFACTS.map(a => `relic-ready:${a.id}`));
    const sinker = DEV_PRESETS.find(p => p.id === 'relic-ready:outer-isle-sinker')!;
    expect(planPreset(sinker, ctx(seed()))).toEqual({
      ok: true, steps: [{ kind: 'debug', command: 'bounty.grantMaterial', args: { artifact: 'outer-isle-sinker' } }],
    });
  });

  it('네임드 직전 — 정리 → 스탯 → 도감 → 항구 자동 이동 → 수주 → 강제 조우 대기 순서다', () => {
    const atHome = seed();
    const plan = planPreset(DEV_PRESETS.find(p => p.id === 'named-ready:madagascar-named-elder-sixgill')!, ctx(atHome));
    if (!plan.ok) throw new Error(plan.blocked);
    const quest = offeredQuestsFor('madagascar', 'named', 'u1', '2026-10-16')[0];
    expect(plan.steps).toEqual([
      { kind: 'debug', command: 'bounty.resetToday', args: {} },
      { kind: 'debug', command: 'bounty.clearProgress', args: {} },
      { kind: 'debug', command: 'bounty.clearTickets', args: {} },
      { kind: 'debug', command: 'stats.set', args: { fame: BOATS[6].fameReq, boat: 7, rod: expect.any(Number) } },
      { kind: 'debug', command: 'dex.completeZone', args: { zone: 'madagascar' } },
      { kind: 'teleportBase', base: 'toamasina' },
      { kind: 'action', action: { type: 'acceptQuest', questId: quest.id, port: 'toamasina' } },
      { kind: 'armEncounter' },
    ]);
  });

  it.each(['adamastor', 'jasconius'])('네임드가 둘인 구역은 %s 프리셋이 그 네임드를 수주한다', named => {
    const plan = planPreset(DEV_PRESETS.find(p => p.id === `named-ready:southatlantic-named-${named}`)!, ctx(seed()));
    if (!plan.ok) throw new Error(plan.blocked);
    expect(plan.steps).toContainEqual({ kind: 'teleportBase', base: 'walvisbay' });
    expect(plan.steps).toContainEqual({ kind: 'action', action: { type: 'acceptQuest', questId: `southatlantic-named-${named}`, port: 'walvisbay' } });
  });

  it('배·낚싯대·명성은 낮출 때만 올리고 이미 높으면 유지한다', () => {
    const strong = seed({ location: { kind: 'base', id: 'harbor' }, fame: 999999, boat: 9, rod: 99 });
    const plan = planPreset(DEV_PRESETS.find(p => p.id === 'named-ready:pacific-named-megalodon')!, ctx(strong));
    if (!plan.ok) throw new Error(plan.blocked);
    expect(plan.steps[3]).toEqual({ kind: 'debug', command: 'stats.set', args: { fame: 999999, boat: 9, rod: 99 } });
  });

  it('v0.20.0 신콘텐츠 QA 패키지와 검색·구역 필터가 동작한다', () => {
    const v020 = DEV_PRESETS.find(p => p.id === 'qa-v020-package');
    expect(v020).toBeDefined();
    const plan = planPreset(v020!, ctx(seed()));
    expect(plan.ok).toBe(true);
    expect(filterPresets(DEV_PRESETS, 'v0.20', 'all').map(p => p.id)).toEqual(['qa-v020-package']);
    expect(filterPresets(DEV_PRESETS, '', 'northatlantic').some(p => p.id === 'named-ready:northatlantic-named-guabancex')).toBe(true);
    expect(filterPresets(DEV_PRESETS, '', 'village').every(p => p.zone === 'village' || p.zone === 'all')).toBe(true);
  });
});
