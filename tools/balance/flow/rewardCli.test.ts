import { describe, expect, it } from 'vitest';
import { parseArgs, renderText, runCli, runFlow } from './report';

describe('achievements 명령 인자', () => {
  it('명령 이름을 받고 기본 명령에는 들어 있지 않다', () => {
    expect(parseArgs(['achievements']).commands).toEqual(['achievements']);
    expect(parseArgs([]).commands).not.toContain('achievements');
  });

  it('시간어치를 주지 않으면 기본 2, 4, 6시간을 낸다', () => {
    expect(parseArgs(['achievements']).rewards).toEqual([2, 4, 6]);
  });

  it('시간어치를 쉼표로 여러 개 줄 수 있고 h 접미사를 허용한다', () => {
    expect(parseArgs(['achievements', '--reward', '3,5']).rewards).toEqual([3, 5]);
    expect(parseArgs(['achievements', '--reward', '2h,4h,6h']).rewards).toEqual([2, 4, 6]);
  });

  it('나눔은 기본 0.5이고 0 이상 1 이하로 바꿀 수 있다', () => {
    expect(parseArgs(['achievements']).rewardSplit).toBe(0.5);
    expect(parseArgs(['achievements', '--reward-split', '0.4']).rewardSplit).toBe(0.4);
    expect(() => parseArgs(['achievements', '--reward-split', '1.5'])).toThrow(/0 이상 1 이하/);
  });

  it('시간어치가 0 이하이거나 숫자가 아니면 거부한다', () => {
    expect(() => parseArgs(['achievements', '--reward', '0'])).toThrow(/0보다/);
    expect(() => parseArgs(['achievements', '--reward', '-2'])).toThrow(/0보다/);
    expect(() => parseArgs(['achievements', '--reward', 'x'])).toThrow(/시간/);
  });
});

describe('보상을 넣은 관측 인자', () => {
  it.each(['transition', 'days', 'dist', 'gates'])('%s는 --reward로 시간어치를 받고 --reward-split 생략 시 기본 0.5를 쓴다', cmd => {
    const o = parseArgs([cmd, '--reward', '4h']);
    expect(o.rewards).toEqual([4]);
    expect(o.rewardSplit).toBe(0.5);
    const o2 = parseArgs([cmd, '--reward', '4', '--reward-split', '0.4']);
    expect(o2.rewards).toEqual([4]);
    expect(o2.rewardSplit).toBe(0.4);
  });

  it('--reward 없이 --reward-split만 주면 거부한다', () => {
    expect(() => parseArgs(['days', '--reward-split', '0.5'])).toThrow(/--reward와/);
  });

  it('transition, days, dist, gates는 시간어치를 하나만 받는다', () => {
    expect(() => parseArgs(['transition', '--reward', '2h,4h'])).toThrow(/하나만/);
  });

  it('효과 옵션과 함께 쓸 수 없다', () => {
    expect(() => parseArgs(['transition', '--reward', '4h', '--bite', '10'])).toThrow(/효과 옵션/);
    expect(() => parseArgs(['days', '--reward', '4h', '--recipe', 'cook-lunch-bite'])).toThrow(/효과 옵션/);
  });

  it('다른 명령에서는 쓸 수 없다', () => {
    expect(() => parseArgs(['travel', '--reward', '4h'])).toThrow(/achievements/);
    expect(() => parseArgs(['ev', '--reward-split', '0.5'])).toThrow(/achievements/);
  });
});

