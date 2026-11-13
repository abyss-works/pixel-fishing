import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BOATS } from '../../../src/game/content/boats';
import { HELP, parseArgs, renderText, runCli, runFlow } from './report';
import type { FlowOptions } from './report';
import { DEFAULT_SEED, DEFAULT_TRIALS } from './dist';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const makeDir = () => { const d = mkdtempSync(join(tmpdir(), 'flow-report-')); dirs.push(d); return d; };

const base = (over: Partial<FlowOptions> = {}): FlowOptions => ({ ...parseArgs([]), ...over });

describe('없앤 옵션', () => {
  it('유형, 손실, 가방, 이동 보정 옵션은 사용법 오류다', () => {
    for (const flag of ['--loss4h', '--bag-cap-awake', '--travel-share']) {
      const r = runCli(flag === '--bag-cap-awake' ? [flag] : [flag, '10']);
      expect(r.exitCode, flag).toBe(1);
      expect(r.stderr, flag).toContain('알 수 없는 옵션');
      expect(HELP).not.toContain(flag);
    }
  });
});

describe('명령 인자', () => {
  it('인자가 없으면 네 명령 전부와 기본값이다', () => {
    expect(parseArgs([])).toEqual({
      commands: ['transition', 'days', 'opening', 'exception', 'ev'], override: null, json: false,
      legendAt: null, axis: 'idle', axisGiven: false, maxDays: 365, help: false,
      seed: DEFAULT_SEED, trials: DEFAULT_TRIALS,
      effect: { bite: 0, rare: 0, epic: 0, legendary: 0, variant: 0, size: 0, move: 0, named: 0 }, margin: 0, units: { common: 1, rare: 5, epic: 25, legendary: 125 }, windowMinutes: 30, recipe: null, hours: 9, cost: {}, manualShare: null, visitHours: null, rodOffset: null, bounty: false, fromBoat: null, withCost: false, rewards: [], rewardSplit: null,
      growth: false, targets: [], boatShare: null, levels: null, rewardBasis: null, basis: {},
      design: { start: null, growth: null, gap: { all: null, by: {} }, hours: { all: null, by: {} }, payback: { all: null, by: {} }, paybackGrowth: null, anchors: [], anchorNone: false, solve: null, grades: {}, night: {}, emitOverride: null, reversalTolerance: 0, hFactors: {}, hScale: null, hStart: null, specialRegions: [], bite: 'both' },
    });
  });

  it('명령 하나와 옵션을 읽는다', () => {
    const o = parseArgs(['days', '--override', 'a.json', '--json', '--legend-at', '12', '--axis', 'manual', '--max-days', '90']);
    expect(o).toMatchObject({ commands: ['days'], override: 'a.json', json: true, legendAt: 12, axis: 'manual', maxDays: 90 });
  });

  it('--help를 알아본다', () => {
    expect(parseArgs(['--help']).help).toBe(true);
  });

  it('모르는 명령과 옵션, 값 없는 옵션, 잘못된 값, 명령 두 개를 거부한다', () => {
    expect(() => parseArgs(['nothing'])).toThrow(/명령/);
    expect(() => parseArgs(['--nothing'])).toThrow(/옵션/);
    expect(() => parseArgs(['days', '--override'])).toThrow(/값/);
    expect(() => parseArgs(['--axis', 'fast'])).toThrow(/idle/);
    expect(() => parseArgs(['--legend-at', 'x'])).toThrow(/숫자/);
    expect(() => parseArgs(['--max-days', '0'])).toThrow(/1 이상/);
    expect(() => parseArgs(['days', 'opening'])).toThrow(/하나/);
  });

  it('도움말이 모든 명령과 옵션을 설명한다', () => {
    for (const w of ['transition', 'days', 'opening', 'exception', 'ev', '--override', '--json', '--legend-at', '--axis', '--max-days', '--help', 'dist', 'travel', '--seed', '--trials']) {
      expect(HELP).toContain(w);
    }
  });
});

