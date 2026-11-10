import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

describe('명령 인자', () => {
  it('인자가 없으면 네 명령 전부와 기본값이다', () => {
    expect(parseArgs([])).toEqual({
      commands: ['transition', 'days', 'opening', 'exception', 'ev'], override: null, json: false,
      loss4h: null, legendAt: null, axis: 'idle', maxDays: 365, bagCapAwake: false, help: false,
      seed: DEFAULT_SEED, trials: DEFAULT_TRIALS, travelShare: null,
    });
  });

  it('명령 하나와 옵션을 읽는다', () => {
    const o = parseArgs(['days', '--override', 'a.json', '--json', '--loss4h', '50', '--legend-at', '12', '--axis', 'manual', '--max-days', '90', '--bag-cap-awake']);
    expect(o).toMatchObject({ commands: ['days'], override: 'a.json', json: true, loss4h: 50, legendAt: 12, axis: 'manual', maxDays: 90, bagCapAwake: true });
  });

  it('--help를 알아본다', () => {
    expect(parseArgs(['--help']).help).toBe(true);
  });

  it('모르는 명령과 옵션, 값 없는 옵션, 잘못된 값, 명령 두 개를 거부한다', () => {
    expect(() => parseArgs(['nothing'])).toThrow(/명령/);
    expect(() => parseArgs(['--nothing'])).toThrow(/옵션/);
    expect(() => parseArgs(['days', '--override'])).toThrow(/값/);
    expect(() => parseArgs(['--axis', 'fast'])).toThrow(/idle/);
    expect(() => parseArgs(['--loss4h', 'x'])).toThrow(/숫자/);
    expect(() => parseArgs(['--max-days', '0'])).toThrow(/1 이상/);
    expect(() => parseArgs(['days', 'opening'])).toThrow(/하나/);
  });

  it('도움말이 모든 명령과 옵션을 설명한다', () => {
    for (const w of ['transition', 'days', 'opening', 'exception', 'ev', '1시간', '--override', '--json', '--loss4h', '--legend-at', '--axis', '--max-days', '--bag-cap-awake', '--help', 'dist', 'travel', '--seed', '--trials', '--travel-share']) {
      expect(HELP).toContain(w);
    }
  });
});

