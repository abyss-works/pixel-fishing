import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newState } from '../../../game/rules/logic';
import MobileResourceBar from './MobileResourceBar';

const barButton = () => screen.getByRole('button', { name: /^스탯창 열기/ });
const hud = () => barButton().textContent ?? '';
const fish = (i: number) => ({ uid: `u${i}`, fishId: 'carp', form: 'normal' as const, size: 10,
  caughtAt: null, spot: null, judgment: null, locked: false });

describe('모바일 자원 바', () => {
  const original = window.matchMedia;
  afterEach(() => { window.matchMedia = original; cleanup(); document.head.querySelectorAll('style').forEach(e => e.remove()); });

  it('골드, 명성, 배, 낚싯대, 가방 다섯 칸이 이 순서로 있고 의뢰 현황은 없다', () => {
    render(<MobileResourceBar game={newState()} />);
    expect(hud()).toMatch(/^골드 .+명성 .+배 .+낚싯대 .+가방 .+$/);
    expect(hud()).not.toContain('일반');
    expect(hud()).not.toContain('네임드');
  });

  it('두 행이다 - 1행은 골드, 명성, 배, 낚싯대 네 칸, 2행은 가방', () => {
    render(<MobileResourceBar game={newState()} />);
    const rows = [...barButton().children];
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toMatch(/^골드 .+명성 .+배 .+낚싯대 .+$/);
    expect(rows[0].textContent).not.toContain('가방');
    expect(rows[1].textContent).toMatch(/가방 \d+%$/);
  });

  it('골드·명성은 단위 없이 줄임 표기다', () => {
    render(<MobileResourceBar game={{ ...newState(), gold: 1_534_000, fame: 12_345 }} />);
    expect(hud()).toContain('골드 1.53M');
    expect(hud()).toContain('명성 12.3K');
  });

  it('배 칸 값은 배 이름 대신 낚싯대 칸과 같은 Lv.<티어> 형식이다', () => {
    render(<MobileResourceBar game={{ ...newState(), boat: 3, rod: 12 }} />);
    expect(hud()).toContain('배 Lv.3');
    expect(hud()).toContain('낚싯대 Lv.12');
    expect(hud()).not.toContain('정크선');
  });

  it('가방은 게이지와 백분율만 보이고, 어떤 폭에서도 생략하지 않는다', () => {
    for (const n of [0, 472, 1000, 2990]) {
      cleanup();
      render(<MobileResourceBar game={{ ...newState(), boat: 3, bag: Array.from({ length: n }, (_, i) => fish(i)) }} bagBonus={5} />);
      expect(barButton().querySelector('[data-gauge]')).not.toBeNull();
      expect(hud()).toMatch(/가방 \d+%$/);
      expect(hud()).not.toMatch(/\//);
    }
    expect(barButton().outerHTML).not.toContain('@max-[440px]');
    expect(barButton().querySelector('[data-omittable]')).toBeNull();
  });

  it('1행의 칸은 [아이콘 | 값] 한 줄이다 - 이름은 화면 글자가 아니라 sr-only이다', () => {
    render(<MobileResourceBar game={newState()} />);
    const cells = [...barButton().children[0].querySelectorAll('.pf-accent')].map(v => v.parentElement!);
    expect(cells).toHaveLength(4);
    for (const cell of cells) {
      expect(cell.className).toContain('inline-flex');
      expect(cell.className).not.toContain('flex-col');
      expect(cell.querySelector('svg')).not.toBeNull();
      expect(cell.querySelector('.sr-only')).not.toBeNull();
      const visible = [...cell.childNodes].filter(n => !(n as HTMLElement).classList?.contains('sr-only')).map(n => n.textContent).join('');
      expect(visible).not.toMatch(/골드|명성|낚싯대|가방/);
    }
  });

  it('칸 사이에 구분선이 없다', () => {
    render(<MobileResourceBar game={newState()} />);
    expect(barButton().querySelector('.w-px, hr')).toBeNull();
  });

  describe('칸의 이름 툴팁', () => {
    const game = () => ({ ...newState(), boat: 3, rod: 12, bag: Array.from({ length: 1000 }, (_, i) => fish(i)) });
    const cell = (label: string) => screen.getByText(label, { exact: false }).parentElement!.parentElement!;

    it('칸에 마우스를 올리면 그 칸의 이름과 정확한 값이 툴팁으로 뜬다', () => {
      render(<MobileResourceBar game={{ ...game(), gold: 1_234_567, fame: 999_999 }} bagBonus={5} />);
      for (const [label, tip] of [['골드', '골드 1,234,567'], ['명성', '명성 999,999'], ['배', '배 정크선'],
        ['낚싯대', '낚싯대 Lv.12'], ['가방', '가방 1,000 / 3,000 (33%)']] as const) {
        const target = cell(label);
        fireEvent.mouseEnter(target);
        expect(screen.getByRole('tooltip')).toHaveTextContent(tip);
        fireEvent.mouseLeave(target);
      }
    });

    it('접근성 이름에 다섯 칸의 정확한 값이 들어 있어 키보드와 화면 읽기도 같은 정보를 얻는다', () => {
      render(<MobileResourceBar game={{ ...game(), gold: 1_234_567, fame: 999_900 }} bagBonus={5} />);
      expect(barButton()).toHaveAccessibleName(
        '스탯창 열기, 골드 1,234,567, 명성 999,900, 배 정크선, 낚싯대 Lv.12, 가방 1,000 / 3,000 (33%)');
    });

    it('터치(거친 포인터)에서는 칸의 글자도 칸 여백도 눌러도 툴팁을 열지 않고 스탯 창 열기만 실행한다', () => {
      window.matchMedia = ((query: string) => ({
        matches: query === '(pointer: coarse)', media: query,
        addEventListener: () => {}, removeEventListener: () => {},
      })) as unknown as typeof window.matchMedia;
      const onOpen = vi.fn();
      render(<MobileResourceBar game={game()} bagBonus={5} onOpen={onOpen} />);
      fireEvent.click(screen.getByText('가방', { exact: false }));
      fireEvent.click(cell('가방'));
      fireEvent.click(cell('배'));
      expect(onOpen).toHaveBeenCalledTimes(3);
      expect(screen.queryByRole('tooltip')).toBeNull();
    });
  });
});
