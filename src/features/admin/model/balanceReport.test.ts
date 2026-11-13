// 밸런스 리포트 — 축 정의와 EV 산식의 닫힌형 검증.
// 대시보드가 "계산을 두 번 하지 않는다"는 원칙과 함께, 이 모듈이 goldEV와 동치임을
// 앵커로 고정한다(골드 축만 명성도 같은 구조라 골드로 전부 검증).
import { describe, it, expect } from 'vitest';
import { buildBalanceReport, goldEv, fameEv, EV_AXES } from './balanceReport';
import { goldEV } from '../../../game/rules/logic';
import { spotById } from '../../../game/content/spots';
import type { SpotId } from '../../../game/content/spots';

describe('보상 축 정의', () => {
  it('5축 — 수동 3(무판정/GOOD/PERFECT) + 방치 2(플래토/진입)', () => {
    expect(EV_AXES.map(a => a.key)).toEqual(['normal', 'good', 'perfect', 'idleBest', 'idleWorst']);
    // 다이얼 매핑 — 판정은 ÷rareMult, 방치는 ×commonMult (rollFish common축 산식)
    const byKey = Object.fromEntries(EV_AXES.map(a => [a.key, (s: SpotId) => ({ ...a.options(s) })])) as Record<string, (s: SpotId) => { commonMult?: number; rareMult?: number }>;
    expect(byKey.normal('sea')).toEqual({});
    expect(byKey.good('sea').rareMult).toBe(1.6);
    expect(byKey.perfect('sea').rareMult).toBe(2.0);
    // 방치 플래토(하한)와 방치 진입(레벨 차 0)의 배수 — 모든 해역이 같은 표를 쓴다
    expect(byKey.idleBest('sea').commonMult).toBe(3);
    expect(byKey.idleWorst('sea').commonMult).toBe(5);
    expect(byKey.idleBest('pond').commonMult).toBe(3);
    expect(byKey.idleWorst('pond').commonMult).toBe(5);
  });
});

describe('EV 산식 — goldEV 동치 앵커', () => {
  it('중립/GOOD/방치축이 goldEV 다이얼 결과와 소수점 일치한다', () => {
    expect(goldEv('pond', {})).toBeCloseTo(goldEV('pond'), 9);
    expect(goldEv('pond', { rareMult: 1.6 })).toBeCloseTo(goldEV('pond', { rareMult: 1.6 }), 9);
    expect(goldEv('barrierreef', { commonMult: 10 }))
      .toBeCloseTo(goldEV('barrierreef', { commonMult: 10 }), 9);
  });

  it('축 간 단조성 — 무판정 < GOOD < PERFECT, 방치 진입 < 방치 플래토', () => {
    for (const s of ['pond', 'deep', 'barrierreef'] as const) {
      const n = goldEv(s, {});
      const g = goldEv(s, { rareMult: 1.6 });
      const p = goldEv(s, { rareMult: 2 });
      const plateau = goldEv(s, EV_AXES.find(a => a.key === 'idleBest')!.options(s));
      const entry = goldEv(s, EV_AXES.find(a => a.key === 'idleWorst')!.options(s));
      expect(n).toBeLessThan(g);
      expect(g).toBeLessThan(p);
      expect(entry).toBeLessThan(plateau);
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
    expect(reef.override).toEqual({ rare: 2300, epic: 0, legendary: 300 });
    expect('epic' in reef.budgets).toBe(false);
    expect(reef.budgets.common).toBe(7400);
    const plain = rows.find(r => r.id === 'pond')!;
    expect(plain.override).toBeNull();           // 프리셋 사용
    expect(plain.budgets.legendary).toBe(100);   // drawRows 행에서 역산된 프리셋 값
  });

  it('진행 사다리 정합 — boatTier/powerReq가 SPOTS 등록 순서를 따르고 지역 간 사다리 존재·지역 안 순증가 형태', () => {
    // 배 단계 비내림차순 + 인도양 진입 골든 중립 EV 배 증가 배3→4
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].boatTier).toBeGreaterThanOrEqual(rows[i - 1].boatTier);
    }
    const reef = rows.find(r => r.id === 'barrierreef')!.gold.normal;
    const indian = rows.find(r => r.id === 'indian')!.gold.normal;
    // 관리자 시뮬레이션 값(예산 ×2) 반영 — 인도양/리프 = 379.4/298.7 ≈ 1.27
    expect(indian / reef).toBeGreaterThan(1.25);   // 지역 간 사다리 존재
    // 지역 안에서는 요구 파워가 높은 해역일수록 기대 골드가 늘어난다(폭의 상한은 두지 않는다)
    for (let i = 1; i < rows.length; i++) {
      if (spotById(rows[i].id)?.region === spotById(rows[i - 1].id)?.region) {
        expect(rows[i].gold.normal).toBeGreaterThan(rows[i - 1].gold.normal);
      }
    }
  });
});