describe('실행과 출력', () => {
  it('전환 출력은 전환 골드 비중 표와 전환 시간 표를 담고 유형별 표는 없다', () => {
    const text = renderText(runFlow(base({ commands: ['transition'] })));
    for (const w of ['전환 골드와 비중', '강화 비중', '전환 시간', '일수(÷8)']) expect(text).toContain(w);
    expect(text).not.toContain('###');
    expect(text).not.toMatch(/유형|일째|낚시 (100|75|50)%/);
  });

  it('전환 시간 표의 일수는 전환 시간 ÷ 8 하나다', () => {
    const t = runFlow(base({ commands: ['transition'] })).transition!;
    const text = renderText(runFlow(base({ commands: ['transition'] })));
    for (const x of t.timings) {
      expect(text).toContain(`${x.hours.toFixed(2)}시간 | ${(x.hours / 8).toFixed(1)}일`);
    }
  });

  it('같은 명령을 두 번 실행하면 출력이 바이트까지 같다', () => {
    const o = base({ commands: ['transition', 'opening', 'exception'] });
    expect(renderText(runFlow(o))).toBe(renderText(runFlow(o)));
    const j = base({ commands: ['days'], json: true });
    expect(JSON.stringify(runFlow(j))).toBe(JSON.stringify(runFlow(j)));
  });

  it('최초 10분 출력은 판정과 보장 번호별 도착 시간을 담는다', () => {
    const text = renderText(runFlow(base({ commands: ['opening'], legendAt: 15 })));
    expect(text).toContain('최초 10분');
    expect(text).toContain('무판정');
    expect(text).toContain('GOOD');
    expect(text).toContain('보장 없음');
    expect(text).toContain('전설 15번째');
  });

  it('예외 흐름 출력은 오프셋 표와 조기 진입, 복귀, 토벌 표를 담는다', () => {
    const text = renderText(runFlow(base({ commands: ['exception'] })));
    for (const w of ['진입 레벨 대비 수입', '조기 진입', '낮은 지역으로 돌아옴', '네임드 토벌 비용', '-4', '+4']) expect(text).toContain(w);
  });

  it('일수 출력은 의뢰 수행 여부별 누적 실질 낚시 시간과 8시간 환산 일수, 레벨업 시간을 담는다', () => {
    const text = renderText(runFlow(base({ commands: ['days'] })));
    for (const w of ['누적 도달', '수행 안 함', '모두 수행', '레벨업', '시간 (', '일)']) expect(text).toContain(w);
    expect(text).not.toMatch(/일째|유형|낚시 (100|75|50)%/);
  });

  it('환산 일수 예: 12시간은 1.5일, 40시간은 5.0일이고 16시간과 4시간 기준 열은 없다', () => {
    const text = renderText(runFlow(base({ commands: ['transition', 'days'] })));
    expect(text).not.toMatch(/16시간 기준|4시간 기준|낚시 75%|낚시 100%|낚시 50%/);
    expect((12 / 8).toFixed(1)).toBe('1.5');
    expect((40 / 8).toFixed(1)).toBe('5.0');
  });

  it('덮어쓴 해역 요구 파워가 표 라벨에도 덮어쓴 값으로 나온다', () => {
    const dir = makeDir();
    const file = join(dir, 'o.json');
    writeFileSync(file, JSON.stringify({ spots: { sthelena: { powerReq: 165 } } }), 'utf-8');
    const text = renderText(runFlow(base({ commands: ['transition', 'exception'], override: file })));
    expect(text).toContain('Lv32(165)');
    expect(text).not.toContain('Lv29(150)');
    expect(text).toContain('세인트헬레나(32)');
    expect(text).not.toContain('세인트헬레나(29)');
  });

  it('각 명령 출력은 그 표가 기대는 가정을 가정: 으로 밝힌다', () => {
    const t = (c: 'transition' | 'days' | 'opening' | 'exception') => renderText(runFlow(base({ commands: [c] })));
    const want: Record<string, string[]> = {
      transition: ['가정:', '실질 낚시 시간', '÷ 8', '명성을 기다리는 동안'],
      days: ['가정:', '0.5', '어종 천장', '결투', '레벨업', '라이선스', '골드 보상만'],
      opening: ['가정:', '낚는 시간만'],
      exception: ['가정:', '줄 끊김', '결투'],
    };
    for (const [c, words] of Object.entries(want)) {
      const text = t(c as 'days');
      for (const w of words) expect(text, `${c} ${w}`).toContain(w);
    }
  });

  it('ev 출력은 해역별 EV, 구역 대표 EV, 보상의 EV 시간 환산과 가정을 담는다', () => {
    const text = renderText(runFlow(base({ commands: ['ev'] })));
    expect(text).not.toContain('구역 해역 딱렙 평균');
    expect(text).not.toContain('후보 2');
    for (const w of ['방치 EV', '구역 대표', '마지막 해역의 딱렙', 'EV 시간', '목표', '새 보상', '변화율', '네임드', '가정:', '5의 배수']) expect(text, w).toContain(w);
  });

  it('ev 출력은 덮어쓴 해역 요구 파워를 반영한다', () => {
    const dir = makeDir();
    const file = join(dir, 'o.json');
    writeFileSync(file, JSON.stringify({ spots: { sthelena: { powerReq: 165 } } }), 'utf-8');
    const a = renderText(runFlow(base({ commands: ['ev'] })));
    const b = renderText(runFlow(base({ commands: ['ev'], override: file })));
    expect(b).not.toBe(a);
    expect(b).toMatch(/세인트헬레나 \| 32 \|/);
    expect(a).toMatch(/세인트헬레나 \| 27 \|/);
  });

  it('유형, 손실, 가방, 잠 가정 문구는 어느 명령의 출력에도 없다', () => {
    const text = renderText(runFlow(base({ commands: ['transition', 'days', 'opening', 'exception', 'ev'] })));
    for (const w of ['유형', '낚지 못하는 비율', '잠든', '가방 한도', '사용자 확인 대기', '--bag-cap-awake', '--loss4h', '--travel-share']) {
      expect(text, w).not.toContain(w);
    }
    expect(text).toContain('지나온 해역으로 돌아가 도감을 채우지 않는다');
  });

  it('JSON 출력은 선택한 명령의 데이터만 담는다', () => {
    const r = runFlow(base({ commands: ['opening'], json: true }));
    expect(Object.keys(r).sort()).toEqual(['opening', 'options']);
    expect(JSON.parse(JSON.stringify(r)).opening).toBeInstanceOf(Array);
  });

  it('덮어쓰기는 실행 중에만 적용되고 끝나면 원래 값으로 돌아온다', () => {
    const dir = makeDir();
    const file = join(dir, 'o.json');
    writeFileSync(file, JSON.stringify({ boats: { [String(BOATS[0].tier)]: { price: 5000 } } }), 'utf-8');
    const o = base({ commands: ['transition'] });
    const before = renderText(runFlow(o));
    const price = BOATS[0].price;
    const changed = renderText(runFlow({ ...o, override: file }));
    expect(changed).not.toBe(before);
    expect(changed).toContain('5,000');
    expect(BOATS[0].price).toBe(price);
    expect(renderText(runFlow(o))).toBe(before);
  });

  it('없는 덮어쓰기 파일은 실패하고 값을 바꾸지 않는다', () => {
    const price = BOATS[0].price;
    expect(() => runFlow(base({ commands: ['transition'], override: join(tmpdir(), 'no-such-flow-override.json') }))).toThrow(/읽을 수 없습니다/);
    expect(BOATS[0].price).toBe(price);
  });
});

