import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import Modal from './Modal';
import { resetKeyScopes } from './hotkeys';
import { resetOpenWindows } from './openWindows';
import { windowHostRef } from './windowLayer';
import WindowSlot from './WindowSlot';

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
    const release = windowHostRef(host);
    render(<div data-testid="outside"><Modal onClose={() => {}}>본문</Modal></div>);
    expect(host).toContainElement(screen.getByRole('dialog'));
    expect(screen.getByTestId('outside')).not.toContainElement(screen.getByRole('dialog'));
    act(() => release?.());
    host.remove();
  });

  it('창 층 자리가 없으면 제자리에 그린다', () => {
    render(<div data-testid="outside"><Modal onClose={() => {}}>본문</Modal></div>);
    expect(screen.getByTestId('outside')).toContainElement(screen.getByRole('dialog'));
  });

  it('스테이지 창은 스테이지 안에 그리고 창 층 자리로 옮기지 않는다', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const release = windowHostRef(host);
    render(<div data-testid="outside"><Modal layer="stage" onClose={() => {}}>본문</Modal></div>);
    expect(screen.getByTestId('outside')).toContainElement(screen.getByRole('dialog'));
    act(() => release?.());
    host.remove();
  });

  it('닫을 수 없는 스테이지 창도 스테이지 안에 남고 창 층 자리로 옮기지 않는다 - 결투 창', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const release = windowHostRef(host);
    render(<div data-testid="outside"><Modal layer="stage" closable={false} onClose={() => {}}>본문</Modal></div>);
    expect(screen.getByTestId('outside')).toContainElement(screen.getByRole('dialog'));
    expect(host).not.toContainElement(screen.getByRole('dialog'));
    expect(backdropOf().className).toContain('absolute inset-0');
    act(() => release?.());
    host.remove();
  });

  it('닫을 수 없는 앱 창은 창 층 자리에 그리고 바탕이 탭 줄 아래(blocker)다 - 새 버전 안내 등', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const release = windowHostRef(host);
    render(<div data-testid="outside"><Modal closable={false} onClose={() => {}}>본문</Modal></div>);
    expect(host).toContainElement(screen.getByRole('dialog'));
    expect(backdropOf().className).toContain('fixed inset-0');
    expect(backdropOf().className).toContain('z-(--z-blocker)');
    act(() => release?.());
    host.remove();
  });
});

describe('창 쌓임 - 자기를 연 층 바로 위', () => {
  const withHost = () => {
    const host = document.createElement('div');
    host.dataset.testid = 'window-layer';
    document.body.appendChild(host);
    const release = windowHostRef(host);
    return { host, done: () => { act(() => release?.()); host.remove(); } };
  };

  it('창 층 위에 놓인 층(WindowSlot) 안에서 연 창은 그 층 안, 창 층 자리가 아니라 그 층 바로 위에 그려진다', () => {
    const { host, done } = withHost();
    render(<section data-testid="sheet"><WindowSlot><p>시트 내용</p><Modal title="시트에서 연 창" onClose={() => {}}>본문</Modal></WindowSlot></section>);
    const dialog = screen.getByRole('dialog');
    expect(screen.getByTestId('sheet')).toContainElement(dialog);
    expect(host).not.toContainElement(dialog);
    done();
  });

  it('층 안의 창이 닫히면 층의 내용은 그대로 남는다', () => {
    const { done } = withHost();
    const { rerender } = render(<section><WindowSlot><p>시트 내용</p><Modal onClose={() => {}}>본문</Modal></WindowSlot></section>);
    rerender(<section><WindowSlot><p>시트 내용</p></WindowSlot></section>);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('시트 내용')).toBeInTheDocument();
    done();
  });

  it('층 안의 창에서 연 창도 같은 층 안에서 뒤에 그려져 위에 쌓인다', () => {
    const { host, done } = withHost();
    render(<section data-testid="sheet"><WindowSlot>
      <Modal title="첫째" onClose={() => {}}><Modal title="둘째" onClose={() => {}}>안쪽</Modal></Modal>
    </WindowSlot></section>);
    const [first, second] = screen.getAllByRole('dialog');
    expect(screen.getByTestId('sheet')).toContainElement(first);
    expect(screen.getByTestId('sheet')).toContainElement(second);
    expect(host).not.toContainElement(second);
    expect(first.parentElement!.compareDocumentPosition(second.parentElement!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    done();
  });

  it('스테이지, 채팅과 헤더, 다른 창에서 연 창(WindowSlot 밖)은 창 층 자리에 그려진다', () => {
    const { host, done } = withHost();
    render(<div data-testid="chrome"><Modal title="창" onClose={() => {}}><Modal title="안쪽 창" onClose={() => {}}>본문</Modal></Modal></div>);
    for (const dialog of screen.getAllByRole('dialog')) expect(host).toContainElement(dialog);
    done();
  });

  it('층 자리가 아직 만들어지지 않은 첫 렌더에서는 창을 제자리에 그리지 않는다', () => {
    expect(renderToString(<WindowSlot><Modal onClose={() => {}}>본문</Modal></WindowSlot>)).not.toContain('dialog');
  });
});
