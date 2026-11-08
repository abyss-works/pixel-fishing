// 목록형 시설 창 골격 — 확정 영역은 두 열(PC 레이아웃)에서는 오른쪽 열 맨 아래, 한 열(모바일 레이아웃)에서는 카드 하단 고정 자리에 있고
// 어느 쪽이든 스크롤 칸 밖에 있다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import FacilityCard from './FacilityCard';
import { resetKeyScopes } from '../../../ui/hotkeys';

afterEach(() => { cleanup(); resetKeyScopes(); vi.unstubAllGlobals(); });

const stubMobile = (mobile: boolean) => vi.stubGlobal('matchMedia', (query: string) => ({
  matches: mobile && query.includes('width <'), media: query,
  addEventListener: () => {}, removeEventListener: () => {},
}));

const show = () => render(
  <FacilityCard title="시설" onClose={() => {}}
    list={<p>목록</p>} detail={<p>상세</p>} summary={<p>잔액</p>} confirm={<button>확정</button>} />,
);

describe('FacilityCard', () => {
  it('두 열에서는 확정 영역이 오른쪽 열 맨 아래에 있고 스크롤 칸 밖이다', () => {
    stubMobile(false);
    show();
    const confirm = screen.getByRole('button', { name: '확정' });
    expect(confirm.closest('.pf-vscroll')).toBeNull();
    expect(screen.getByText('잔액').closest('.pf-vscroll')).toBeNull();
    const detailScroll = screen.getByText('상세').closest('.pf-vscroll') as HTMLElement;
    expect(detailScroll).not.toBeNull();
    // 상세 칸과 확정 영역은 같은 오른쪽 열 안의 형제이고, 목록은 다른 열이다
    const column = detailScroll.parentElement as HTMLElement;
    expect(column).toContainElement(confirm);
    expect(column.lastElementChild).toContainElement(confirm);
    expect(column).not.toContainElement(screen.getByText('목록'));
    expect(screen.getByText('목록').closest('.pf-vscroll')).not.toBeNull();
  });

  it('한 열에서는 확정 영역이 카드 하단 고정 자리에 있고 본문 한 칸만 스크롤한다', () => {
    stubMobile(true);
    show();
    const confirm = screen.getByRole('button', { name: '확정' });
    const scrolls = document.querySelectorAll('.pf-vscroll');
    expect(scrolls).toHaveLength(1);
    expect(scrolls[0]).not.toContainElement(confirm);
    expect(scrolls[0]).not.toContainElement(screen.getByText('잔액'));
    expect(scrolls[0]).toContainElement(screen.getByText('목록'));
    expect(scrolls[0]).toContainElement(screen.getByText('상세'));
  });
});
