// 창 카드 — 제목과 하단 버튼은 고정하고 본문 한 곳만 공용 스크롤 방식으로 스크롤한다.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import Modal from './Modal';
import ModalCard from './ModalCard';

afterEach(cleanup);

const scrollBody = () => screen.getByText('본문').parentElement as HTMLElement;

describe('ModalCard', () => {
  it('본문을 공용 스크롤 방식의 한 칸으로 감싸고 제목과 하단 버튼은 그 밖에 둔다', () => {
    render(
      <ModalCard title="창" onClose={() => {}} footer={<span>잔액</span>} confirm={<button>확정</button>}>
        <p>본문</p>
      </ModalCard>,
    );
    const body = scrollBody();
    expect(body).toHaveClass('pf-vscroll', 'pf-scroll-panel');
    expect(body).not.toHaveClass('pf-scroll');
    expect(body).toContainElement(screen.getByText('본문'));
    expect(body).not.toContainElement(screen.getByText('창'));
    expect(body).not.toContainElement(screen.getByText('잔액'));
    expect(body).not.toContainElement(screen.getByText('확정'));
  });

  it('본문이 스스로 스크롤하는 고정 높이 창(fixed)은 본문 칸을 스크롤 영역으로 만들지 않는다', () => {
    render(
      <ModalCard title="탭 창" onClose={() => {}} fixed>
        <p>본문</p>
      </ModalCard>,
    );
    const body = scrollBody();
    expect(body).not.toHaveClass('pf-vscroll');
    expect(body).not.toHaveClass('pf-scroll-panel');
  });

  it('스테이지 모달 래퍼는 배치만 맡고 스크롤 클래스를 갖지 않는다', () => {
    render(
      <Modal layer="stage" onClose={() => {}}>
        <ModalCard title="창" onClose={() => {}}><p>본문</p></ModalCard>
      </Modal>,
    );
    const wrapper = screen.getByRole('dialog');
    expect(wrapper.className).not.toMatch(/pf-vscroll|pf-scroll|overflow-(?:x-|y-)?(?:auto|scroll)/);
    expect(wrapper).toContainElement(scrollBody());
  });

  it('닫기 함수가 없으면 닫기 X를 그리지 않는다', () => {
    render(<ModalCard title="조우"><p>본문</p></ModalCard>);
    expect(screen.queryByRole('button', { name: /닫기/ })).toBeNull();
  });
  it('카드는 className을 받지 않는다 — 스크롤 클래스가 카드 자체에 걸리는 길을 타입으로 막는다', () => {
    render(
      // @ts-expect-error 카드에는 className이 없다. 변형은 centered 같은 명시 prop으로 고른다
      <ModalCard title="창" className="overflow-y-auto"><p>본문</p></ModalCard>,
    );
    const card = screen.getByText('창').parentElement as HTMLElement;
    expect(card.className).not.toMatch(/overflow|pf-vscroll/);
  });
  it('centered는 본문 글줄을 가운데 맞춘다', () => {
    render(<ModalCard title="조우" centered><p>본문</p></ModalCard>);
    expect(screen.getByText('조우').parentElement).toHaveClass('text-center', 'text-sm');
  });
  it('앱 모달은 제목을 고정하고 본문 한 칸만 공용 스크롤 방식으로 스크롤한다', () => {
    render(<Modal title="설정" onClose={() => {}}><p>내용</p></Modal>);
    const box = screen.getByRole('dialog');
    const body = screen.getByText('내용').parentElement as HTMLElement;
    expect(box.className).not.toMatch(/pf-vscroll|pf-scroll|overflow/);
    expect(body).toHaveClass('pf-vscroll', 'pf-scroll-panel', '[scrollbar-gutter:stable]');
    expect(body).not.toContainElement(screen.getByText('설정'));
    expect(box).toContainElement(body);
  });
  it('스테이지 모달은 className을 받지 않는다 — 높이는 height로 고른다(타입 검사)', () => {
    render(
      // @ts-expect-error 스테이지 모달의 투명 래퍼에는 스크롤 클래스가 들어갈 길이 없어야 한다
      <Modal layer="stage" className="pf-vscroll" onClose={() => {}}><p>가</p></Modal>,
    );
    render(<Modal layer="stage" height={480} onClose={() => {}}><p>나</p></Modal>);
    expect(screen.getAllByRole('dialog').at(-1)?.className).toMatch(/h-\[min\(480px/);
  });
});
