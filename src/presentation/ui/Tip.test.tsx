import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Tip from './Tip';

const original = window.matchMedia;
afterEach(() => { cleanup(); window.matchMedia = original; });

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
