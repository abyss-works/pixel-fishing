import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { sendNotice } from '../../features/display/model/toastPolicy';
import { resetToastEnabled, setToastEnabled } from '../../features/display/service/toastEnabled';
import { resetOpenWindows, useOpenWindow } from './openWindows';
import FloatingToastLayer from './FloatingToastLayer';
import Modal from './Modal';
import { useMessageLog } from '../layouts/hud/useMessageLog';

function WindowMarker() {
  useOpenWindow();
  return null;
}

beforeEach(() => {
  localStorage.clear();
  resetToastEnabled();
  resetOpenWindows();
});

afterEach(() => {
  cleanup();
  resetOpenWindows();
  resetToastEnabled();
  vi.useRealTimers();
});

describe('FloatingToastLayer', () => {
  it('1줄 truncate 알림과 닫기(X) 버튼만 그리고 원격 시설 실행 버튼은 두지 않는다', () => {
    const onDismiss = vi.fn();
    render(
      <FloatingToastLayer
        toasts={[{ id: 1, text: '“북대서양 한밤 도감” 업적 보상으로 해령 등불 선원모를 받았어요!', tone: 'gold' }]}
        onDismiss={onDismiss}
      />,
    );
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('“북대서양 한밤 도감” 업적 보상으로 해령 등불 선원모를 받았어요!');
    const textSpan = status.querySelector('span');
    expect(textSpan?.className).toContain('truncate');
    expect(textSpan?.className).toContain('whitespace-nowrap');
    expect(screen.queryByRole('button', { name: /옷장 열기|바로 착용|수배판|이동/ })).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '알림 닫기' }));
    expect(onDismiss).toHaveBeenCalledWith(1);
  });

  it('8종 톤(gold, accent, danger, guild, epic, named, mutation, neutral)을 각 톤 색 토큰으로 렌더링한다', () => {
    const onDismiss = vi.fn();
    render(
      <FloatingToastLayer
        maxVisible={8}
        toasts={[
          { id: 1, text: '골드', tone: 'gold' },
          { id: 2, text: '강조', tone: 'accent' },
          { id: 3, text: '위험', tone: 'danger' },
          { id: 4, text: '길드', tone: 'guild' },
          { id: 5, text: '영웅', tone: 'epic' },
          { id: 6, text: '네임드', tone: 'named' },
          { id: 7, text: '돌연변이', tone: 'mutation' },
          { id: 8, text: '중립', tone: 'neutral' },
        ]}
        onDismiss={onDismiss}
      />,
    );
    const statuses = screen.getAllByRole('status');
    expect(statuses[0].className).toContain('border-gold');
    expect(statuses[1].className).toContain('border-accent');
    expect(statuses[2].className).toContain('border-danger');
    expect(statuses[3].className).toContain('border-guild');
    expect(statuses[4].className).toContain('border-epic');
    expect(statuses[5].className).toContain('border-named');
    expect(statuses[6].className).toContain('border-mutation');
    expect(statuses[7].className).toContain('border-line');
  });

  it('PC는 최대 3개, 모바일(maxVisible=2)은 최대 2개까지 표시한다', () => {
    const items = [
      { id: 1, text: '알림 1', tone: 'gold' as const },
      { id: 2, text: '알림 2', tone: 'accent' as const },
      { id: 3, text: '알림 3', tone: 'guild' as const },
      { id: 4, text: '알림 4', tone: 'neutral' as const },
    ];
    const { rerender } = render(<FloatingToastLayer toasts={items} maxVisible={3} onDismiss={vi.fn()} />);
    expect(screen.getAllByRole('status')).toHaveLength(3);

    rerender(<FloatingToastLayer toasts={items} maxVisible={2} onDismiss={vi.fn()} />);
    expect(screen.getAllByRole('status')).toHaveLength(2);
  });

  it('스테이지 창(layer="stage") 위에서도 닫기 버튼을 클릭할 수 있고 컨테이너는 스테이지 내 absolute + pointer-events-none을 유지한다', () => {
    const onDismiss = vi.fn();
    render(
      <>
        <Modal layer="stage" onClose={vi.fn()}>내용</Modal>
        <FloatingToastLayer
          toasts={[{ id: 7, text: '요청이 거부됐어요.', tone: 'danger' }]}
          onDismiss={onDismiss}
        />
      </>,
    );
    const toast = screen.getByRole('status');
    expect(toast.parentElement?.className).toContain('pointer-events-none');
    expect(toast.parentElement?.className).toContain('absolute');
    expect(toast.parentElement?.className).toContain('z-(--z-toast)');
    expect(toast.parentElement?.className).not.toMatch(/(?:^|\s)fixed(?:\s|$)/);
    fireEvent.click(screen.getByRole('button', { name: '알림 닫기' }));
    expect(onDismiss).toHaveBeenCalledWith(7);
  });
});

