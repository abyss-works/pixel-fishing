import { describe, expect, it } from 'vitest';
import { parseArgs, renderText, runCli, runFlow } from './report';

describe('achievements 명령 인자', () => {
  it('명령 이름을 받고 기본 명령에는 들어 있지 않다', () => {
    expect(parseArgs(['achievements']).commands).toEqual(['achievements']);
    expect(parseArgs([]).commands).not.toContain('achievements');
  });

  it('비율을 주지 않으면 기본 비율 20, 25, 30%를 낸다', () => {
    expect(parseArgs(['achievements']).rewards).toEqual([0.2, 0.25, 0.3]);
  });

  it('비율을 쉼표로 여러 개 줄 수 있다', () => {
    expect(parseArgs(['achievements', '--reward', '15,35']).rewards).toEqual([0.15, 0.35]);
  });

  it('나눔은 선택이고 0 이상 1 이하다', () => {
    expect(parseArgs(['achievements']).rewardSplit).toBeNull();
    expect(parseArgs(['achievements', '--reward-split', '0.4']).rewardSplit).toBe(0.4);
    expect(() => parseArgs(['achievements', '--reward-split', '1.5'])).toThrow(/0 이상 1 이하/);
  });

  it('비율이 0 이하이거나 100을 넘으면 거부한다', () => {
    expect(() => parseArgs(['achievements', '--reward', '0'])).toThrow(/0 초과/);
    expect(() => parseArgs(['achievements', '--reward', '120'])).toThrow(/100 이하/);
    expect(() => parseArgs(['achievements', '--reward', 'x'])).toThrow(/숫자/);
  });
});

describe('보상을 넣은 관측 인자', () => {
  it.each(['transition', 'days', 'dist'])('%s는 비율과 나눔을 함께 받는다', cmd => {
    const o = parseArgs([cmd, '--reward', '25', '--reward-split', '0.5']);
    expect(o.rewards).toEqual([0.25]);
    expect(o.rewardSplit).toBe(0.5);
  });

  it('비율만 주거나 나눔만 주면 거부한다', () => {
    expect(() => parseArgs(['transition', '--reward', '25'])).toThrow(/--reward-split/);
    expect(() => parseArgs(['days', '--reward-split', '0.5'])).toThrow(/--reward와/);
  });

  it('transition, days, dist는 비율을 하나만 받는다', () => {
    expect(() => parseArgs(['transition', '--reward', '20,25', '--reward-split', '0.5'])).toThrow(/하나만/);
  });

  it('효과 옵션과 함께 쓸 수 없다', () => {
    expect(() => parseArgs(['transition', '--reward', '25', '--reward-split', '0.5', '--bite', '10'])).toThrow(/효과 옵션/);
    expect(() => parseArgs(['days', '--reward', '25', '--reward-split', '0.5', '--recipe', 'cook-lunch-bite'])).toThrow(/효과 옵션/);
  });

  it('다른 명령에서는 쓸 수 없다', () => {
    expect(() => parseArgs(['gates', '--reward', '25'])).toThrow(/achievements/);
    expect(() => parseArgs(['ev', '--reward-split', '0.5'])).toThrow(/achievements/);
  });
});

describe('보상 출력', () => {
  it('achievements는 구역 보상 크기 표를 낸다', () => {
    const text = runCli(['achievements', '--reward', '25']).stdout;
    expect(text).toContain('진행 업적 보상');
    expect(text).toContain('골드 25%');
    expect(text).toContain('다음 지역 없음');
    expect(text).not.toContain('두 업적이 나눈 금액');
  });

  it('나눔을 주면 업적별 금액 표를 더한다', () => {
    expect(runCli(['achievements', '--reward-split', '0.5']).stdout).toContain('두 업적이 나눈 금액');
  });

  it('JSON은 비율과 구역 행을 담는다', () => {
    const r = runFlow(parseArgs(['achievements', '--reward', '20,30', '--reward-split', '0.5']));
    expect(r.achievements!.ratios).toEqual([0.2, 0.3]);
    expect(r.achievements!.rows).toHaveLength(5);
    expect(JSON.parse(JSON.stringify(r)).achievements.split).toBe(0.5);
  });

  it('transition은 보상 없음 대비 열과 지급 시점을 낸다', () => {
    const r = runFlow(parseArgs(['transition', '--reward', '25', '--reward-split', '0.5']));
    expect(r.options.reward).toEqual({ ratio: 0.25, split: 0.5 });
    expect(r.transition!.base).toBeDefined();
    expect(r.transition!.achieved!.length).toBeGreaterThan(0);
    const text = renderText(r);
    expect(text).toContain('보상 없음 전환 시간');
    expect(text).toContain('진행 업적 지급 시점');
    expect(text).not.toContain('효과 없음 전환 시간');
  });

  it('보상 옵션이 없으면 출력에 보상 열이 없다', () => {
    const r = runFlow(parseArgs(['transition']));
    expect(r.options.reward).toBeNull();
    expect(r.transition!.base).toBeUndefined();
    expect(renderText(r)).not.toContain('보상 없음');
  });

  it('days는 구분마다 지급 시점을 낸다', () => {
    const r = runFlow(parseArgs(['days', '--reward', '25', '--reward-split', '0.5']));
    expect(r.days!.base).toBeDefined();
    expect(renderText(r)).toContain('보상 없음');
    expect(renderText(r)).toContain('진행 업적 지급 시점');
  });

  it('dist는 달성 시각과 도착 단축 분포를 더한다', () => {
    const r = runFlow(parseArgs(['dist', '--reward', '25', '--reward-split', '0.5', '--trials', '8', '--seed', '3']));
    expect(r.dist!.reward!.rows).toHaveLength(10);
    const text = renderText(r);
    expect(text).toContain('진행 업적 달성 시각');
    expect(text).toContain('단축');
  });

  it('dist는 보상 옵션이 없으면 보상 분포를 내지 않는다', () => {
    expect(runFlow(parseArgs(['dist', '--trials', '3'])).dist!.reward).toBeUndefined();
  });
});
