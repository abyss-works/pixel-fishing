import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { resetOpenWindows, useOpenWindow } from './openWindows';
import FloatingToastLayer from './FloatingToastLayer';
import { useMessageLog } from '../layouts/hud/useMessageLog';

afterEach(() => {
  cleanup();
  resetOpenWindows();
});

describe('FloatingToastLayer', () => {
  it('1줄 알림과 닫기 버튼만 그리고 옷장 열기·바로 착용 버튼은 두지 않는다', () => {
    const onDismiss = vi.fn();
    render(
      <FloatingToastLayer
        toasts={[{ id: 1, text: '“북대서양 한밤 도감” 업적 보상으로 해령 등불 선원모를 받았어요!', tone: 'gold' }]}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('“북대서양 한밤 도감” 업적 보상으로 해령 등불 선원모를 받았어요!');
    expect(screen.queryByRole('button', { name: /옷장 열기|바로 착용/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '알림 닫기' }));
    expect(onDismiss).toHaveBeenCalledWith(1);
  });

  it('useMessageLog는 창이 열려 있을 때만 플로팅 알림을 쌓고 메시지 기록에도 함께 남긴다', () => {
    const { result: closedHook } = renderHook(() => useMessageLog([]));
    act(() => {
      closedHook.current.setToast('닫힌 상태 알림', 'info');
    });
    expect(closedHook.current.log).toHaveLength(1);
    expect(closedHook.current.toasts).toHaveLength(0);

    function WindowMarker() {
      useOpenWindow();
      return null;
    }
    render(<WindowMarker />);

    const { result: openHook } = renderHook(() => useMessageLog([]));
    act(() => {
      openHook.current.setToast('열린 상태 알림 1', 'gold');
      openHook.current.setToast('열린 상태 알림 2', 'gold');
      openHook.current.setToast('열린 상태 알림 3', 'gold');
    });
    expect(openHook.current.log).toHaveLength(3);
    expect(openHook.current.toasts.map(t => t.text)).toEqual(['열린 상태 알림 3', '열린 상태 알림 2']);
  });
});
