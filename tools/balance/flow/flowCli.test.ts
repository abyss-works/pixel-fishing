import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BOATS } from '../../../src/game/content/boats';
import { SPOTS } from '../../../src/game/content/spots';
import { HELP, parseArgs, renderText, runCli, runFlow } from './report';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const writeJson = (value: unknown): string => {
  const d = mkdtempSync(join(tmpdir(), 'flow-rework-'));
  dirs.push(d);
  const path = join(d, 'o.json');
  writeFileSync(path, JSON.stringify(value));
  return path;
};

const NEXT = { addSpots: [{ id: 'next', name: '다음 지역 첫 해역', like: 'sthelena', powerReq: 165, zone: 'nextregion', growth: 0.45, boat: { price: 5000000, fameReq: 400000 } }] };

describe('새 옵션 인자', () => {
  it('--growth는 ev에서만 쓴다', () => {
    expect(parseArgs(['ev', '--growth']).growth).toBe(true);
    expect(() => parseArgs(['transition', '--growth'])).toThrow(/ev/);
    expect(parseArgs(['ev']).growth).toBe(false);
  });

  it('--target을 여러 번 읽고 solve에서만 쓴다', () => {
    expect(parseArgs(['solve', '--target', 'sthelena=24/30', '--target', 'benguela=20/22']).targets)
      .toEqual([{ from: 'sthelena', goldHours: 24, fameHours: 30 }, { from: 'benguela', goldHours: 20, fameHours: 22 }]);
    expect(() => parseArgs(['ev', '--target', 'sthelena=24/30'])).toThrow(/solve/);
    expect(() => parseArgs(['solve', '--boat-share', '1'])).toThrow(/0 이상 1 미만/);
    expect(parseArgs(['solve', '--boat-share', '0.1']).boatShare).toBe(0.1);
  });

  it('--levels는 시작-끝 정수다', () => {
    expect(parseArgs(['upgrades', '--levels', '10-20']).levels).toEqual([10, 20]);
    expect(() => parseArgs(['upgrades', '--levels', '20-10'])).toThrow(/끝이 시작/);
    expect(() => parseArgs(['upgrades', '--levels', 'a'])).toThrow(/형식/);
  });

  it('--reward-basis와 --basis는 보상 명령에서만 쓰고, 보상 관측에서는 --reward와 함께 써야 한다', () => {
    expect(parseArgs(['achievements', '--reward-basis', 'incremental-fame']).rewardBasis).toBe('incremental-fame');
    expect(parseArgs(['achievements', '--basis', 'southatlantic=sthelena:next']).basis).toEqual({ southatlantic: { from: 'sthelena', to: 'next' } });
    expect(() => parseArgs(['achievements', '--reward-basis', 'nope'])).toThrow(/total, incremental-fame, ev-hours/);
    expect(() => parseArgs(['transition', '--reward-basis', 'ev-hours'])).toThrow(/--reward와/);
    expect(() => parseArgs(['ev', '--reward-basis', 'ev-hours'])).toThrow(/achievements/);
    expect(() => parseArgs(['achievements', '--basis', 'indian=a:b', '--basis', 'indian=c:d'])).toThrow(/두 번/);
  });

  it('gates도 --reward를 받지만 --reward-split이 있어야 한다', () => {
    expect(() => parseArgs(['gates', '--reward', '25'])).toThrow(/--reward-split/);
    expect(parseArgs(['gates', '--reward', '25', '--reward-split', '0.5']).rewards).toEqual([0.25]);
  });

  it('사용법에 새 명령과 옵션이 있다', () => {
    for (const word of ['solve', 'upgrades', 'fame', '--growth', '--target', '--boat-share', '--levels', '--reward-basis', '--basis', 'addSpots', 'gradeMult', 'powerPerLevel']) {
      expect(HELP, word).toContain(word);
    }
  });
});

