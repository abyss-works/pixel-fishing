// 밸런스 리포트 — 축 정의와 EV 산식의 닫힌형 검증.
// 대시보드가 "계산을 두 번 하지 않는다"는 원칙과 함께, 이 모듈이 goldEV와 동치임을
// 앵커로 고정한다(골드 축만 명성도 같은 구조라 골드로 전부 검증).
import { describe, it, expect } from 'vitest';
import { buildBalanceReport, goldEv, fameEv, EV_AXES } from './balanceReport';
import { goldEV } from '../../../game/rules/logic';

describe('보상 축 정의', () => {
  it('5축 — 수동 3(무판정/GOOD/PERFECT) + 방치 2(최소/최대 페널티)', () => {
    expect(EV_AXES.map(a => a.key)).toEqual(['normal', 'good', 'perfect', 'idleBest', 'idleWorst']);
    // 다이얼 매핑 — 판정은 ÷rareMult, 방치는 ×commonMult (rollFish common축 산식)
    const byKey = Object.fromEntries(EV_AXES.map(a => [a.key, a.options]));
    expect(byKey.normal).toEqual({});
    expect(byKey.good.rareMult).toBe(1.6);
    expect(byKey.perfect.rareMult).toBe(2.0);
    expect(byKey.idleBest.commonMult).toBe(4);   // 파워 여유 충분 상한
    expect(byKey.idleWorst.commonMult).toBe(10); // 진입 경계 기본값
  });
});

describe('EV 산식 — goldEV 동치 앵커', () => {
  it('중립/GOOD/방치축이 goldEV 다이얼 결과와 소수점 일치한다', () => {
    expect(goldEv('pond', {})).toBeCloseTo(goldEV('pond'), 9);
    expect(goldEv('pond', { rareMult: 1.6 })).toBeCloseTo(goldEV('pond', { rareMult: 1.6 }), 9);
    expect(goldEv('barrierreef', { commonMult: 10 }))
      .toBeCloseTo(goldEV('barrierreef', { commonMult: 10 }), 9);
  });

  it('축 간 단조성 — 무판정 < GOOD < PERFECT, 방치 최대 ≤ 방치 최소', () => {
    for (const s of ['pond', 'deep', 'barrierreef'] as const) {
      const n = goldEv(s, {});
      const g = goldEv(s, { rareMult: 1.6 });
      const p = goldEv(s, { rareMult: 2 });
      const b4 = goldEv(s, { commonMult: 4 });
      const b10 = goldEv(s, { commonMult: 10 });
      expect(n).toBeLessThan(g);
      expect(g).toBeLessThan(p);
      expect(b10).toBeLessThan(b4);
      void n;
    }
  });

  it('명성 EV — 등급 고정 명성의 가중합으로 중립 연못 ≈ 8.75 부근(일반9.7 둔화 규칙)', () => {
    const f = fameEv('pond', {});
    expect(f).toBeGreaterThan(8);
    expect(f).toBeLessThan(11);
  });
});

describe('전체 리포트 조립', () => {
  const rows = buildBalanceReport();

  it('SPOTS 순서 그대로 — 첫 행은 Δ 없음, 이후 행은 이전 행 대비 절대 차분', () => {
    expect(rows[0].deltaGold).toBeNull();
    expect(rows[0].deltaFame).toBeNull();
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].deltaGold).toBeCloseTo(rows[i].gold.normal - rows[i - 1].gold.normal, 9);
    }
  });

  it('오버라이드 수역 표기 — 배리어 리프는 실효 예산에 epic이 아예 없다(재균등 흡수)', () => {
    const reef = rows.find(r => r.id === 'barrierreef')!;
    expect(reef.override).toEqual({ common: 74, rare: 23, legendary: 3 });
    expect('epic' in reef.budgets).toBe(false);
    expect(reef.budgets.common).toBe(74);
    const plain = rows.find(r => r.id === 'pond')!;
    expect(plain.override).toBeNull();           // 글로벌 표 사용
    expect(plain.budgets.legendary).toBe(1);     // drawRows 행에서 역산된 글로벌 값
  });

  it('진행 사다리 정합 — boatTier/powerReq가 SPOTS 등록 순서를 따르고 지역 내 완만·지역 간 급등 형태', () => {
    // 배 단계 비내림차순 + 인도양 진입 골든 중립 EV 배 증가 배3→4
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].boatTier).toBeGreaterThanOrEqual(rows[i - 1].boatTier);
    }
    const reef = rows.find(r => r.id === 'barrierreef')!.gold.normal;
    const indian = rows.find(r => r.id === 'indian')!.gold.normal;
    // 2026-08-27 관리자 시뮬 확정분(예산 ×2) 반영 — 인도양/리프 = 379.4/298.7 ≈ 1.27
    expect(indian / reef).toBeGreaterThan(1.25);   // 지역 간 사다리 존재
    const dh = rows.find(r => r.id === 'dragonhole')!.gold.normal;
    const coron = rows.find(r => r.id === 'coron')!.gold.normal;
    expect(coron / dh).toBeLessThan(1.5);         // 지역 내부는 완만
  });
});