describe('실행과 출력', () => {
  it('전환 출력은 전환 골드 비중 표와 유형별 표를 담는다', () => {
    const text = renderText(runFlow(base({ commands: ['transition'] })));
    expect(text).toContain('전환 골드와 비중');
    expect(text).toContain('### 4시간(낚시 75%)');
    expect(text).toContain('### 4시간(낚시 100%)');
    expect(text).toContain('### 4시간(낚시 50%)');
    expect(text).toContain('### 1시간');
    expect(text).toContain('### 16시간');
    expect(text).toContain('강화 비중');
  });

  it('깨어 있는 동안 가방 한도 옵션은 일수 출력을 바꾼다', () => {
    const o = base({ commands: ['days'], loss4h: 25 });
    expect(renderText(runFlow({ ...o, bagCapAwake: true }))).not.toBe(renderText(runFlow(o)));
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

  it('일수 출력은 의뢰 수행 여부별 도착 일차와 레벨업 일수를 담는다', () => {
    const text = renderText(runFlow(base({ commands: ['days'] })));
    for (const w of ['도착 일차', '수행 안 함', '모두 수행', '레벨업']) expect(text).toContain(w);
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

  it('유형별 전환 표에는 연속 방치 값 열이 없고 연속 방치 표에만 있다', () => {
    const text = renderText(runFlow(base({ commands: ['transition'], loss4h: 25 })));
    const start = text.indexOf('### 4시간(낚시 75%)');
    const section = text.slice(start, text.indexOf('###', start + 4) === -1 ? undefined : text.indexOf('###', start + 4));
    for (const w of ['연속 방치 소요', '기다린 것', '명성 대기']) expect(section).not.toContain(w);
    expect(section).toContain('도착 일차');
    const continuous = text.slice(text.indexOf('## 해역 전환 — 연속 방치 소요'), start);
    for (const w of ['연속 방치 소요', '기다린 것', '명성 대기']) expect(continuous).toContain(w);
  });

  it('4시간 유형은 기본으로 낚시 100%, 75%, 50%를 함께 내고 비율을 주면 그 값 하나만 낸다', () => {
    const all = renderText(runFlow(base({ commands: ['transition'] })));
    for (const w of ['### 4시간(낚시 100%)', '### 4시간(낚시 75%)', '### 4시간(낚시 50%)']) expect(all).toContain(w);
    const one = renderText(runFlow(base({ commands: ['transition'], loss4h: 40 })));
    expect(one).toContain('### 4시간(낚시 60%)');
    expect(one).not.toContain('### 4시간(낚시 75%)');
  });

  it('각 명령 출력은 그 표가 기대는 가정을 가정: 으로 밝힌다', () => {
    const t = (c: 'transition' | 'days' | 'opening' | 'exception') => renderText(runFlow(base({ commands: [c] })));
    const want: Record<string, string[]> = {
      transition: ['가정:', '낚지 못하는 비율', '8시간 유형은 사용자 확인 대기', '잠든 동안'],
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

  it('days 가정은 도감을 채우지 않아 유형마다 못 쓰는 라이선스가 있다는 점을 실제 결과에서 만들어 밝힌다', () => {
    const text = renderText(runFlow(base({ commands: ['days'] })));
    expect(text).toContain('지나온 해역으로 돌아가 도감을 채우지 않는다');
    expect(text).not.toContain('4시간 이하 유형은');
    const d = runFlow(base({ commands: ['days'] })).days!;
    const level = Math.min(...d.levelUp.map(r => r.level));
    const rows = d.levelUp.filter(r => r.bounty && r.level === level);
    const all = new Set(rows.flatMap(r => r.licenses));
    for (const r of rows) {
      const miss = [...all].filter(l => !r.licenses.includes(l));
      const line = `${r.type.label}: ${miss.join(', ')}`;
      if (miss.length) expect(text).toContain(line);
    }
    expect(rows.some(r => [...all].some(l => !r.licenses.includes(l)))).toBe(true);
  });

  it('가방 가정 문구는 16시간의 깨어 있는 시간과 짧은 유형까지 아우른다', () => {
    const text = renderText(runFlow(base({ commands: ['transition'] })));
    expect(text).toContain('16시간 유형의 깨어 있는 시간');
    expect(text).toContain('짧은 유형');
  });

  it('가방 한도 옵션을 켜면 가정 문구가 바뀐다', () => {
    const text = renderText(runFlow(base({ commands: ['transition'], bagCapAwake: true })));
    expect(text).not.toContain('사용자 확인 대기');
    expect(text).toContain('가방 한도를 적용');
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
    expect(JSON.parse(bad2.stdout).gates.some((g: { verdict: string }) => g.verdict === '위반')).toBe(true);
    const bad = runCli(['gates', '--override', join(tmpdir(), 'no-such-flow-override.json')]);
    expect(bad.exitCode).toBe(1);
    expect(bad.stderr).toContain('오류:');
  });
});

describe('분포와 이동 명령', () => {
  const small = (over: Partial<FlowOptions> = {}) => base({ trials: 30, ...over });

  it('분포 인자를 읽는다', () => {
    expect(parseArgs(['dist', '--seed', '5', '--trials', '50', '--travel-share', '2'])).toMatchObject({ commands: ['dist'], seed: 5, trials: 50, travelShare: 2 });
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
    expect(() => parseArgs(['--travel-share', '100'])).toThrow(/0 이상 100 미만/);
    expect(() => parseArgs(['--travel-share', '-1'])).toThrow(/0 이상 100 미만/);
  });

  it('분포 출력은 시드와 시도 횟수, 느린 쪽의 뜻, 두 분포 표를 담는다', () => {
    const text = renderText(runFlow(small({ commands: ['dist'], seed: 3 })));
    for (const w of ['시드 3', '시도 30회', 'p10', '중앙값', 'p90', '운이 나쁜', '최초 10분', '영웅 보장', '전설 보장', '첫 바다 해역 도착', '해역 전환', '해석 기댓값', '가정:']) {
      expect(text, w).toContain(w);
    }
  });

  it('같은 인자는 표와 JSON이 바이트까지 같고 시드가 다르면 달라진다', () => {
    const o = small({ commands: ['dist'], seed: 3 });
    expect(renderText(runFlow(o))).toBe(renderText(runFlow(o)));
    expect(JSON.stringify(runFlow(o))).toBe(JSON.stringify(runFlow(o)));
    expect(renderText(runFlow({ ...o, seed: 4 }))).not.toBe(renderText(runFlow(o)));
  });

  it('이동 측정 출력은 해역별 거리, 속도, 왕복, 비중과 기본 보정값을 담는다', () => {
    const text = renderText(runFlow(base({ commands: ['travel'] })));
    for (const w of ['이동 시간 측정', '거리', '속도', '왕복', '비중', '5%', '일괄 보정', '가정:', '마을 연못', '세인트헬레나']) expect(text, w).toContain(w);
  });

  it('기본 출력은 이동 시간을 측정값으로 포함한다고 밝히고 0을 주면 넣지 않는다고 밝힌다', () => {
    const d = renderText(runFlow(base({ commands: ['transition'] })));
    expect(d).toContain('이동 시간: 포함');
    expect(d).toContain('측정값');
    const zero = renderText(runFlow(base({ commands: ['transition'], travelShare: 0 })));
    expect(zero).toContain('이동 시간: 넣지 않는다');
    expect(zero).not.toBe(d);
  });

  it('이동 보정을 직접 지정하면 지정값이라고 밝힌다', () => {
    expect(renderText(runFlow(base({ commands: ['days'], travelShare: 2 })))).toContain('직접 지정');
  });

  it('보정이 적용되지 않는 명령은 이동 시간을 넣지 않는다고 밝힌다', () => {
    expect(renderText(runFlow(base({ commands: ['opening'] })))).toContain('이동 시간: 넣지 않는다');
  });
});
