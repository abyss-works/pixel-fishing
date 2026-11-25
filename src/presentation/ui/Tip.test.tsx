import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import Badge from './Badge';
import { resetKeyScopes } from './hotkeys';
import Tip, { TipCard, TipList } from './Tip';
import RecipeEffectTip from './RecipeEffectTip';
import { GradeName } from './fish/RarityTag';

const original = window.matchMedia;
afterEach(() => { cleanup(); resetKeyScopes(); window.matchMedia = original; });

function setPointer(coarse: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: coarse && query === '(pointer: coarse)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

describe('Tip: 마우스', () => {
  it('마우스를 올리면 열리고 벗어나면 닫힌다', () => {
    setPointer(false);
    render(<Tip text="설명">대상</Tip>);
    fireEvent.mouseEnter(screen.getByText('대상'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('설명');
    fireEvent.mouseLeave(screen.getByText('대상'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('누르기로는 열리지 않는다', () => {
    setPointer(false);
    render(<Tip text="설명">대상</Tip>);
    fireEvent.click(screen.getByText('대상'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

describe('Tip: 거친 포인터(터치)', () => {
  it('누르면 열리고, 같은 대상을 다시 누르면 닫힌다', () => {
    setPointer(true);
    render(<Tip text="설명">대상</Tip>);
    fireEvent.click(screen.getByText('대상'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('설명');
    fireEvent.click(screen.getByText('대상'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('누르기에 딸려 오는 마우스 올림 이벤트로는 열리지 않는다', () => {
    setPointer(true);
    render(<Tip text="설명">대상</Tip>);
    fireEvent.mouseEnter(screen.getByText('대상'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('바깥을 누르면 닫힌다', () => {
    setPointer(true);
    render(<><Tip text="설명">대상</Tip><p>바깥</p></>);
    fireEvent.click(screen.getByText('대상'));
    fireEvent.pointerDown(screen.getByText('바깥'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('대상 안을 누르는 동안에는 바깥 누르기로 닫지 않는다', () => {
    setPointer(true);
    render(<Tip text="설명">대상</Tip>);
    fireEvent.click(screen.getByText('대상'));
    fireEvent.pointerDown(screen.getByText('대상'));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('버튼을 감싼 툴팁은 비활성 버튼 자리를 누를 때 열리고, 켜진 버튼을 누를 때는 열리지 않는다', () => {
    setPointer(true);
    render(
      <Tip wraps text="이유"><button type="button" disabled>잠김</button></Tip>,
    );
    // 비활성 버튼은 누르기를 받지 않아 감싼 자리가 받는다
    fireEvent.click(screen.getByText('잠김').parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('이유');
    cleanup();

    render(<Tip wraps text="이유"><button type="button">열림</button></Tip>);
    fireEvent.click(screen.getByText('열림'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
  it('누르기로도 여는 감싼 툴팁은 켜진 버튼을 눌러도 열린다', () => {
    setPointer(true);
    render(<Tip wraps pressOpens text="설명"><button type="button">열림</button></Tip>);
    fireEvent.click(screen.getByText('열림'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('설명');
    fireEvent.click(screen.getByText('열림'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

describe('Tip: 조건부 열기', () => {
  it('onlyIf가 거짓이면 마우스를 올려도 열리지 않고, 참이면 열린다', () => {
    setPointer(false);
    let allowed = false;
    render(<Tip text="설명" onlyIf={() => allowed}>대상</Tip>);
    fireEvent.mouseEnter(screen.getByText('대상'));
    expect(screen.queryByRole('tooltip')).toBeNull();
    allowed = true;
    fireEvent.mouseEnter(screen.getByText('대상'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('설명');
  });
});

describe('Tip: hoverOnly', () => {
  it('마우스에서는 호버로 열린다', () => {
    setPointer(false);
    render(<Tip hoverOnly text="설명">대상</Tip>);
    fireEvent.mouseEnter(screen.getByText('대상'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('설명');
  });

  it('거친 포인터에서는 감싼 칸 자체를 눌러도 열리지 않는다', () => {
    setPointer(true);
    render(<Tip hoverOnly wraps text="설명"><span>대상</span></Tip>);
    fireEvent.click(screen.getByText('대상').parentElement!);
    fireEvent.click(screen.getByText('대상'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('hoverOnly가 아니면 거친 포인터에서 감싼 칸 자체를 누르면 열린다(차이 확인)', () => {
    setPointer(true);
    render(<Tip wraps text="설명"><span>대상</span></Tip>);
    fireEvent.click(screen.getByText('대상').parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('설명');
  });
});

describe('Tip: Esc 및 스크롤 닫힘', () => {
  it('열린 상태에서 Esc를 누르면 포커스 이동 없이 툴팁이 닫힌다', () => {
    setPointer(false);
    render(<><Tip text="설명">대상</Tip><button type="button">다음</button></>);
    const trigger = screen.getByText('대상');
    trigger.focus();
    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('열린 상태에서 스크롤 이벤트가 발생하면 툴팁이 닫힌다', () => {
    setPointer(true);
    render(<div data-testid="scroller"><Tip text="설명">대상</Tip></div>);
    fireEvent.click(screen.getByText('대상'));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.scroll(screen.getByTestId('scroller'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

describe('TipCard: 구조형 툴팁 위계', () => {
  it('헤더(제목·부제·배지), 본문/목록, 구분선 아래 잠금 상태, 주석 순서를 지키고 금지 문자가 없다', () => {
    render(
      <Tip
        text={(
          <TipCard
            title="여객선"
            subtitle="빠른 이동"
            badge={<Badge tone="dim-plain" size="2xs">잠김</Badge>}
            description="다른 항구로 이동해요."
            rows={[{ label: '필요 배', value: '조각배(1단계)' }]}
            status={{ tone: 'lock', lines: ['태평양 항로가 열리면 쓸 수 있어요.', '조각배부터 탈 수 있어요.'] }}
            note="항구마다 같은 기능을 써요."
          />
        )}
      >
        대상
      </Tip>,
    );
    fireEvent.mouseEnter(screen.getByText('대상'));
    const tip = screen.getByRole('tooltip');
    const title = within(tip).getByText('여객선');
    const subtitle = within(tip).getByText('빠른 이동');
    const badge = within(tip).getByText('잠김');
    const desc = within(tip).getByText('다른 항구로 이동해요.');
    const lockLine = within(tip).getByText('태평양 항로가 열리면 쓸 수 있어요.');
    const note = within(tip).getByText('항구마다 같은 기능을 써요.');

    expect(title.tagName).toBe('B');
    expect(title.compareDocumentPosition(subtitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(badge.compareDocumentPosition(desc) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(desc.compareDocumentPosition(lockLine) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(lockLine.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tip.querySelectorAll('.border-t').length).toBeGreaterThanOrEqual(2);
    expect(tip.querySelector('[data-glyph="lock"]')).not.toBeNull();
    expect(tip.textContent).not.toMatch(/[·—–]/);
  });

  it('Tip·TipCard·TipList·RecipeEffectTip은 문자열 속 등급·네임드·돌연변이와 ReactNode를 함께 색칠한다', () => {
    render(
      <>
        <Tip text="네임드 토벌과 전설 어종 안내">단문</Tip>
        <Tip text={<TipList rows={[{ label: <GradeName name="생명의 기운" grade="rare" />, value: '+2' }]} note="일반 등급 안내" />}>목록</Tip>
        <Tip text={<RecipeEffectTip label={<GradeName name="사프란 미끼" grade="special" />} effects={[{ label: '돌연변이 출현', value: '+5%' }]} note="특수 효과" />}>요리</Tip>
      </>,
    );
    fireEvent.mouseEnter(screen.getByText('단문'));
    let tip = screen.getByRole('tooltip');
    expect(within(tip).getByText('네임드')).toHaveClass('text-epic');
    expect(within(tip).getByText('전설')).toHaveAttribute('data-rarity', 'legendary');
    fireEvent.mouseLeave(screen.getByText('단문'));

    fireEvent.mouseEnter(screen.getByText('목록'));
    tip = screen.getByRole('tooltip');
    expect(within(tip).getByText('(희귀)')).toHaveAttribute('data-rarity', 'rare');
    expect(within(tip).getByText('일반')).toHaveAttribute('data-rarity', 'common');
    fireEvent.mouseLeave(screen.getByText('목록'));

    fireEvent.mouseEnter(screen.getByText('요리'));
    tip = screen.getByRole('tooltip');
    expect(within(tip).getByText('(특수)')).toHaveAttribute('data-rarity', 'special');
    expect(within(tip).getByText('돌연변이')).toHaveClass('text-epic');
    expect(within(tip).getByText('특수')).toHaveAttribute('data-rarity', 'special');
  });
});
