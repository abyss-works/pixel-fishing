import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useWindowHost, windowHostRef } from './windowLayer';

function Probe() {
  const host = useWindowHost();
  return <p data-testid="probe">{host?.id ?? 'none'}</p>;
}

const makeHost = (id: string) => {
  const el = document.createElement('div');
  el.id = id;
  return el;
};

afterEach(cleanup);

describe('windowHostRef', () => {
  it('등록한 요소가 창 층 자리가 되고 해제하면 비워진다', () => {
    const a = makeHost('a');
    render(<Probe />);
    let release: (() => void) | void;
    act(() => { release = windowHostRef(a); });
    expect(screen.getByTestId('probe')).toHaveTextContent('a');
    act(() => release?.());
    expect(screen.getByTestId('probe')).toHaveTextContent('none');
  });

  it('새 자리가 먼저 등록된 뒤 이전 자리가 해제돼도 새 자리를 지우지 않는다', () => {
    const a = makeHost('a');
    const b = makeHost('b');
    render(<Probe />);
    let releaseA: (() => void) | void;
    let releaseB: (() => void) | void;
    act(() => { releaseA = windowHostRef(a); });
    act(() => { releaseB = windowHostRef(b); });
    act(() => releaseA?.());
    expect(screen.getByTestId('probe')).toHaveTextContent('b');
    act(() => releaseB?.());
    expect(screen.getByTestId('probe')).toHaveTextContent('none');
  });
});
