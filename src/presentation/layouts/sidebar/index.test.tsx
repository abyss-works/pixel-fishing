import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const layout = vi.hoisted(() => ({ mobile: false }));
vi.mock('../useMobileLayout', () => ({ useMobileLayout: () => layout.mobile }));

import Sidebar from '.';
import Modal from '../../ui/Modal';
import { resetKeyScopes } from '../../ui/hotkeys';
import { resetOpenWindows } from '../../ui/openWindows';
import { windowHostRef } from '../../ui/windowLayer';

const tabs = [{ key: 'a', label: '가' }, { key: 'b', label: '나' }];

afterEach(() => { cleanup(); layout.mobile = false; resetOpenWindows(); resetKeyScopes(); });

describe.each([['PC 레이아웃', false], ['모바일 레이아웃', true]])('Sidebar 탭 줄 - %s', (_, mobile) => {
  it.each([true, false])('스테이지 모달(closable=%s)이 열려 있어도 사이드바에 inert가 걸리지 않고 탭 전환이 자유롭다', closable => {
    layout.mobile = mobile;
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<><Sidebar tabs={tabs} activeKey="a" onSelect={onSelect}><p>내용</p></Sidebar><Modal layer="stage" closable={closable} title="창" onClose={onClose}>본문</Modal></>);
    const tab = screen.getByRole('button', { name: '나' });
    expect(tab.closest('[inert]')).toBeNull();
    fireEvent.click(tab);
    expect(onSelect).toHaveBeenCalledWith('b');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('앱 모달이 떠 있으면 탭을 눌러도 모달은 그대로 있고 탭을 바꾸지 않는다', () => {
    layout.mobile = mobile;
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<><Sidebar tabs={tabs} activeKey="a" onSelect={onSelect}><p>내용</p></Sidebar><Modal layer="app" title="앱 창" onClose={onClose}>본문</Modal></>);
    fireEvent.click(screen.getByRole('button', { name: '가' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('닫을 수 없는 앱 모달(blocker)이 떠 있으면 탭 입력을 받지 않는다', () => {
    layout.mobile = mobile;
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const onOther = vi.fn();
    render(<>
      <Sidebar tabs={tabs} activeKey="a" onSelect={onSelect}><p>내용</p></Sidebar>
      <Modal layer="app" closable={false} onClose={onClose}>본문</Modal>
      <Modal layer="stage" onClose={onOther}>다른 창</Modal>
    </>);
    fireEvent.click(screen.getByRole('button', { name: '나' }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(onOther).not.toHaveBeenCalled();
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
  });

  it('창이 없으면 탭 선택만 동작한다', () => {
    layout.mobile = mobile;
    const onSelect = vi.fn();
    render(<Sidebar tabs={tabs} activeKey="a" onSelect={onSelect}><p>내용</p></Sidebar>);
    fireEvent.click(screen.getByRole('button', { name: '나' }));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('앱 모달이 닫히고 나면 탭 입력이 다시 동작한다', () => {
    layout.mobile = mobile;
    const onSelect = vi.fn();
    const view = (open: boolean) => (
      <>{<Sidebar tabs={tabs} activeKey="a" onSelect={onSelect}><p>내용</p></Sidebar>}{open && <Modal layer="app" onClose={() => {}}>본문</Modal>}</>
    );
    const { rerender } = render(view(true));
    rerender(view(false));
    fireEvent.click(screen.getByRole('button', { name: '나' }));
    expect(onSelect).toHaveBeenCalledWith('b');
  });
});

describe('Sidebar 시트 - 시트에서 연 창', () => {
  const withWindowLayer = () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const release = windowHostRef(host);
    return { host, done: () => { act(() => release?.()); host.remove(); } };
  };

  it('모바일 레이아웃에서 시트의 내용이 연 창은 시트 위에 쌓이고, 닫으면 시트가 그대로 남는다', () => {
    layout.mobile = true;
    const { host, done } = withWindowLayer();
    const view = (open: boolean) => (
      <Sidebar tabs={tabs} activeKey="a" onSelect={() => {}} sheetOpen>
        <p>시트 내용</p>
        {open && <Modal layer="app" title="시트에서 연 창" onClose={() => {}}>본문</Modal>}
      </Sidebar>
    );
    const { rerender } = render(view(true));
    const sheet = screen.getByRole('region', { name: '탭 내용' });
    expect(sheet).toContainElement(screen.getByRole('dialog'));
    expect(host).not.toContainElement(screen.getByRole('dialog'));
    rerender(view(false));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('region', { name: '탭 내용' })).toContainElement(screen.getByText('시트 내용'));
    done();
  });

  it('PC 레이아웃의 탭 내용이 연 창은 창 층에 그려진다 - 시트가 없다', () => {
    layout.mobile = false;
    const { host, done } = withWindowLayer();
    render(<Sidebar tabs={tabs} activeKey="a" onSelect={() => {}}><Modal layer="app" title="창" onClose={() => {}}>본문</Modal></Sidebar>);
    expect(host).toContainElement(screen.getByRole('dialog'));
    done();
  });

  it('시트 밖에서 연 창(스테이지, 헤더)은 시트가 열려 있어도 창 층에 그려진다', () => {
    layout.mobile = true;
    const { host, done } = withWindowLayer();
    render(<>
      <Sidebar tabs={tabs} activeKey="a" onSelect={() => {}} sheetOpen><p>시트 내용</p></Sidebar>
      <Modal layer="app" title="헤더에서 연 창" onClose={() => {}}>본문</Modal>
    </>);
    expect(host).toContainElement(screen.getByRole('dialog'));
    expect(screen.getByRole('region', { name: '탭 내용' })).not.toContainElement(screen.getByRole('dialog'));
    done();
  });
});
