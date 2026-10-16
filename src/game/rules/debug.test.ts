// 개발 도구 서버 명령 — debug 액션의 리듀서 몫. 상태 명령은 기존 규칙 함수로 계산하고,
// 전용 테이블 명령은 상태를 바꾸지 않고 감사 이벤트만 남긴다(행은 서버가 쓴다).
import { describe, it, expect } from 'vitest';
import { applyAction } from './actions';
import type { ActionDeps } from './actions';
import { licenseConditions, newState, zoneDexMissing } from './logic';
import type { GameState } from './logic';
import { DEBUG_COMMAND_IDS, DEBUG_TABLE_COMMANDS } from './debug';
import { artifactOfZone } from '../content/artifacts';

const deps: ActionDeps = {
  rng: () => 0, today: '2026-10-16', now: '2026-10-16T03:00:00.000Z', newUid: () => 'uid-1',
};
const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });
const debug = (state: GameState, command: string, args?: Record<string, unknown>) =>
  applyAction(state, { type: 'debug', command, args }, deps);

describe('debug 액션 — 공통', () => {
  it('모르는 명령은 bad-request', () => {
    expect(debug(seed(), 'nope')).toEqual({ ok: false, error: 'bad-request' });
  });

  it('모든 명령은 명령 id와 인자를 debug 감사 이벤트로 남긴다', () => {
    const out = debug(seed(), 'bounty.clearTickets');
    if (!out.ok) throw new Error(out.error);
    expect(out.events).toEqual([{ type: 'debug', payload: { command: 'bounty.clearTickets', args: {} } }]);
  });

  it('전용 테이블 명령은 상태를 바꾸지 않는다 — 행은 서버가 이벤트를 보고 쓴다', () => {
    const state = seed();
    for (const command of DEBUG_TABLE_COMMANDS) {
      const out = debug(state, command);
      if (!out.ok) throw new Error(`${command}: ${out.error}`);
      expect(out.state).toBe(state);
    }
    expect(DEBUG_TABLE_COMMANDS.every(c => DEBUG_COMMAND_IDS.includes(c))).toBe(true);
  });
});

describe('stats.set', () => {
  it('준 값만 바꾼다', () => {
    const out = debug(seed({ gold: 1, fame: 2 }), 'stats.set', { fame: 300000, boat: 2 });
    if (!out.ok) throw new Error(out.error);
    expect(out.state).toMatchObject({ gold: 1, fame: 300000, boat: 2 });
  });

  it('음수·소수 낚싯대·범위 밖 배는 bad-request', () => {
    expect(debug(seed(), 'stats.set', { gold: -1 })).toEqual({ ok: false, error: 'bad-request' });
    expect(debug(seed(), 'stats.set', { rod: 1.5 })).toEqual({ ok: false, error: 'bad-request' });
    expect(debug(seed(), 'stats.set', { boat: 99 })).toEqual({ ok: false, error: 'bad-request' });
    expect(debug(seed(), 'stats.set', { fame: '많이' })).toEqual({ ok: false, error: 'bad-request' });
  });
});

describe('dex.completeZone', () => {
  it('구역 도감을 채워 네임드 라이선스 도감 조건을 만족시킨다 — 판정 함수와 같은 기준', () => {
    const out = debug(seed(), 'dex.completeZone', { zone: 'madagascar' });
    if (!out.ok) throw new Error(out.error);
    expect(zoneDexMissing(out.state, 'madagascar', ['common', 'rare', 'epic', 'legendary'])).toEqual([]);
    expect(licenseConditions(out.state, 'madagascar', 'named').find(c => c.key === 'dex')?.ok).toBe(true);
  });

  it('이미 잡은 기록은 건드리지 않고, 새 기록은 첫 조우일을 오늘로 둔다', () => {
    const kept = { count: 7, maxSize: 30, first: '2026-01-01' };
    const out = debug(seed({ dex: { mackerel: { normal: kept } } }), 'dex.completeZone', { zone: 'pacific' });
    if (!out.ok) throw new Error(out.error);
    expect(out.state.dex.mackerel?.normal).toEqual(kept);
    expect(out.state.dex.hairtail?.normal).toEqual({ count: 1, maxSize: null, first: '2026-10-16' });
  });

  it('없는 구역은 bad-request', () => {
    expect(debug(seed(), 'dex.completeZone', { zone: 'atlantis' })).toEqual({ ok: false, error: 'bad-request' });
  });
});

describe('bounty.grantMaterial', () => {
  it('구역 유물의 교환 재료를 1개 준다', () => {
    const out = debug(seed(), 'bounty.grantMaterial', { zone: 'indian' });
    if (!out.ok) throw new Error(out.error);
    expect(out.state.items[artifactOfZone('indian')!.materialId]).toBe(1);
  });
});
