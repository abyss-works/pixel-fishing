import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const layout = vi.hoisted(() => ({ mobile: false }));
vi.mock('../useMobileLayout', () => ({ useMobileLayout: () => layout.mobile }));

import Sidebar from '.';
import Modal from '../../ui/Modal';
import { resetKeyScopes } from '../../ui/hotkeys';
import { resetOpenWindows } from '../../ui/openWindows';

const tabs = [{ key: 'a', label: '가' }, { key: 'b', label: '나' }];

afterEach(() => { cleanup(); layout.mobile = false; resetOpenWindows(); resetKeyScopes(); });

describe.each([['PC 레이아웃', false], ['모바일 레이아웃', true]])('Sidebar 탭 줄 - %s', (_, mobile) => {
  it('닫을 수 있는 창이 떠 있으면 탭을 눌러 창을 닫고 탭을 연다', () => {
    layout.mobile = mobile;
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<><Sidebar tabs={tabs} activeKey="a" onSelect={onSelect}><p>내용</p></Sidebar><Modal layer="stage" title="창" onClose={onClose}>본문</Modal></>);
    fireEvent.click(screen.getByRole('button', { name: '나' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('같은 탭을 다시 눌러도 떠 있던 창을 닫는다', () => {
    layout.mobile = mobile;
    const onClose = vi.fn();
    render(<><Sidebar tabs={tabs} activeKey="a" onSelect={() => {}}><p>내용</p></Sidebar><Modal title="앱 창" onClose={onClose}>본문</Modal></>);
    fireEvent.click(screen.getByRole('button', { name: '가' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each(['stage', 'app'] as const)('닫을 수 없는 %s 창이 떠 있으면 창은 그대로 두고 탭을 연다', layer => {
    layout.mobile = mobile;
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const onOther = vi.fn();
    render(<>
      <Sidebar tabs={tabs} activeKey="a" onSelect={onSelect}><p>내용</p></Sidebar>
      <Modal layer={layer} closable={false} onClose={onClose}>본문</Modal>
      <Modal layer="stage" onClose={onOther}>다른 창</Modal>
    </>);
    fireEvent.click(screen.getByRole('button', { name: '나' }));
    expect(onSelect).toHaveBeenCalledWith('b');
    expect(onClose).not.toHaveBeenCalled();
    expect(onOther).toHaveBeenCalledTimes(1);
  });

  it('창이 없으면 탭 선택만 동작한다', () => {
    layout.mobile = mobile;
    const onSelect = vi.fn();
    render(<Sidebar tabs={tabs} activeKey="a" onSelect={onSelect}><p>내용</p></Sidebar>);
    fireEvent.click(screen.getByRole('button', { name: '나' }));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('창이 닫히고 나면 등록이 사라져 다음 탭 누름에 영향을 주지 않는다', () => {
    layout.mobile = mobile;
    const onSelect = vi.fn();
    const { rerender } = render(<><Sidebar tabs={tabs} activeKey="a" onSelect={onSelect}><p>내용</p></Sidebar><Modal closable={false} onClose={() => {}}>본문</Modal></>);
    rerender(<Sidebar tabs={tabs} activeKey="a" onSelect={onSelect}><p>내용</p></Sidebar>);
    fireEvent.click(screen.getByRole('button', { name: '나' }));
    expect(onSelect).toHaveBeenCalledWith('b');
  });
});
