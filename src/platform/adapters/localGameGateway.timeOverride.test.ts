// 시간대 설정 스토어 — LocalGameGateway 캐치 판정에 실제로 반영되는지 (밤/낮 전환)
import { describe, it, expect, beforeEach } from 'vitest';
import { LocalGameGateway } from './localGameGateway';
import { setTimeOverride, resetTimeOverride } from './timeOverride';
import { newState } from '../../game/rules/logic';

const clear = () => {
  try { localStorage.clear(); } catch { /* jsdom */ }
};

function catchOne(gateway: LocalGameGateway, spot: 'sea' | 'pond') {
  const r = gateway.dispatch({ type: 'catch', spot, judgment: 'normal' });
  if (r.status !== 'ok') throw new Error(`catch 실패: ${r.error}`);
  return r;
}

describe('시간대 설정 → LocalGameGateway', () => {
  beforeEach(() => {
    clear();
    resetTimeOverride();
  });

  it('밤으로 고정(분 0)하면 그 시각이 caughtAt으로 전달된다', () => {
    setTimeOverride('2026-09-06T00:00:00.000Z');
    const gateway = new LocalGameGateway({ ...newState(), gold: 1e9, boat: 1 });
    const out = catchOne(gateway, 'sea');
    const inst = out.state.bag[out.state.bag.length - 1];
    expect(inst.caughtAt).toBe('2026-09-06T00:00:00.000Z');
  });

  it('해제(null)하면 실제 벽시계 근처로 돌아온다', () => {
    setTimeOverride(null);
    const gateway = new LocalGameGateway(newState());
    const out = catchOne(gateway, 'pond');
    const inst = out.state.bag[out.state.bag.length - 1];
    expect(Math.abs(Date.parse(inst.caughtAt!) - Date.now())).toBeLessThan(5000);
  });
});