describe('보상 출력', () => {
  it('achievements는 구역 대표 방치 EV, 구역 보상 합계, 기본·완결 분할 골드 표를 내고 명성은 내지 않는다', () => {
    const text = runCli(['achievements']).stdout;
    expect(text).toContain('진행 업적 보상');
    expect(text).toContain('대표 방치 EV');
    expect(text).toContain('두 업적이 나눈 금액');
    expect(text).toContain('50,000');
    expect(text).toContain('10,000,000');
    expect(text).toContain('명성은 주지 않는다');
    expect(text).not.toContain('명성 요구치');
  });

  it('JSON은 시간어치, 분배 몫, 구역 행을 담고 명성은 담지 않는다', () => {
    const r = runFlow(parseArgs(['achievements', '--reward', '4h', '--reward-split', '0.5']));
    expect(r.achievements!.hours).toEqual([4]);
    expect(r.achievements!.split).toBe(0.5);
    expect(r.achievements!.rows).toHaveLength(6);
    const json = JSON.parse(JSON.stringify(r)).achievements;
    expect(json.rows.map((x: { amounts: { gold: number }[] }) => x.amounts[0].gold)).toEqual([
      50_000, 250_000, 700_000, 2_500_000, 10_000_000, 55_000_000,
    ]);
    expect('fame' in json.rows[0].amounts[0]).toBe(false);
  });

  it('transition은 보상 없음 대비 열과 지급 시점을 내고 지급 명성 열은 없다', () => {
    const r = runFlow(parseArgs(['transition', '--reward', '4h']));
    expect(r.options.reward).toEqual({ hours: 4, split: 0.5 });
    expect(r.transition!.base).toBeDefined();
    expect(r.transition!.achieved!.length).toBeGreaterThan(0);
    const text = renderText(r);
    expect(text).toContain('보상 없음 전환 시간');
    expect(text).toContain('진행 업적 지급 시점');
    expect(text).not.toContain('지급 명성');
    expect(text).not.toContain('효과 없음 전환 시간');
  });

  it('보상 옵션이 없으면 출력에 보상 열이 없다', () => {
    const r = runFlow(parseArgs(['transition']));
    expect(r.options.reward).toBeNull();
    expect(r.transition!.base).toBeUndefined();
    expect(renderText(r)).not.toContain('보상 없음');
  });

  it('days는 구분마다 지급 시점을 낸다', () => {
    const r = runFlow(parseArgs(['days', '--reward', '4h']));
    expect(r.days!.base).toBeDefined();
    expect(renderText(r)).toContain('보상 없음');
    expect(renderText(r)).toContain('진행 업적 지급 시점');
  });

  it('dist는 달성 시각과 도착 단축 분포를 더한다', () => {
    const r = runFlow(parseArgs(['dist', '--reward', '4h', '--trials', '8', '--seed', '3']));
    expect(r.dist!.reward!.rows).toHaveLength(12);
    const text = renderText(r);
    expect(text).toContain('진행 업적 달성 시각');
    expect(text).toContain('단축');
    expect(text).not.toContain('지급(골드 / 명성)');
  });

  it('dist는 보상 옵션이 없으면 보상 분포를 내지 않는다', () => {
    expect(runFlow(parseArgs(['dist', '--trials', '3'])).dist!.reward).toBeUndefined();
  });
});

describe('해역 단위 진행 업적 보상 (--reward-unit spot)', () => {
  it('인자 파싱: 기본값은 zone이고 spot을 허용하며 허용 외 명령과 잘못된 값은 거부한다', () => {
    expect(parseArgs(['achievements']).rewardUnit).toBe('zone');
    expect(parseArgs(['achievements', '--reward-unit', 'spot']).rewardUnit).toBe('spot');
    expect(parseArgs(['dist', '--reward-unit', 'spot']).rewardUnit).toBe('spot');
    expect(parseArgs(['dist', '--reward-unit', 'spot']).rewards).toEqual([1]);
    expect(parseArgs(['dist', '--reward-unit', 'spot']).rewardSplit).toBe(0.5);
    expect(() => parseArgs(['achievements', '--reward-unit', 'other'])).toThrow(/zone 또는 spot/);
    expect(() => parseArgs(['ev', '--reward-unit', 'spot'])).toThrow(/명령에서만/);
  });

  it('achievements --reward-unit spot은 15개 해역별 entryEV, 합산 골드, 기초/숙련 골드 표와 JSON을 낸다', () => {
    const text = runCli(['achievements', '--reward-unit', 'spot']).stdout;
    expect(text).toContain('entryEV');
    expect(text).toContain('기초 도감');
    expect(text).toContain('숙련 도감');
    expect(text).toContain('마을 연못');
    expect(text).toContain('버뮤다 삼각지대');

    const r = runFlow(parseArgs(['achievements', '--reward-unit', 'spot', '--reward', '4h', '--reward-split', '0.5']));
    expect(r.achievements!.unit).toBe('spot');
    expect(r.achievements!.rows).toHaveLength(15);
  });

  it('transition, days, gates --reward-unit spot이 보상을 지급하고 보상 없음 비교를 낸다', () => {
    const t = runFlow(parseArgs(['transition', '--reward-unit', 'spot']));
    expect(t.options.reward).toEqual({ unit: 'spot', hours: 1, split: 0.5 });
    expect(t.transition!.base).toBeDefined();
    expect(t.transition!.achieved!.length).toBeGreaterThan(0);
    expect(renderText(t)).toContain('보상 없음 전환 시간');
    expect(renderText(t)).toContain('기초');

    const d = runFlow(parseArgs(['days', '--reward-unit', 'spot', '--reward', '4h']));
    expect(d.days!.base).toBeDefined();
    expect(renderText(d)).toContain('진행 업적 지급 시점');

    const g = runCli(['gates', '--reward-unit', 'spot']);
    expect(g.exitCode).toBe(0);
    expect(g.stdout).toContain('보상 없음 전환 시간');
  });

  it('dist --reward-unit spot은 30종 업적별 달성률과 달성 시각 분포(p10, 중앙값, p90, 평균)를 출력/JSON에 담는다', () => {
    const r = runFlow(parseArgs(['dist', '--reward-unit', 'spot', '--trials', '8', '--seed', '3']));
    expect(r.dist!.reward!.unit).toBe('spot');
    expect(r.dist!.reward!.rows).toHaveLength(30);
    const text = renderText(r);
    expect(text).toContain('달성률');
    expect(text).toContain('기초');
    expect(text).toContain('숙련');
  });
});
