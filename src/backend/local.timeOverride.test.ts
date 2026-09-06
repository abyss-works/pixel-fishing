// 시간대 설정 스토어 — LocalBackend 캐치 판정에 실제로 반영되는지 (밤/낮 전환)
import { describe, it, expect, beforeEach } from 'vitest';
import { LocalBackend } from './local';
import { setTimeOverride, resetTimeOverride } from '../admin/timeOverride';
import { newState } from '../game/logic';

const clear = () => {
  try { localStorage.clear(); } catch { /* jsdom */ }
};

function catchOne(backend: LocalBackend, spot: 'sea' | 'pond') {
  const r = backend.dispatch({ type: 'catch', spot, judgment: 'normal' });
  if (r.status !== 'ok') throw new Error(`catch 실패: ${r.error}`);
  return r;
}

describe('시간대 설정 → LocalBackend', () => {
  beforeEach(() => {
    clear();
    resetTimeOverride();
  });

  it('밤으로 고정(분 0)하면 그 시각이 caughtAt으로 전달된다', () => {
    setTimeOverride('2026-09-06T00:00:00.000Z');
    const backend = new LocalBackend({ ...newState(), gold: 1e9, boat: 1 });
    const out = catchOne(backend, 'sea');
    const inst = out.state.bag[out.state.bag.length - 1];
    expect(inst.caughtAt).toBe('2026-09-06T00:00:00.000Z');
  });

  it('해제(null)하면 실제 벽시계 근처로 돌아온다', () => {
    setTimeOverride(null);
    const backend = new LocalBackend(newState());
    const out = catchOne(backend, 'pond');
    const inst = out.state.bag[out.state.bag.length - 1];
    expect(Math.abs(Date.parse(inst.caughtAt!) - Date.now())).toBeLessThan(5000);
  });
});
