import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BOATS } from '../../../src/game/content/boats';
import { HELP, parseArgs, renderText, runFlow } from './report';
import type { FlowOptions } from './report';

const base = (over: Partial<FlowOptions> = {}): FlowOptions => ({ ...parseArgs([]), ...over });

describe('명령 인자', () => {
  it('인자가 없으면 네 명령 전부와 기본값이다', () => {
    expect(parseArgs([])).toEqual({
      commands: ['transition', 'days', 'opening', 'exception'], override: null, json: false,
      loss4h: 25, legendAt: null, axis: 'idle', maxDays: 365, help: false,
    });
  });

  it('명령 하나와 옵션을 읽는다', () => {
    const o = parseArgs(['days', '--override', 'a.json', '--json', '--loss4h', '50', '--legend-at', '12', '--axis', 'manual', '--max-days', '90']);
    expect(o).toMatchObject({ commands: ['days'], override: 'a.json', json: true, loss4h: 50, legendAt: 12, axis: 'manual', maxDays: 90 });
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
    for (const w of ['transition', 'days', 'opening', 'exception', '--override', '--json', '--loss4h', '--legend-at', '--axis', '--max-days', '--help']) {
      expect(HELP).toContain(w);
    }
  });
});

describe('실행과 출력', () => {
  it('전환 출력은 전환 골드 비중 표와 유형별 표를 담는다', () => {
    const text = renderText(runFlow(base({ commands: ['transition'] })));
    expect(text).toContain('전환 골드와 비중');
    expect(text).toContain('### 4시간(낚시 75%)');
    expect(text).toContain('### 16시간');
    expect(text).toContain('강화 비중');
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

  it('JSON 출력은 선택한 명령의 데이터만 담는다', () => {
    const r = runFlow(base({ commands: ['opening'], json: true }));
    expect(Object.keys(r).sort()).toEqual(['opening', 'options']);
    expect(JSON.parse(JSON.stringify(r)).opening).toBeInstanceOf(Array);
  });

  it('덮어쓰기는 실행 중에만 적용되고 끝나면 원래 값으로 돌아온다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'flow-report-'));
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
