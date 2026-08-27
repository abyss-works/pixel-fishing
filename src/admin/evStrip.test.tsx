// 지역 내 Δ 정합성 검증 — 테스트로 영구 고정한다(유저가 "바뀌지 않았나" 의심한 지점).
// 표기 계약(사용자 확정): 행=축, 열=[축명 | EV | 직전 대비 | 지역 내]. 전부 % 본체(절대치 없음).
//   **수동 3축과 방치 2축은 같은 선상이 아니다**(사용자 지적):
//   GOOD      지역내Δ = (GOOD − 무판정) / 무판정 × 100        [이전 축 대비 %]
//   PERFECT           = (PERFECT − GOOD) / GOOD × 100        [〃]
//   방치(×4·×10)는 개별 Δ를 붙이지 않고 — 폭 하나만: (×4 − ×10) / ×10 × 100
//   [여유 확보 시 방치 소득 개선률 — 마지막 방치 행(×10)에 한 번 표기]
//   각 축 Δ직전 = 위 해역 같은 축 대비 %                     [해역 사다리]
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import FishTab from './tabs/FishTab';
import { SPOTS, drawRows } from '../game/logic';
import type { SpotId } from '../data/spots';

const AXES = [
  { key: 'normal', mult: {} },
  { key: 'good', mult: { rareMult: 1.6 } },
  { key: 'perfect', mult: { rareMult: 2.0 } },
  { key: 'idleBest', mult: { commonMult: 4 } },
  { key: 'idleWorst', mult: { commonMult: 10 } },
] as const;

function evOf(id: SpotId, o: Record<string, unknown>): number {
  const rows = drawRows(id, o as never);
  let num = 0, den = 0;
  for (const r of rows) { num += r.fishPct * r.fish.price; den += r.fishPct; }
  return den > 0 ? num / den : 0;
}

describe('기대값 띠 — 지역 내 Δ 공식 고정', () => {
  it('수동 사다리(GOOD/PERFECT)는 직전 축 대비 %, 방치는 폭 하나만 표기된다', () => {
    render(<FishTab />);
    for (const spot of SPOTS) {
      const id = spot.id as SpotId;
      const e = Object.fromEntries(AXES.map(a =>
        [a.key, evOf(id, a.mult)])) as Record<string, number>;
      const body = document.body.textContent ?? '';

      // GOOD: 무판정 대비 %
      const goodPct = Math.round((e.good - e.normal) / Math.abs(e.normal) * 100);
      expect(body).toMatch(new RegExp(`\\+${goodPct}%`));
      // PERFECT: GOOD 대비 %
      const pfPct = Math.round((e.perfect - e.good) / Math.abs(e.good) * 100);
      expect(body).toMatch(new RegExp(`[+-]${Math.abs(pfPct)}%`));
      // 방치 폭 — ×4 기준 개선률(%), "폭" 라벨로 한 번만 표기
      const spanPct = Math.round((e.idleBest - e.idleWorst) / Math.abs(e.idleWorst) * 100);
      expect(body).toMatch(new RegExp(`폭 \\+?${spanPct}%`));
    }
  });

  it('Δ직전은 모든 축에 렌더된다 — 무판정 축도 위 해역 대비 %를 가진다', () => {
    render(<FishTab />);
    if (SPOTS.length < 2) return;
    const a = SPOTS[0], b = SPOTS[1];
    const ea = evOf(a.id as SpotId, {});
    const eb = evOf(b.id as SpotId, {});
    const pct = Math.round((eb - ea) / Math.abs(ea) * 100);
    // 무판정 축 Δ직전이 살아 있어야 한다(과거엔 inRegion 부재로 통째로 사라졌다)
    expect(document.body.textContent).toMatch(
      new RegExp(`${eb.toFixed(1)}G[^G]*\\+${pct}%`));
  });
});