describe('ev --growth', () => {
  it('증가율 표를 더하고 옵션이 없으면 더하지 않는다', () => {
    const text = runCli(['ev', '--growth']).stdout;
    expect(text).toContain('해역 사이 딱렙 방치 EV 증가율');
    expect(text).toContain('+103.1%');
    expect(runCli(['ev']).stdout).not.toContain('증가율');
  });
});

describe('가상 해역을 넣은 명령', () => {
  it('전환, ev, gates에 가상 해역이 반영되고 실행 뒤 제품 행은 원래대로다', () => {
    const spots = SPOTS.length, boats = BOATS.length;
    const file = writeJson(NEXT);
    const t = runCli(['transition', '--override', file]);
    expect(t.exitCode).toBe(0);
    expect(t.stdout).toContain('세인트헬레나 → 다음 지역 첫 해역');
    expect(t.stdout).toContain('가상 배 9(5,000,000 / 400,000)');
    const e = runCli(['ev', '--growth', '--override', file]);
    expect(e.stdout).toContain('+45.0%');
    const g = runCli(['gates', '--override', file]);
    expect(g.stdout).toContain('세인트헬레나 → 다음 지역 첫 해역');
    expect(SPOTS.length).toBe(spots);
    expect(BOATS.length).toBe(boats);
  });

  it('낚싯대 규칙 덮어쓰기는 진입 레벨 표기에 반영된다', () => {
    const r = runFlow(parseArgs(['transition', '--override', writeJson({ rod: { powerPerLevel: 2.5 } })]));
    expect(r.options.spots.find(s => s.id === 'sea')!.entryLevel).toBe(9);
    expect(renderText(r)).toContain('Lv9(30)');
  });
});

describe('가상 해역과 분포, 보상, 미지원 명령', () => {
  it('dist가 가상 해역을 넣어도 돌고 전환 수가 해역 수를 따른다', () => {
    const r = runFlow(parseArgs(['dist', '--trials', '3', '--override', writeJson(NEXT)]));
    expect(r.dist!.transition).toHaveLength(SPOTS.length);
    expect(r.dist!.transition.at(-1)!.to).toBe('next');
  });

  it('dist 보상 분포가 가상 전환 기준과 함께 돈다', () => {
    const file = writeJson(NEXT);
    const r = runFlow(parseArgs(['dist', '--trials', '3', '--override', file, '--reward', '25', '--reward-split', '0.5', '--basis', 'southatlantic=sthelena:next']));
    const row = r.dist!.reward!.rows.find(x => x.zone === 'southatlantic' && x.tier === 'basic')!;
    expect(row.to).toBe('next');
    expect(row.reward).not.toBeNull();
  });

  it('가상 해역을 지원하지 않는 명령은 명확한 오류로 거부한다', () => {
    const file = writeJson(NEXT);
    for (const c of ['travel', 'effects', 'recipes', 'window', 'opening', 'exception']) {
      const r = runCli([c, '--override', file]);
      expect(r.exitCode, c).toBe(1);
      expect(r.stderr, c).toContain('addSpots는');
    }
    expect(runCli(['--override', file]).exitCode).toBe(1);
    expect(HELP).toContain('쓸 수 없다');
  });
});

