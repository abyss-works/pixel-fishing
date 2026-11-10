import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { newState } from '../../../game/rules/logic';
import ResourceBar from './ResourceBar';

const barButton = () => screen.getByRole('button', { name: /^스탯창 열기/ });
const hud = () => barButton().textContent ?? '';
const fish = (i: number) => ({ uid: `u${i}`, fishId: 'carp', form: 'normal' as const, size: 10,
  caughtAt: null, spot: null, judgment: null, locked: false });

describe('자원 바', () => {
  afterEach(() => { cleanup(); document.head.querySelectorAll('style').forEach(e => e.remove()); });

  it('골드, 명성, 배, 낚싯대, 가방 다섯 칸이 이 순서로 있고 의뢰 현황은 없다', () => {
    render(<ResourceBar game={newState()} />);
    expect(hud()).toMatch(/^골드 .+명성 .+배 .+낚싯대 .+가방 .+$/);
    expect(hud()).not.toContain('일반');
    expect(hud()).not.toContain('네임드');
    expect(hud()).not.toContain('오늘 의뢰');
  });

  it('칸 사이는 세로 구분선으로 가른다 - 다섯 칸에 구분선 넷', () => {
    render(<ResourceBar game={newState()} />);
    expect(barButton().querySelectorAll('.w-px')).toHaveLength(4);
  });

  it('골드·명성은 단위 없이 줄임 표기다', () => {
    render(<ResourceBar game={{ ...newState(), gold: 1_534_000, fame: 12_345 }} />);
    expect(hud()).toContain('골드 1.5M');
    expect(hud()).toContain('명성 12.3K');
  });

  it('배 칸은 배 이름, 낚싯대 칸은 Lv.<레벨>이다', () => {
    render(<ResourceBar game={{ ...newState(), boat: 3, rod: 12 }} />);
    expect(hud()).toContain('배 정크선');
    expect(hud()).toContain('낚싯대 Lv.12');
  });

  it('가방 칸은 게이지와 백분율만 보이고 수량은 화면에 쓰지 않는다', () => {
    render(<ResourceBar game={{ ...newState(), boat: 3, bag: Array.from({ length: 250 }, (_, i) => fish(i)) }} />);
    expect(hud()).toContain('가방 50%');
    expect(hud()).not.toMatch(/250|\//);
    expect(barButton().querySelector('[data-gauge]')).not.toBeNull();
  });

  it('가방 백분율은 내림 정수이고 75%에서도 그대로 보인다', () => {
    render(<ResourceBar game={{ ...newState(), boat: 0, bag: Array.from({ length: 45 }, (_, i) => fish(i)) }} />);
    expect(hud()).toContain('가방 75%');
  });

  it('가방이 가득 차도(100% 이상) 게이지 채움은 칸을 넘지 않는다', () => {
    render(<ResourceBar game={{ ...newState(), boat: 0, bag: Array.from({ length: 70 }, (_, i) => fish(i)) }} />);
    const fill = barButton().querySelector('[data-gauge] > span') as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });

  it('가방 칸에 마우스를 올리면 수량이 툴팁으로 뜨고, 접근성 이름에도 같은 값이 있다', () => {
    render(<ResourceBar game={{ ...newState(), boat: 3, bag: Array.from({ length: 1000 }, (_, i) => fish(i)) }} bagBonus={5} />);
    fireEvent.mouseEnter(screen.getAllByText('가방', { exact: false })[0].parentElement!.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('가방 1,000 / 3,000 (33%)');
    expect(barButton()).toHaveAccessibleName(expect.stringContaining('가방 1,000 / 3,000 (33%)'));
  });

  it('단계 경계를 모른다 - 간격과 게이지 폭은 헤더 행이 정한 변수를 읽고, 두 행 단계는 같은 버튼 안의 모바일 구성이다', () => {
    render(<ResourceBar game={newState()} />);
    const html = barButton().closest('div')!.outerHTML;
    expect(html).not.toMatch(/@(max|min)-\[\d+px\]:(?!text)|mobile:/);
    expect(html).toContain('gap-(--hdr-gap)');
    expect(html).toContain('w-(--hdr-gauge)');
    expect(screen.getAllByRole('button', { name: /^스탯창 열기/ })).toHaveLength(1);
  });

  it('두 행 본문은 모바일 레이아웃 자원 바와 같은 구성이다 - 이름은 화면에 쓰지 않고 골드와 명성은 유효숫자 세 자리, 배 칸은 Lv.<티어>', () => {
    render(<ResourceBar game={{ ...newState(), gold: 1_534_000, fame: 12_345, boat: 3 }} />);
    const rows = barButton().querySelector('[class*="--hdr-rows"]') as HTMLElement;
    expect(rows.textContent).toContain('1.53M');
    expect(rows.textContent).toContain('12.3K');
    expect(rows.textContent).toMatch(/배 Lv\.\d/);
    expect(rows.querySelectorAll('.w-px')).toHaveLength(0);
  });
});
