import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import QuestStatus from './QuestStatus';

const originalMatchMedia = window.matchMedia;
const button = () => screen.getByRole('button', { name: /^의뢰 창 열기/ });

describe('의뢰 현황', () => {
  afterEach(() => { window.matchMedia = originalMatchMedia; cleanup(); });

  it('오늘 의뢰 라벨 없이 일반, 네임드 두 칸에 라벨 다음 값을 보인다', () => {
    render(<QuestStatus general={1} named={0} generalCap={1} namedCap={1} />);
    expect(button().textContent).toBe('일반 1네임드 0');
    expect(button().textContent).not.toContain('오늘 의뢰');
  });

  it('가장 긴 값도 그대로 보인다', () => {
    render(<QuestStatus general={10} named={3} generalCap={1} namedCap={1} />);
    expect(button().textContent).toBe('일반 10네임드 3');
  });

  it('네임드 값만 네임드 색(영웅 보라)이다', () => {
    render(<QuestStatus general={1} named={1} generalCap={1} namedCap={1} />);
    const values = [...button().querySelectorAll('b')].map(b => b.parentElement!.className);
    expect(values[0]).toContain('text-gold');
    expect(values[1]).toContain('text-epic');
  });

  it('버튼이고, 접근성 이름에 열리는 창과 오늘 남은 클리어를 싣는다', () => {
    render(<QuestStatus general={1} named={0} generalCap={1} namedCap={1} />);
    expect(button()).toHaveAccessibleName('의뢰 창 열기, 오늘 남은 클리어 일반 1 네임드 0');
  });

  it('한 칸은 [색 표지 | 값] 한 줄이고, 이름은 sr-only와 툴팁으로 알린다', () => {
    render(<QuestStatus general={1} named={0} generalCap={1} namedCap={1} />);
    const cells = [...button().querySelectorAll('.pf-accent')].map(v => v.parentElement!);
    expect(cells).toHaveLength(2);
    for (const cell of cells) {
      expect(cell.className).toContain('inline-flex');
      expect(cell.className).not.toContain('flex-col');
      expect(cell.querySelector('.sr-only')).not.toBeNull();
    }
    const visible = cells.flatMap(cell => [...cell.childNodes].filter(n => !(n as HTMLElement).classList?.contains('sr-only')));
    expect(visible.map(n => n.textContent).join('')).not.toMatch(/일반|네임드/);
    fireEvent.mouseEnter(cells[1].parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('네임드 토벌 오늘 남은 클리어 0/1');
  });

  it('칸의 툴팁은 의뢰 창 고정 정보 줄과 같은 "남은 수/한도" 표기로 값을 싣는다', () => {
    render(<QuestStatus general={1} named={0} generalCap={2} namedCap={1} />);
    const cells = [...button().querySelectorAll('.pf-accent')].map(v => v.parentElement!.parentElement!);
    fireEvent.mouseEnter(cells[0]);
    expect(screen.getByRole('tooltip')).toHaveTextContent('일반 의뢰 오늘 남은 클리어 1/2');
  });

  it('일반과 네임드의 표지는 색과 함께 모양도 다르다(네모, 다이아몬드) - 색만으로 구분하지 않는다', () => {
    render(<QuestStatus general={1} named={1} generalCap={1} namedCap={1} />);
    const markers = [...button().querySelectorAll('svg[data-glyph]')];
    const shapes = markers.map(m => m.getAttribute('data-glyph'));
    expect(shapes).toEqual(['square', 'diamond']);
    // 다이아몬드는 한 줄짜리 네모 하나가 아니라 여러 행이다(작은 크기에서 십자로 보이지 않는 12행)
    expect(markers[0].querySelectorAll('rect')).toHaveLength(1);
    expect(markers[1].querySelectorAll('rect')).toHaveLength(12);
    for (const m of markers) {
      expect(m.getAttribute('class')).toContain('size-3');
      expect(m.getAttribute('class')).toContain('@min-[960px]:size-6');
    }
  });

  it('값 글자는 스테이지 폭 960px 이상에서 16px로 커진다', () => {
    render(<QuestStatus general={1} named={1} generalCap={1} namedCap={1} />);
    const value = button().querySelector('.pf-accent')!.className;
    expect(value).toContain('text-[12px]');
    expect(value).toContain('@min-[380px]:text-[13px]');
    expect(value).toContain('@min-[960px]:text-[16px]');
  });

  it('아직 모르는 값(null)은 화면에 0, 접근성 이름과 툴팁에는 -다', () => {
    render(<QuestStatus general={null} named={null} generalCap={1} namedCap={1} />);
    expect(button().textContent).toBe('일반 0네임드 0');
    expect(button()).toHaveAccessibleName('의뢰 창 열기, 오늘 남은 클리어 일반 - 네임드 -');
    fireEvent.mouseEnter(button().querySelector('.pf-accent')!.parentElement!.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('일반 의뢰 오늘 남은 클리어 -');
  });

  it('터치(거친 포인터)에서는 칸의 글자도 칸 여백도 눌러도 툴팁을 열지 않고 의뢰 창 열기만 실행한다', () => {
    window.matchMedia = ((query: string) => ({
      matches: query === '(pointer: coarse)', media: query,
      addEventListener: () => {}, removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    const onOpen = vi.fn();
    render(<QuestStatus general={1} named={1} generalCap={1} namedCap={1} onOpen={onOpen} />);
    const cell = button().querySelector('.pf-accent')!.parentElement!.parentElement!;
    fireEvent.click(cell);
    fireEvent.click(button().querySelector('.pf-accent')!);
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('누르면 의뢰 창을 연다', () => {
    const onOpen = vi.fn();
    render(<QuestStatus general={1} named={1} generalCap={1} namedCap={1} onOpen={onOpen} />);
    fireEvent.click(button());
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
