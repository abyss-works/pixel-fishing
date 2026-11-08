// 비교 표 — 값 열 폭은 PC 레이아웃에서 고정 rem, 모바일 레이아웃에서 칸 폭의 비율이다.
// heads가 하나면 현재 열만 보이고, 이름 칸의 줄 바꿈 허용은 모바일 레이아웃에만 적용된다.
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
  it('모바일 레이아웃에서 값 열은 칸 폭의 비율이고 이름 칸과 값 칸은 줄을 바꾸고 표의 최소 폭이 없다', () => {
    stubMobile(true);
    const { container } = render(<CompareTable heads={['현재', '강화 후']} rows={rows} />);
    expect(widths(container)).toEqual(['', '30%', '40%']);
    expect(container.querySelector('table')?.className).toContain('[&_td]:whitespace-normal');
    expect(container.querySelector('table')?.className).toContain('min-w-0!');
  });

  it('PC 레이아웃에서 값 열은 고정 폭이고 이름 칸의 줄 바꿈 규칙이 붙지 않는다', () => {
    stubMobile(false);
    const { container } = render(<CompareTable heads={['현재', '강화 후']} rows={rows} />);
    expect(widths(container)).toEqual(['', '7rem', '9rem']);
    expect(container.querySelector('table')?.className).not.toContain('[&_td]:whitespace-normal');
    expect(container.querySelector('table')?.className).not.toContain('min-w-0!');
  });

  it('heads가 하나면 현재 열만 보인다', () => {
    stubMobile(true);
    const { container } = render(<CompareTable heads={['현재']} rows={rows} />);
    expect(widths(container)).toEqual(['', '30%']);
    expect(container.querySelectorAll('thead th')).toHaveLength(2);
    expect(container.querySelectorAll('tbody td')).toHaveLength(2);
    expect(container.textContent).not.toContain('+31.25%');
  });
});
