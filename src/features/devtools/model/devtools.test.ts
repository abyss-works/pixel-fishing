import { describe, it, expect } from 'vitest';
import { newState } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import { BOUNTY_LICENSE_FAME, dailyQuestFor } from '../../../game/content/bounties';
import { DEBUG_COMMAND_IDS } from '../../../game/rules/debug';
import { DEV_COMMANDS, devZoneOptions, parseDevArgs } from './commands';
import { DEV_PRESETS, planPreset } from './presets';

const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });

describe('개발 도구 명령 목록', () => {
  it('서버 명령 목록과 1:1이다 — 서버가 받지 않는 명령을 패널에 두지 않는다', () => {
    expect(DEV_COMMANDS.map(c => c.id).sort()).toEqual([...DEBUG_COMMAND_IDS].sort());
  });

  it('구역 선택지는 수배 구역 표에서 나온다', () => {
    expect(devZoneOptions().map(o => o.value)).toEqual(Object.keys(BOUNTY_LICENSE_FAME));
    expect(devZoneOptions()[0].label).toBe('태평양');
  });

  it('입력은 정수로 읽고 빈 칸은 보내지 않는다', () => {
    const stats = DEV_COMMANDS.find(c => c.id === 'stats.set')!;
    expect(parseDevArgs(stats, { gold: '1000.9', fame: '' })).toEqual({ ok: true, args: { gold: 1000 } });
    expect(parseDevArgs(stats, { gold: '많이' })).toEqual({ ok: false });
    const dex = DEV_COMMANDS.find(c => c.id === 'dex.completeZone')!;
    expect(parseDevArgs(dex, { zone: 'indian' })).toEqual({ ok: true, args: { zone: 'indian' } });
  });
});

describe('프리셋', () => {
  const ctx = (game: GameState) => ({ game, uid: 'u1', day: '2026-10-16' });

  it('수배 구역마다 네임드 직전 프리셋이 있다', () => {
    for (const zone of Object.keys(BOUNTY_LICENSE_FAME)) {
      expect(DEV_PRESETS.some(p => p.id === `named-ready:${zone}`)).toBe(true);
    }
  });

  it('네임드 직전 — 정리 → 라이선스 조건 → 실제 수주 → 강제 조우 대기 순서다', () => {
    const atPort = seed({ location: { kind: 'base', id: 'toamasina' } });
    const plan = planPreset(DEV_PRESETS.find(p => p.id === 'named-ready:madagascar')!, ctx(atPort));
    if (!plan.ok) throw new Error(plan.blocked);
    const quest = dailyQuestFor('madagascar', 'named', 'u1', '2026-10-16')!;
    expect(plan.steps).toEqual([
      { kind: 'debug', command: 'bounty.resetToday', args: {} },
      { kind: 'debug', command: 'bounty.clearProgress', args: {} },
      { kind: 'debug', command: 'bounty.clearTickets', args: {} },
      { kind: 'debug', command: 'stats.set', args: expect.objectContaining({ fame: BOUNTY_LICENSE_FAME.madagascar }) },
      { kind: 'debug', command: 'dex.completeZone', args: { zone: 'madagascar' } },
      { kind: 'action', action: { type: 'acceptQuest', questId: quest.id, port: 'toamasina' } },
      { kind: 'armEncounter' },
    ]);
  });

  it('배·낚싯대·명성은 낮출 때만 올리고 이미 높으면 유지한다', () => {
    const strong = seed({ location: { kind: 'base', id: 'harbor' }, fame: 999999, boat: 9, rod: 99 });
    const plan = planPreset(DEV_PRESETS.find(p => p.id === 'named-ready:pacific')!, ctx(strong));
    if (!plan.ok) throw new Error(plan.blocked);
    expect(plan.steps[3]).toEqual({ kind: 'debug', command: 'stats.set', args: { fame: 999999, boat: 9, rod: 99 } });
  });

  it('그 구역 항구 밖이면 실행하지 않고 어디서 하라고 알려 준다 — 수주는 수배판 위치를 요구한다', () => {
    const plan = planPreset(DEV_PRESETS.find(p => p.id === 'named-ready:madagascar')!, ctx(seed()));
    expect(plan).toEqual({ ok: false, blocked: '마다가스카르 항구 안에서 실행해야 한다 (수주는 수배판 위치를 요구한다).' });
  });
});