describe('useMessageLog — 시스템 로그 정본 +α 미러링 라우터', () => {
  it('비정형 setToast는 창이 열려 있을 때만 PC 최대 3개까지 토스트로 쌓고, 닫혀 있으면 메시지 기록만 남긴다', () => {
    const { result: closedHook } = renderHook(() => useMessageLog([]));
    act(() => {
      closedHook.current.setToast('닫힌 상태 알림', 'info');
    });
    expect(closedHook.current.log).toHaveLength(1);
    expect(closedHook.current.toasts).toHaveLength(0);

    render(<WindowMarker />);
    const { result: openHook } = renderHook(() => useMessageLog([]));
    act(() => {
      openHook.current.setToast('열린 상태 알림 1', 'gold');
      openHook.current.setToast('열린 상태 알림 2', 'gold');
      openHook.current.setToast('열린 상태 알림 3', 'gold');
      openHook.current.setToast('열린 상태 알림 4', 'gold');
    });
    expect(openHook.current.log).toHaveLength(4);
    expect(openHook.current.toasts.map(t => t.text)).toEqual([
      '열린 상태 알림 4',
      '열린 상태 알림 3',
      '열린 상태 알림 2',
    ]);
  });

  it('Tier A는 모달이 닫혀도 토스트로 미러링되고, Tier C는 모달이 열려도 시스템 로그에만 남는다', () => {
    const { result } = renderHook(() => useMessageLog([]));
    act(() => {
      sendNotice(result.current.setToast, {
        kind: 'catch.legendaryOrFirstVariant',
        text: '전설 등급 [백상아리] 획득!',
        toastText: '전설 [백상아리] 획득!',
      });
    });
    expect(result.current.log).toHaveLength(1);
    expect(result.current.toasts.map(t => t.text)).toEqual(['전설 [백상아리] 획득!']);

    render(<WindowMarker />);
    act(() => {
      sendNotice(result.current.setToast, {
        kind: 'catch.routine',
        text: '[방치] 일반 등급 [붕어] 획득!',
      });
      sendNotice(result.current.setToast, {
        kind: 'facility.fishSold',
        text: '물고기를 팔아 100G를 벌었어요!',
        logTone: 'gold',
      });
    });
    expect(result.current.log).toHaveLength(3);
    expect(result.current.toasts).toHaveLength(1);
  });

  it('replaceKey 병합과 마이크로 배치(achievement.unlockable 150ms)를 수행한다', () => {
    vi.useFakeTimers();
    render(<WindowMarker />);
    const { result } = renderHook(() => useMessageLog([]));

    act(() => {
      sendNotice(result.current.setToast, {
        kind: 'facility.rodUpgraded',
        text: '낚싯대를 강화했어요! Lv.2',
        toastText: '낚싯대 Lv.2 강화 완료!',
        replaceKey: 'rod-upgrade',
      });
      sendNotice(result.current.setToast, {
        kind: 'facility.rodUpgraded',
        text: '낚싯대를 강화했어요! Lv.3',
        toastText: '낚싯대 Lv.3 강화 완료!',
        replaceKey: 'rod-upgrade',
      });
    });
    expect(result.current.log).toHaveLength(2);
    expect(result.current.toasts.map(t => t.text)).toEqual(['낚싯대 Lv.3 강화 완료!']);

    act(() => {
      sendNotice(result.current.setToast, {
        kind: 'achievement.unlockable',
        text: '“업적 A” 업적을 받을 수 있어요.',
        toastText: '업적 "업적 A" 달성 가능!',
      });
      sendNotice(result.current.setToast, {
        kind: 'achievement.unlockable',
        text: '“업적 B” 업적을 받을 수 있어요.',
        toastText: '업적 “업적 B” 보상 도착!',
      });
    });
    // 150ms 배치 창 완료 전에는 대기 중
    expect(result.current.log).toHaveLength(4);
    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current.toasts.map(t => t.text)).toEqual(['업적 보상 2개 도착!', '낚싯대 Lv.3 강화 완료!']);
  });

  it('로딩 중 보류된 Tier A 알림은 로딩 해제 시 노출되고, 차단 모달 시에는 억제·초기화된다', () => {
    const { result } = renderHook(() => useMessageLog([]));
    act(() => {
      result.current.setMirrorEnv({ loading: true });
      sendNotice(result.current.setToast, {
        kind: 'achievement.unlockable',
        text: '2개 업적을 받을 수 있어요.',
        toastText: '업적 보상 2개 도착!',
      });
    });
    expect(result.current.log).toHaveLength(1);
    expect(result.current.toasts).toHaveLength(0);

    vi.useFakeTimers();
    act(() => {
      result.current.setMirrorEnv({ loading: false });
      vi.advanceTimersByTime(150);
    });
    expect(result.current.toasts.map(t => t.text)).toEqual(['업적 보상 2개 도착!']);

    act(() => {
      result.current.setMirrorEnv({ blocked: true });
      sendNotice(result.current.setToast, {
        kind: 'mail.unreadOnLogin',
        text: '받지 않은 우편이 있어요.',
      });
    });
    expect(result.current.log).toHaveLength(2);
    expect(result.current.toasts).toHaveLength(0);
  });

  it('주요 알림 플로팅 토스트 설정을 끄면 +α 미러링은 꺼지고 시스템 로그와 모달 내 거부는 유지된다', () => {
    setToastEnabled(false);
    const { result } = renderHook(() => useMessageLog([]));
    act(() => {
      sendNotice(result.current.setToast, {
        kind: 'mail.unreadOnLogin',
        text: '받지 않은 우편이 있어요.',
      });
    });
    expect(result.current.log).toHaveLength(1);
    expect(result.current.toasts).toHaveLength(0);

    render(<WindowMarker />);
    act(() => {
      sendNotice(result.current.setToast, {
        kind: 'system.modalRejected',
        text: '골드가 모자라요.',
      });
    });
    expect(result.current.log).toHaveLength(2);
    expect(result.current.toasts.map(t => t.text)).toEqual(['골드가 모자라요.']);
  });

  it('away.summary는 hasCard=true일 때 MessageLog에는 무조건 기록하되 플로팅 토스트는 동기 억제하고, 모달이 열렸을 때만 미러링한다', () => {
    const { result } = renderHook(() => useMessageLog([]));
    act(() => {
      sendNotice(result.current.setToast, {
        kind: 'away.summary',
        text: '5분 동안 3마리를 잡았어요.',
        toastText: '귀환 정산 3마리 포획',
        suppressIfAwayCardVisible: true,
      });
    });
    expect(result.current.log).toHaveLength(1);
    expect(result.current.log[0].text).toBe('5분 동안 3마리를 잡았어요.');
    expect(result.current.toasts).toHaveLength(0);

    render(<WindowMarker />);
    act(() => {
      sendNotice(result.current.setToast, {
        kind: 'away.summary',
        text: '10분 동안 6마리를 잡았어요.',
        toastText: '귀환 정산 6마리 포획',
        suppressIfAwayCardVisible: true,
      });
    });
    expect(result.current.log).toHaveLength(2);
    expect(result.current.toasts.map(t => t.text)).toEqual(['귀환 정산 6마리 포획']);
  });
});
