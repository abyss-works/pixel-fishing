import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import Modal from './Modal';
import { resetKeyScopes } from './hotkeys';
import { resetOpenWindows } from './openWindows';
import { setWindowHost } from './windowLayer';

afterEach(() => { cleanup(); resetOpenWindows(); resetKeyScopes(); });

const backdropOf = () => screen.getByRole('dialog').parentElement!;

describe('Modal 층', () => {
  it.each([
    ['app', true, 'z-(--z-app-modal)'],
    ['app', false, 'z-(--z-blocker)'],
    ['stage', true, 'z-(--z-stage-modal)'],
    ['stage', false, 'z-(--z-blocker)'],
  ] as const)('%s 창 closable=%s의 바탕은 %s 층이다', (layer, closable, token) => {
    render(<Modal layer={layer} closable={closable} onClose={() => {}}>본문</Modal>);
    expect(backdropOf().className).toContain(token);
    const other = ['z-(--z-app-modal)', 'z-(--z-stage-modal)', 'z-(--z-blocker)'].filter(t => t !== token);
    for (const t of other) expect(backdropOf().className).not.toContain(t);
  });

  it('창의 바탕은 앱과 스테이지 모두 반투명 어두운 바탕으로 아래를 덮는다', () => {
    render(<Modal layer="stage" onClose={() => {}}>본문</Modal>);
    expect(backdropOf().className).toContain('absolute inset-0');
  });
});

describe('Modal 창 층 자리', () => {
  it('창 층 자리가 있으면 앱 모달은 호출한 곳이 바깥이어도 그 자리 안에 그려진다', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => setWindowHost(host));
    render(<div data-testid="outside"><Modal onClose={() => {}}>본문</Modal></div>);
    expect(host).toContainElement(screen.getByRole('dialog'));
    expect(screen.getByTestId('outside')).not.toContainElement(screen.getByRole('dialog'));
    act(() => setWindowHost(null));
    host.remove();
  });

  it('창 층 자리가 없으면 제자리에 그린다', () => {
    render(<div data-testid="outside"><Modal onClose={() => {}}>본문</Modal></div>);
    expect(screen.getByTestId('outside')).toContainElement(screen.getByRole('dialog'));
  });

  it('스테이지 창은 스테이지 안에 그리고 창 층 자리로 옮기지 않는다', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => setWindowHost(host));
    render(<div data-testid="outside"><Modal layer="stage" onClose={() => {}}>본문</Modal></div>);
    expect(screen.getByTestId('outside')).toContainElement(screen.getByRole('dialog'));
    act(() => setWindowHost(null));
    host.remove();
  });
});