describe('gates 명령', () => {
  it('gates는 명령 생략 때의 기본 실행에 들어가지 않고 이름으로만 고른다', () => {
    expect(parseArgs([]).commands).not.toContain('gates');
    expect(parseArgs(['gates', '--override', 'a.json']).commands).toEqual(['gates']);
    expect(HELP).toContain('gates');
  });

  it('덮어쓰기 없이 현재 값에서 통과하고, 예외 목록의 전환은 예외로 나오며, 종료 코드는 0이다', () => {
    const r = runCli(['gates']);
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toBe('');
    expect(r.stdout).not.toMatch(/\| 위반 \|/);
    expect(r.stdout).toContain('위반 0');
    expect(r.stdout).toContain('이동 전 수입');
    expect(r.stdout).toContain('이동 직후 수입');
    expect(r.stdout).toMatch(/남인도양.*예외/);
    expect(r.stdout).toMatch(/통과/);
  });

  it('게이트 네 가지와 전환 시간 판정을 모두 낸다', () => {
    const text = runCli(['gates']).stdout;
    for (const w of ['이동 직후 수입', 'PERFECT 이상치', '배 명성 대기 ÷ 골드 대기', '최초 10분 도달', '전환 시간의 목표 판정', '요구 파워 간격', '순서']) {
      expect(text, w).toContain(w);
    }
    expect(text).toMatch(/전체 — 통과 \d+, 예외 \d+, 개선 0, 위반 0/);
  });

  it('전환 시간 판정 표: 지역 진입 전환은 범위와 판정, 지역 안 전환은 범위 없이 파워 간격, 리프까지는 판정 없이 시간만 낸다', () => {
    const all = runCli(['gates']).stdout;
    const text = all.slice(all.indexOf('## 전환 시간의 목표 판정'));
    const row = (to: string) => text.split(String.fromCharCode(10)).find(l => l.startsWith('| ') && l.includes(`→ ${to} |`) && l.includes('시간'))!;
    expect(row('인도양')).toMatch(/3~4시간.*예외/);
    expect(row('남인도양')).toContain('범위 없음');
    expect(row('남인도양')).toMatch(/\| 15 \| 10 \|/);
    expect(row('마리아나 해구')).toContain('관측');
    expect(row('마리아나 해구')).not.toMatch(/통과|예외|위반/);
  });

  it('반례: 최대 일수 안에 끝나지 않으면 닿지 못한 전환을 위반으로 내고 종료 코드는 1이다', () => {
    const r = runCli(['gates', '--max-days', '7']);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain('최대 일수 안에 닿지 못한 전환');
    expect(r.stdout).toMatch(/남대서양 용승대 → 세인트헬레나 \| 지역 안 \| 닿지 못함 .*위반/);
    expect(r.stdout).toMatch(/위반 [1-9]/);
    expect(runCli(['gates']).exitCode).toBe(0);
  });

  it('반례: 해역 하나의 어종 가격 배율을 크게 낮추면 그 전환이 위반이고 종료 코드는 1이다', () => {
    const dir = makeDir();
    const file = join(dir, 'low.json');
    writeFileSync(file, JSON.stringify({ spots: { mozstrait: { priceMult: 0.1 } } }), 'utf-8');
    const r = runCli(['gates', '--override', file]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toMatch(/모잠비크.*위반/);
    expect(runCli(['gates']).exitCode).toBe(0);
  });

  it('반례: 예외 해역이 알려진 값보다 나빠지면(남인도양, 코모로 심해 배율 0.3) 위반이고 종료 코드 1이다', () => {
    const file = join(makeDir(), 'worse.json');
    writeFileSync(file, JSON.stringify({ spots: { southindian: { priceMult: 0.3 }, comorodeep: { priceMult: 0.3 } } }), 'utf-8');
    const r = runCli(['gates', '--override', file]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toMatch(/남인도양 \| 낮 풀 .*위반/);
  });

  it('JSON 출력도 위반이 있으면 종료 코드 1이고, 오류는 종료 코드 1과 stderr다', () => {
    expect(runCli(['gates', '--json']).exitCode).toBe(0);
    const file = join(makeDir(), 'low-json.json');
    writeFileSync(file, JSON.stringify({ spots: { mozstrait: { priceMult: 0.1 } } }), 'utf-8');
    const bad2 = runCli(['gates', '--json', '--override', file]);
    expect(bad2.exitCode).toBe(1);
    expect(JSON.parse(bad2.stdout).gates.move.some((g: { verdict: string }) => g.verdict === '위반')).toBe(true);
    const bad = runCli(['gates', '--override', join(tmpdir(), 'no-such-flow-override.json')]);
    expect(bad.exitCode).toBe(1);
    expect(bad.stderr).toContain('오류:');
  });
});

describe('분포와 이동 명령', () => {
  const small = (over: Partial<FlowOptions> = {}) => base({ trials: 8, ...over });

  it('분포 인자를 읽는다', () => {
    expect(parseArgs(['dist', '--seed', '5', '--trials', '50'])).toMatchObject({ commands: ['dist'], seed: 5, trials: 50 });
    expect(parseArgs(['travel']).commands).toEqual(['travel']);
  });

  it('명령을 생략해도 분포와 이동 측정은 내지 않는다', () => {
    expect(parseArgs([]).commands).not.toContain('dist');
    expect(parseArgs([]).commands).not.toContain('travel');
  });

  it('잘못된 분포 인자를 거부한다', () => {
    expect(() => parseArgs(['--trials', '0'])).toThrow(/1 이상/);
    expect(() => parseArgs(['--trials', '2.5'])).toThrow(/정수/);
    expect(() => parseArgs(['--seed', '1.5'])).toThrow(/정수/);
  });

  it('분포 출력은 시드와 시도 횟수, 느린 쪽의 뜻, 두 분포 표를 담는다', () => {
    const text = renderText(runFlow(small({ commands: ['dist'], seed: 3 })));
    for (const w of ['시드 3', '시도 8회', 'p10', '중앙값', 'p90', '운이 나쁜', '최초 10분', '영웅 보장', '전설 보장', '첫 바다 해역 도착', '해역 전환', '해석 기댓값', '가정:']) {
      expect(text, w).toContain(w);
    }
  });

  it('같은 인자는 표와 JSON이 바이트까지 같고 시드가 다르면 달라진다', () => {
    const o = small({ commands: ['dist'], seed: 3 });
    const a = runFlow(o), b = runFlow(o);
    expect(renderText(a)).toBe(renderText(b));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(renderText(runFlow({ ...o, seed: 4 }))).not.toBe(renderText(a));
  });

  it('이동 측정 출력은 해역별 거리, 속도, 왕복, 비중을 담고 관측 전용임을 밝힌다', () => {
    const text = renderText(runFlow(base({ commands: ['travel'] })));
    for (const w of ['이동 시간 측정', '거리', '속도', '왕복', '비중', '5%', '관측 전용', '가정:', '마을 연못', '세인트헬레나']) expect(text, w).toContain(w);
    expect(text).not.toContain('일괄 보정');
  });

  it('다른 명령의 출력에는 이동 시간 줄이 없고 시간은 이동을 넣지 않은 값이다', () => {
    const t = renderText(runFlow(base({ commands: ['transition'] })));
    expect(t).not.toContain('이동 시간');
    expect(t).toContain('| 인도양 → 남인도양 | 4.93시간');
    expect(t).toContain('| 남대서양 용승대 → 세인트헬레나 | 15.85시간');
  });

  it('분포 명령은 최대 일수가 짧아 끝내지 못해도 죽지 않고 미도달을 밝힌다', () => {
    const r = runCli(['dist', '--max-days', '1', '--trials', '40']);
    expect(r.stderr).toBe('');
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('미도달');
  });

  it('해석 기댓값이 항상 같은 전환 분포 표에 누적 행이 있다', () => {
    expect(renderText(runFlow(small({ commands: ['dist'] })))).toContain('누적');
  });
});

describe('effects 명령', () => {
  it('효과 옵션을 퍼센트와 배수로 읽고 기본은 효과 없음이다', () => {
    expect(parseArgs([]).effect).toEqual({ bite: 0, rare: 0, epic: 0, legendary: 0, variant: 0, size: 0, move: 0, named: 0 });
    const o = parseArgs(['effects', '--bite', '10', '--rare', '10', '--epic', '50', '--legendary', '200', '--variant', '100', '--size', '50', '--move', '10', '--named', '20', '--margin', '4', '--units', '1,2,3,4']);
    expect(o.commands).toEqual(['effects']);
    expect(o.effect).toEqual({ bite: 0.1, rare: 0.1, epic: 0.5, legendary: 2, variant: 1, size: 0.5, move: 0.1, named: 0.2 });
    expect(o.margin).toBe(4);
    expect(o.units).toEqual({ common: 1, rare: 2, epic: 3, legendary: 4 });
  });

  it('명령을 생략하면 내지 않는다', () => {
    expect(parseArgs([]).commands).not.toContain('effects');
  });

  it('낚싯대 여유를 -4부터 받는다', () => {
    expect(parseArgs(['effects', '--margin', '-4']).margin).toBe(-4);
    expect(parseArgs(['effects', '--margin', '-1']).margin).toBe(-1);
  });

  it('음수 여유는 조기 진입 비교 표를 더하고 0 이상이면 내지 않는다', () => {
    const t = runCli(['effects', '--margin', '-2', '--rare', '10', '--trials', '2']).stdout;
    expect(t).toContain('## 조기 진입 비교');
    expect(t).toContain('낚싯대는 해역 진입 레벨 -2');
    expect(runCli(['effects', '--trials', '2']).stdout).not.toContain('## 조기 진입 비교');
  });

  it('효과 옵션은 effects 명령에서만 쓸 수 있고 범위를 벗어나면 오류다', () => {
    expect(() => parseArgs(['--bite', '10'])).toThrow(/명령에서만/);
    expect(() => parseArgs(['dist', '--rare', '10'])).toThrow(/명령에서만/);
    expect(() => parseArgs(['ev', '--bite', '10'])).toThrow(/명령에서만/);
    expect(() => parseArgs(['effects', '--bite', '100'])).toThrow(/입질/);
    expect(() => parseArgs(['effects', '--variant', '-5'])).toThrow(/돌연변이/);
    expect(() => parseArgs(['effects', '--epic', '-5'])).toThrow(/영웅/);
    expect(() => parseArgs(['effects', '--legendary', '-5'])).toThrow(/전설/);
    expect(() => parseArgs(['effects', '--margin', '1.5'])).toThrow(/정수/);
    expect(() => parseArgs(['effects', '--margin', '-5'])).toThrow(/-4/);
    expect(() => parseArgs(['effects', '--units', '1,5,25'])).toThrow(/등급 수/);
    expect(() => parseArgs(['effects', '--bite', 'x'])).toThrow(/숫자/);
  });

  it('세 지표를 표로 내고 효과 없음이면 변화가 모두 0이다', () => {
    const r = runCli(['effects', '--trials', '5']);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('효과 없음');
    expect(r.stdout).toContain('## 효과를 넣은 수입');
    expect(r.stdout).toContain('## 도감 완성 시간');
    expect(r.stdout).toContain('## 재료 공급');
    expect(r.stdout).not.toMatch(/\| [+-][1-9]\d*\.\d%/);
  });

  it('판매 왕복을 넣은 열은 항상 내고, 네임드 효과는 조우 열을 더한다', () => {
    const t = runCli(['effects', '--move', '10', '--named', '10', '--trials', '3']).stdout;
    expect(t).toContain('판매 왕복 포함 골드 변화');
    expect(t).toContain('네임드 조우 기대');
    expect(t).toContain('없음');
    const plain = runCli(['effects', '--trials', '3']).stdout;
    expect(plain).toContain('판매 왕복 포함 골드 변화');
    expect(plain).not.toContain('네임드 조우 기대');
  });

  it('등급 가중은 영향받는 등급의 캐치 비율 열을 더하고 도감 표는 영웅, 전설 열을 항상 낸다', () => {
    const t = runCli(['effects', '--epic', '50', '--trials', '3']).stdout;
    expect(t).toContain('영웅 이상 가중 +50%');
    expect(t).toContain('영웅 캐치 비율');
    expect(t).toContain('전설 캐치 비율');
    expect(t).not.toContain('희귀 캐치 비율');
    expect(t).toContain('영웅 도감 전부');
    expect(t).toContain('전설 도감 전부');
    const l = runCli(['effects', '--legendary', '100', '--trials', '3']).stdout;
    expect(l).toContain('전설 가중 +100%');
    expect(l).not.toContain('영웅 캐치 비율');
    const plain = runCli(['effects', '--trials', '3']).stdout;
    expect(plain).not.toContain('캐치 비율');
    expect(plain).toContain('영웅 도감 전부');
  });

  it('JSON은 효과와 세 지표를 담고 같은 시드는 같은 결과다', () => {
    const a = runCli(['effects', '--bite', '10', '--trials', '5', '--json']).stdout;
    expect(a).toBe(runCli(['effects', '--bite', '10', '--trials', '5', '--json']).stdout);
    const j = JSON.parse(a);
    expect(j.effects.effect.bite).toBe(0.1);
    expect(j.effects.income.length).toBe(j.effects.dex.length);
    expect(j.effects.supply.length).toBe(j.effects.dex.length);
  });
});

describe('window 명령', () => {
  it('수동 GOOD이 기본이고 창은 30분이다', () => {
    const o = parseArgs(['window', '--rare', '20']);
    expect(o.commands).toEqual(['window']);
    expect(o.axis).toBe('manual');
    expect(o.windowMinutes).toBe(30);
    expect(parseArgs(['window', '--axis', 'idle']).axis).toBe('idle');
    expect(parseArgs(['window', '--window', '45']).windowMinutes).toBe(45);
  });

  it('등급 미끼 이름이 효과 옵션을 채운다', () => {
    expect(parseArgs(['window', '--bait', 'rare']).effect.rare).toBeCloseTo(0.2, 12);
    expect(parseArgs(['window', '--bait', 'epic']).effect.epic).toBeCloseTo(0.4, 12);
    expect(parseArgs(['window', '--bait', 'legendary']).effect.legendary).toBeCloseTo(0.6, 12);
    expect(() => parseArgs(['window', '--bait', 'common'])).toThrow(/미끼/);
  });

  it('--window는 window 명령에서만, 0보다 커야 한다', () => {
    expect(() => parseArgs(['effects', '--window', '30'])).toThrow(/window 명령/);
    expect(() => parseArgs(['window', '--window', '0'])).toThrow(/0보다/);
  });

  it('창 안 캐치 수와 도감 단축 표를 낸다', () => {
    const r = runCli(['window', '--bait', 'epic', '--trials', '5']);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('## 창 안 기대 캐치 수');
    expect(r.stdout).toContain('## 창 하나가 도감 완성 시간을 줄이는 양');
    expect(r.stdout).toContain('영웅 이상 가중 +40%');
    expect(r.stdout).toContain('창 30분');
  });

  it('JSON은 같은 시드에서 같다', () => {
    const a = runCli(['window', '--bait', 'legendary', '--trials', '4', '--json']).stdout;
    expect(a).toBe(runCli(['window', '--bait', 'legendary', '--trials', '4', '--json']).stdout);
    expect(JSON.parse(a).window.rows.length).toBeGreaterThan(0);
  });
});

describe('recipes 명령', () => {
  it('옵션을 읽고 효과 옵션은 받지 않는다', () => {
    const o = parseArgs(['recipes', '--recipe', 'cook-lunch-bundle', '--hours', '6', '--margin', '-2', '--axis', 'manual']);
    expect(o).toMatchObject({ commands: ['recipes'], recipe: 'cook-lunch-bundle', hours: 6, margin: -2, axis: 'manual' });
    expect(() => parseArgs(['recipes', '--bite', '10'])).toThrow(/명령에서만/);
    expect(() => parseArgs(['recipes', '--recipe', 'nope'])).toThrow(/레시피/);
    expect(() => parseArgs(['recipes', '--hours', '0'])).toThrow(/0보다/);
    expect(() => parseArgs(['effects', '--hours', '5'])).toThrow(/명령에서만/);
  });

  it('effects와 window에서는 레시피의 효과를 효과 옵션에 채운다', () => {
    expect(parseArgs(['effects', '--recipe', 'cook-lunch-bite']).effect.bite).toBeCloseTo(0.1, 12);
    expect(parseArgs(['window', '--recipe', 'cook-bait-mutation']).effect.variant).toBeCloseTo(1, 12);
    expect(parseArgs(['effects', '--recipe', 'cook-lunch-bundle']).effect).toMatchObject({ bite: 0.05, rare: 0.05 });
  });

  it('레시피 순손익, 가방 공급, 만들 수 있는 개수 표를 낸다', () => {
    const r = runCli(['recipes', '--recipe', 'cook-lunch-bite', '--trials', '3']);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('## 가루디야(cook-lunch-bite)');
    expect(r.stdout).toContain('## 집 기운 얻기 공급');
    expect(r.stdout).toContain('## 집 기운으로 만들 수 있는 레시피 수');
    expect(r.stdout).toContain('제외(가장 앞선 해역)');
    expect(r.stdout).not.toContain('(cook-lunch-rare)');
  });

  it('JSON은 같은 시드에서 같다', () => {
    const a = runCli(['recipes', '--trials', '2', '--json']).stdout;
    expect(a).toBe(runCli(['recipes', '--trials', '2', '--json']).stdout);
    expect(JSON.parse(a).recipes.rows.length).toBeGreaterThan(0);
  });
});

describe('효과를 넣은 transition, days, gates', () => {
  it('효과 옵션과 새 옵션을 읽는다', () => {
    const o = parseArgs(['transition', '--bite', '10', '--bounty', '--from-boat', '3', '--recipe', 'cook-lunch-bite', '--with-cost']);
    expect(o).toMatchObject({ commands: ['transition'], bounty: true, fromBoat: 3, recipe: 'cook-lunch-bite', withCost: true });
    expect(o.effect.bite).toBeCloseTo(0.1, 12);
    expect(parseArgs(['gates', '--rare', '10']).commands).toEqual(['gates']);
  });

  it('옵션이 허용되지 않는 명령이나 값은 오류다', () => {
    expect(() => parseArgs(['days', '--bounty'])).toThrow(/명령에서만/);
    expect(() => parseArgs(['effects', '--from-boat', '2'])).toThrow(/명령에서만/);
    expect(() => parseArgs(['effects', '--with-cost', '--recipe', 'cook-lunch-bite'])).toThrow(/명령에서만/);
    expect(() => parseArgs(['transition', '--with-cost'])).toThrow(/--recipe/);
    expect(() => parseArgs(['transition', '--from-boat', '-1'])).toThrow(/0 이상/);
    expect(() => parseArgs(['transition', '--from-boat', '1.5'])).toThrow(/정수/);
  });

  it('효과를 주지 않은 transition 출력은 효과 옵션이 생기기 전 출력과 글자까지 같다', () => {
    const golden = readFileSync(join(__dirname, 'fixtures', 'transition-default.txt'), 'utf-8');
    expect(runCli(['transition']).stdout + '\n').toBe(golden);
  });

  it('미끼 슬롯 효과는 수동 캐치에만 걸려 transition, days, gates에서 거부한다', () => {
    for (const cmd of ['transition', 'days', 'gates']) {
      expect(() => parseArgs([cmd, '--bait', 'rare']), cmd).toThrow(/미끼 슬롯/);
      expect(() => parseArgs([cmd, '--recipe', 'cook-bait-mutation']), cmd).toThrow(/미끼 슬롯/);
    }
  });

  it('도시락 효과는 방치 캐치에만 걸려 수동 축과 함께 쓰면 거부한다', () => {
    expect(() => parseArgs(['transition', '--bite', '10', '--axis', 'manual'])).toThrow(/방치/);
    expect(() => parseArgs(['days', '--recipe', 'cook-lunch-bite', '--axis', 'manual'])).toThrow(/방치/);
    expect(parseArgs(['transition', '--axis', 'manual']).axis).toBe('manual');
    expect(parseArgs(['transition', '--bite', '10', '--axis', 'idle']).axis).toBe('idle');
  });

  it('effects와 window는 슬롯에 맞는 축을 기본으로 고르고 맞지 않는 축은 거부한다', () => {
    expect(parseArgs(['effects', '--bait', 'rare']).axis).toBe('manual');
    expect(parseArgs(['window', '--recipe', 'cook-lunch-bite']).axis).toBe('idle');
    expect(parseArgs(['window', '--bait', 'rare']).axis).toBe('manual');
    expect(() => parseArgs(['effects', '--bait', 'rare', '--axis', 'idle'])).toThrow(/수동/);
    expect(() => parseArgs(['effects', '--recipe', 'cook-lunch-bite', '--axis', 'manual'])).toThrow(/방치/);
    expect(() => parseArgs(['window', '--recipe', 'cook-bait-mutation', '--axis', 'idle'])).toThrow(/수동/);
    expect(parseArgs(['effects', '--bait', 'epic', '--axis', 'perfect']).axis).toBe('perfect');
  });

  it('의뢰만 수행하는 transition과 gates는 그 조건을 출력에 밝히고 gates는 종료 코드에 반영하지 않는다', () => {
    const t = runCli(['transition', '--bounty']).stdout;
    expect(t).toContain('의뢰와 토벌 모두 수행, 관측용');
    expect(t).toContain('의뢰와 토벌을 매일 수행하는 경우다');
    expect(t).not.toContain('의뢰와 토벌은 하지 않는 경우다');
    const g = runCli(['gates', '--bounty']);
    expect(g.stdout).toContain('의뢰와 토벌 모두 수행, 관측용');
    expect(g.exitCode).toBe(0);
  });

  it('효과를 주지 않으면 지금까지와 같은 출력이다(효과 없음 열이 없다)', () => {
    const t = runCli(['transition']).stdout;
    expect(t).not.toContain('효과 없음 전환 시간');
    expect(t).toContain('의뢰와 토벌은 하지 않는 경우다');
    expect(runCli(['transition', '--json']).stdout).toContain('"plan": null');
  });

  it('transition은 효과를 넣은 전환 시간과 효과 없음 값, 차이를 낸다', () => {
    const r = runCli(['transition', '--bite', '10', '--from-boat', '0']);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('효과 입질 대기 -10%(관측용)');
    expect(r.stdout).toContain('효과 없음 전환 시간');
    expect(r.stdout).toContain('누적 차이');
    expect(runCli(['transition', '--bite', '10', '--bounty']).stdout).toContain('의뢰와 토벌을 매일 수행하는 경우다');
  });

  it('days는 효과 없음 값과 차이를 낸다', () => {
    const r = runCli(['days', '--rare', '10']);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('효과 없음');
    expect(r.stdout).toContain('효과 없음 소요 시간');
  });

  it('gates는 효과를 넣으면 이동 직후 수입과 전환 시간만 내고 위반이 있어도 종료 코드는 0이다', () => {
    const r = runCli(['gates', '--rare', '20', '--from-boat', '0']);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('효과 없음 차이');
    expect(r.stdout).toContain('효과 없음 전환 시간');
    expect(r.stdout).not.toContain('PERFECT 이상치');
    expect(r.stdout).not.toContain('최초 10분 도달');
    expect(r.stdout).toContain('관측용');
  });

  it('gates를 효과 없이 내면 PERFECT 이상치와 최초 10분을 그대로 낸다', () => {
    const r = runCli(['gates']);
    expect(r.stdout).toContain('PERFECT 이상치');
    expect(r.stdout).toContain('최초 10분 도달');
  });

  it('재료 비용을 넣으면 가정에 밝힌다', () => {
    const r = runCli(['transition', '--recipe', 'cook-lunch-bite', '--with-cost']);
    expect(r.stdout).toContain('재료 판매 손실을 하루 한 번 비용으로 넣음');
  });
});

describe('--axis perfect', () => {
  it('effects와 window에서만 받는다', () => {
    expect(parseArgs(['effects', '--axis', 'perfect']).axis).toBe('perfect');
    expect(parseArgs(['window', '--axis', 'perfect']).axis).toBe('perfect');
    expect(() => parseArgs(['transition', '--axis', 'perfect'])).toThrow(/perfect/);
    expect(() => parseArgs(['--axis', 'perfect'])).toThrow(/perfect/);
    expect(() => parseArgs(['effects', '--axis', 'x'])).toThrow(/idle/);
  });

  it('PERFECT 축 effects는 방치 대비 비율 열을 낸다', () => {
    const t = runCli(['effects', '--axis', 'perfect', '--bait', 'rare', '--trials', '2']).stdout;
    expect(t).toContain('PERFECT 다이얼');
    expect(t).toContain('방치 대비 골드(기본 → 효과)');
    expect(runCli(['effects', '--axis', 'manual', '--trials', '2']).stdout).not.toContain('방치 대비 골드');
  });
});