describe('solve, upgrades, fame', () => {
  it('solve는 목표 행과 현행 환산을 낸다', () => {
    const r = runFlow(parseArgs(['solve', '--target', 'sthelena=24/30']));
    expect(r.solve!.rows).toHaveLength(1);
    expect(r.solve!.current).toHaveLength(SPOTS.length - 1);
    const text = renderText(r);
    expect(text).toContain('전환 역산');
    expect(text).toContain('세인트헬레나(EV 942,379/h)');
    expect(runCli(['solve']).stdout).toContain('--target으로 목표를 주지 않았습니다');
  });

  it('solve의 해역이 없으면 오류로 끝난다', () => {
    const r = runCli(['solve', '--target', 'nowhere=1/1']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('없는 해역');
  });

  it('upgrades는 범위의 레벨 행과 전환당 구매 횟수를 낸다', () => {
    const r = runFlow(parseArgs(['upgrades', '--levels', '14-16']));
    expect(r.upgrades!.levels.map(l => l.level)).toEqual([14, 15, 16]);
    expect(r.upgrades!.purchases).toHaveLength(SPOTS.length - 1);
    expect(renderText(r)).toContain('전환당 구매 횟수');
  });

  it('fame은 전환마다 한 줄을 낸다', () => {
    const r = runFlow(parseArgs(['fame']));
    expect(r.fame).toHaveLength(SPOTS.length - 1);
    expect(renderText(r)).toContain('누적 명성 곡선');
  });
});

describe('보상 기준 방식', () => {
  it('achievements 기본 출력은 방식 표를 더하지 않는다', () => {
    expect(runCli(['achievements']).stdout).not.toContain('증분 명성');
  });

  it('total은 방식을 주지 않았을 때와 같은 출력이다', () => {
    expect(runCli(['achievements', '--reward-basis', 'total']).stdout).toBe(runCli(['achievements']).stdout);
  });

  it('현행값 그대로의 낚싯대 규칙 덮어쓰기는 전환, 게이트, 일수 출력을 바꾸지 않는다', () => {
    const same = writeJson({
      rod: {
        powerPerLevel: 5, costBase: 50, costGrowth: 1.7, costPowerFrom: 15, costPowerExp: 8, biteDecay: 0.94,
        idleBoost: { basis: 'level', unit: 5, world: [5, 5, 4, 4, 3] },
      },
      spots: { sea: { gradeMult: { common: 1 } } },
    });
    for (const command of ['transition', 'gates', 'days']) {
      const body = (args: string[]) => runCli([command, ...args]).stdout.split('\n').filter((_, i) => i !== 1).join('\n');
      expect(body(['--override', same]), command).toBe(body([]));
    }
  });

  it('incremental-fame은 명성 기준을 증분으로 바꿔 보여 준다', () => {
    const text = runCli(['achievements', '--reward-basis', 'incremental-fame']).stdout;
    expect(text).toContain('증분 명성');
    expect(text).toContain('기준 명성');
  });

  it('가상 전환을 기준 전환으로 지정하면 남대서양 보상 크기가 나온다', () => {
    const file = writeJson(NEXT);
    const r = runFlow(parseArgs(['achievements', '--override', file, '--basis', 'southatlantic=sthelena:next']));
    const row = r.achievements!.rows.find(x => x.zone === 'southatlantic')!;
    expect(row.to).toBe('next');
    expect(row.amounts).toHaveLength(3);
    expect(renderText(r)).toContain('세인트헬레나 → 다음 지역 첫 해역');
  });

  it('transition 보상 관측에 기준 방식이 반영된다', () => {
    const plain = runFlow(parseArgs(['transition', '--reward', '25', '--reward-split', '0.5']));
    const inc = runFlow(parseArgs(['transition', '--reward', '25', '--reward-split', '0.5', '--reward-basis', 'incremental-fame']));
    expect(inc.options.reward!.basis).toEqual({ mode: 'incremental-fame', transitions: {} });
    expect(plain.options.reward!.basis).toBeUndefined();
    // 명성 보상이 줄어 모잠비크 해협 도착이 늦어진다
    const t = (r: typeof plain) => r.transition!.timings.find(x => x.row.to === 'mozstrait')!.hours;
    expect(t(inc)).toBeGreaterThan(t(plain));
  });

  it('gates --reward는 보상 관측으로 종료 코드에 판정을 반영하지 않는다', () => {
    const r = runCli(['gates', '--reward', '25', '--reward-split', '0.5']);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('보상 없음 전환 시간');
    expect(r.stdout).toContain('진행 업적 보상 25.0%');
  });
});
