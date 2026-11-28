import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import Badge from './Badge';
import { resetKeyScopes } from './hotkeys';
import Tip, { TipBullets, TipCard, TipList } from './Tip';
import RecipeEffectTip from './RecipeEffectTip';
import { GradeName } from './fish/RarityTag';

const original = window.matchMedia;
afterEach(() => { cleanup(); resetKeyScopes(); window.matchMedia = original; vi.useRealTimers(); });

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
    expect(within(tip).getByText('네임드')).toHaveClass('text-named');
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
    expect(within(tip).getByText('돌연변이')).toHaveClass('text-mutation');
    expect(within(tip).getByText('특수')).toHaveAttribute('data-rarity', 'special');
  });

  it('RecipeEffectTip의 비수치 설명 줄은 2열로 쪼개지 않고 한 줄 전체 폭으로 렌더링한다', () => {
    render(
      <Tip
        text={(
          <RecipeEffectTip
            label={<GradeName name="달빛 미끼" grade="special" />}
            effects={[{ text: '낮에도 밤 어종이 함께 낚여요.' }, { label: '남은 시간', value: '30분' }]}
            note="챔질해서 낚을 때만 효과가 있어요."
          />
        )}
      >
        달빛 미끼
      </Tip>,
    );
    fireEvent.mouseEnter(screen.getByText('달빛 미끼'));
    const tip = screen.getByRole('tooltip');
    const textRow = within(tip).getByText('낮에도 밤 어종이 함께 낚여요.');
    expect(textRow.className).not.toContain('justify-between');
    expect(within(tip).getByText('남은 시간').closest('.justify-between')).not.toBeNull();
  });
});

describe('TipBullets & TipCard bullets: 픽셀 사각 불릿 목록', () => {
  it('빈 배열은 아무것도 그리지 않고, 단일 항목도 span 전용 계층과 4px 하늘색 사각 마커로 안전하게 렌더한다', () => {
    const empty = render(<TipBullets items={[]} />);
    expect(empty.container.firstChild).toBeNull();
    empty.unmount();

    const single = render(<TipBullets items={['한 줄 안내']} />);
    const root = single.container.firstElementChild as HTMLElement;
    expect(root.tagName).toBe('SPAN');
    expect(root.querySelectorAll('ul, li, div, p')).toHaveLength(0);
    const marker = root.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(marker.tagName).toBe('SPAN');
    expect(marker).toHaveClass('size-1', 'bg-accent', 'shrink-0');
    expect(root).toHaveTextContent('한 줄 안내');
  });

  it('문자열 항목의 등급·돌연변이·네임드 색칠을 자동 적용하고 ReactNode 항목도 함께 렌더한다', () => {
    render(
      <Tip
        text={(
          <TipBullets
            items={[
              '희귀 등급과 돌연변이, 네임드 강조를 유지해요.',
              <GradeName key="node" name="달빛 미끼" grade="special" />,
            ]}
          />
        )}
      >
        불릿
      </Tip>,
    );
    fireEvent.mouseEnter(screen.getByText('불릿'));
    const tip = screen.getByRole('tooltip');
    expect(within(tip).getByText('희귀')).toHaveAttribute('data-rarity', 'rare');
    expect(within(tip).getByText('돌연변이')).toHaveClass('text-mutation');
    expect(within(tip).getByText('네임드')).toHaveClass('text-named');
    expect(within(tip).getByText('(특수)')).toHaveAttribute('data-rarity', 'special');
    expect(tip.querySelectorAll('ul, li, div, p')).toHaveLength(0);
  });

  it('TipCard의 bullets는 헤더 구분선 아래, status·note 위에 픽셀 사각 불릿으로 자리잡는다', () => {
    render(
      <Tip
        text={(
          <TipCard
            title="해역별 기운 대상"
            bullets={['첫 번째 조건이에요.', '두 번째 조건이에요.']}
            status={{ tone: 'warn', lines: ['경고 첫 줄', '보조 설명'] }}
            note="하단 주석"
          />
        )}
      >
        카드
      </Tip>,
    );
    fireEvent.mouseEnter(screen.getByText('카드'));
    const tip = screen.getByRole('tooltip');
    const title = within(tip).getByText('해역별 기운 대상');
    const b1 = within(tip).getByText('첫 번째 조건이에요.');
    const b2 = within(tip).getByText('두 번째 조건이에요.');
    const warn = within(tip).getByText('경고 첫 줄');
    const note = within(tip).getByText('하단 주석');

    expect(title.compareDocumentPosition(b1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(b1.compareDocumentPosition(b2) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(b2.compareDocumentPosition(warn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(warn.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tip.querySelectorAll('.bg-accent.size-1')).toHaveLength(2);
    expect(tip.querySelectorAll('.border-t')).toHaveLength(3);
  });

  it('TipCard에 빈 bullets만 주어지면 본문 구분선을 만들지 않는다', () => {
    render(
      <Tip text={<TipCard title="제목" bullets={[]} />}>빈 불릿</Tip>,
    );
    fireEvent.mouseEnter(screen.getByText('빈 불릿'));
    const tip = screen.getByRole('tooltip');
    expect(tip.querySelectorAll('.border-t')).toHaveLength(0);
  });
});

describe('Tip: interactive', () => {
  it('마우스가 트리거를 벗어나 버블로 옮겨가면 닫히지 않고 유지되며, 버블 안 버튼을 누를 수 있다', () => {
    vi.useFakeTimers();
    setPointer(false);
    const onCopy = vi.fn();
    render(
      <Tip interactive plain text={<button type="button" onClick={onCopy}>복사</button>}>
        대상
      </Tip>,
    );

    fireEvent.mouseEnter(screen.getByText('대상'));
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveClass('pointer-events-auto');

    fireEvent.mouseLeave(screen.getByText('대상'));
    act(() => { vi.advanceTimersByTime(100); });
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.mouseEnter(tip);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.click(within(tip).getByRole('button', { name: '복사' }));
    expect(onCopy).toHaveBeenCalledTimes(1);

    fireEvent.mouseLeave(tip);
    act(() => { vi.advanceTimersByTime(150); });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('포커스가 버블 안 버튼으로 이동해도 닫히지 않고, 바깥으로 블러되거나 Esc를 누르면 닫힌다', () => {
    setPointer(false);
    render(
      <>
        <Tip interactive plain text={<button type="button">복사</button>}>대상</Tip>
        <button type="button">바깥</button>
      </>,
    );

    const trigger = screen.getByText('대상');
    fireEvent.focus(trigger);
    const copyBtn = within(screen.getByRole('tooltip')).getByRole('button', { name: '복사' });

    fireEvent.blur(trigger, { relatedTarget: copyBtn });
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.blur(trigger, { relatedTarget: screen.getByRole('button', { name: '바깥' }) });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('거친 포인터에서는 버블 안쪽을 눌러도 닫히지 않고 바깥을 누르면 닫힌다', () => {
    setPointer(true);
    render(
      <>
        <Tip interactive plain text={<button type="button">복사</button>}>대상</Tip>
        <p>바깥</p>
      </>,
    );

    fireEvent.click(screen.getByText('대상'));
    const copyBtn = within(screen.getByRole('tooltip')).getByRole('button', { name: '복사' });
    fireEvent.pointerDown(copyBtn);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByText('바깥'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
