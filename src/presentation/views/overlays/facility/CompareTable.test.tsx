// 비교 표 — 값 열 폭은 PC 레이아웃에서 고정 rem이고 줄을 바꾸지 않는다. 모바일 레이아웃은 내용에 맞추는 자동 배치이고 모든 칸이 줄을 바꾼다.
// 실제 겹침과 넘침은 jsdom이 레이아웃을 계산하지 못해 증명하지 못한다. 여기서는 그것을 막는 구조(자동 배치, 줄 바꿈 허용, 줄 바꿈 자리)를 고정한다.
// heads가 하나면 현재 열만 보인다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { CompareTable } from './facilityParts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const stubMobile = (mobile: boolean) => vi.stubGlobal('matchMedia', (query: string) => ({
  matches: mobile && query.includes('width <'), media: query,
  addEventListener: () => {}, removeEventListener: () => {},
}));

const widths = (c: HTMLElement) => [...c.querySelectorAll('col')].map(col => (col as HTMLElement).style.width);
const rows = [{ label: '효과', value: '+25%', next: '+31.25%' }];

describe('CompareTable', () => {
  it('모바일 레이아웃은 열 폭을 고정하지 않는 자동 배치이고 모든 칸이 줄을 바꾸며 표의 최소 폭이 없다', () => {
    stubMobile(true);
    const { container } = render(<CompareTable heads={['현재', '강화 후']} rows={rows} />);
    const table = container.querySelector('table') as HTMLElement;
    expect(widths(container)).toEqual([]);
    expect(table.style.minWidth).toBe('');
    expect(table.className).not.toContain('table-fixed');
    expect(table.className).toContain('[&_td]:whitespace-normal');
    expect(table.className).toContain('[&_td]:wrap-break-word');
    expect(table.className).not.toContain('min-w-0!');
  });

  it('자릿수가 많은 값은 쉼표 뒤에서 줄을 바꿀 수 있고 글자는 그대로이며 모바일에서 한 줄로 고정하는 클래스가 없다', () => {
    stubMobile(true);
    const { container } = render(<CompareTable heads={['현재', '판매 후']}
      rows={[{ label: '골드', value: '1,000,000,000G', next: '1,000,000,308G', delta: '+1,000,000,308G' }]} />);
    const [current, next] = [...container.querySelectorAll('tbody td')].slice(1) as HTMLElement[];
    expect(current.textContent).toBe('1,000,000,000G');
    expect(current.querySelectorAll('wbr')).toHaveLength(3);
    expect(current.innerHTML).toMatch(/1,<wbr>000,<wbr>000,<wbr>000G/);
    expect(next.querySelectorAll('wbr')).toHaveLength(7);
    expect(next.textContent).toBe('1,000,000,308G+1,000,000,308G');
    expect(container.querySelector('table')?.className).not.toContain('whitespace-nowrap');
  });

  it('쉼표가 없는 값과 문자열이 아닌 값은 줄 바꿈 자리를 더하지 않는다', () => {
    stubMobile(true);
    const { container } = render(<CompareTable heads={['현재', '강화 후']}
      rows={[{ label: '파워', value: '999', next: <span>1,000</span> }]} />);
    expect(container.querySelector('wbr')).toBeNull();
  });

  it('PC 레이아웃에서 값 열은 고정 폭이고 이름 칸의 줄 바꿈 규칙이 붙지 않는다', () => {
    stubMobile(false);
    const { container } = render(<CompareTable heads={['현재', '강화 후']} rows={rows} />);
    expect(widths(container)).toEqual(['', '7rem', '9rem']);
    expect(container.querySelector('table')?.className).toContain('table-fixed');
    expect(container.querySelector('table')?.className).toContain('[&_td]:whitespace-nowrap');
    expect(container.querySelector('table')?.className).not.toContain('[&_td]:whitespace-normal');
    expect(container.querySelector('table')?.className).not.toContain('min-w-0!');
  });

  it('heads가 하나면 현재 열만 보인다', () => {
    stubMobile(false);
    const { container } = render(<CompareTable heads={['현재']} rows={rows} />);
    expect(widths(container)).toEqual(['', '7rem']);
    expect(container.querySelectorAll('thead th')).toHaveLength(2);
    expect(container.querySelectorAll('tbody td')).toHaveLength(2);
    expect(container.textContent).not.toContain('+31.25%');
  });

  it('확정 후 값과 변화량 사이에 줄 바꿈 자리가 있어 좁은 값 칸에서 변화량이 아래 줄로 내려간다', () => {
    stubMobile(true);
    const { container } = render(<CompareTable heads={['현재', '강화 후']} rows={[{ label: '입질 대기', value: '2.9~5.9초', next: '2.5~5.5초', delta: '-0.4초' }]} />);
    const cell = container.querySelector('tbody td:last-child') as HTMLElement;
    expect(cell.innerHTML).toMatch(/2\.5~5\.5초<wbr>/);
    expect(cell.querySelector('wbr')?.nextElementSibling?.textContent).toBe('-0.4초');
  });

  it('변화량이 없는 줄에는 줄 바꿈 자리를 두지 않는다', () => {
    stubMobile(true);
    const { container } = render(<CompareTable heads={['현재', '강화 후']} rows={rows} />);
    expect(container.querySelector('wbr')).toBeNull();
  });
});
