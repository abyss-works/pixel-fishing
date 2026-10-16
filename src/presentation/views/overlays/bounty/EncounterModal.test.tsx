// 조우 창 — 들어가며 → 결투(왕복 커서·옮겨 가는 존·체력 7칸·도주 4칸) → 토벌/놓침의 UI 구동.
// 판정 규칙은 순수 로직에서 검증하고, 여기서는 단계 전환·타이머·입력·결과 확정을 본다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import EncounterModal from './EncounterModal';
import { selectEncounter } from '../../../../features/bounty/model/challenge';
import { newState } from '../../../../game/rules/logic';
import { resetKeyScopes } from '../../../ui/hotkeys';

beforeEach(() => { vi.useFakeTimers(); resetKeyScopes(); });
afterEach(() => { cleanup(); vi.useRealTimers(); resetKeyScopes(); });

const show = () => {
  const onResolve = vi.fn();
  const onClose = vi.fn();
  const data = { ...selectEncounter(newState(), 'pacific-named-megalodon')!, sweepMs: 1000 };
  render(<EncounterModal data={data} onResolve={onResolve} onClose={onClose} />);
  return { onResolve, onClose };
};
const enter = () => fireEvent.click(screen.getByRole('button', { name: '조우' }));
const pct = (el: Element | null, prop: 'left' | 'width') => parseFloat((el as HTMLElement).style[prop]);
/** 커서가 존 한가운데 쪽에 올 때까지 시간을 보낸다 — 화면에 그려진 위치로 판단한다 */
const waitForZone = (inside = true) => {
  for (let i = 0; i < 400; i++) {
    const zone = document.querySelector('[data-duel="zone"]');
    const cursor = pct(document.querySelector('[data-duel="cursor"]'), 'left');
    const left = pct(zone, 'left'), width = pct(zone, 'width');
    const center = left + width / 2;
    const inZone = Math.abs(cursor - center) <= width * 0.25;
    const farOut = Math.abs(cursor - center) >= width;
    if (inside ? inZone : farOut) return;
    act(() => { vi.advanceTimersByTime(10); });
  }
  throw new Error('커서가 원하는 자리에 오지 않았다');
};

describe('EncounterModal', () => {
  it('들어가며 — 목격담과 그림자, 이름은 부르지 않는다. 조우를 눌러야 바가 돈다', () => {
    show();
    expect(screen.getByText(/같은 그림자를 보고했다/)).toBeInTheDocument();
    expect(screen.getByText('그림자가 돌아선다.')).toBeInTheDocument();
    expect(screen.queryByText('메갈로돈')).toBeNull();
    expect(screen.queryByRole('button', { name: '챔질!' })).toBeNull();
    enter();
    expect(screen.getByRole('button', { name: '챔질!' })).toBeInTheDocument();
  });

  it('중앙 챔질 7히트면 이름이 드러나고 토벌 버튼이 결과를 보낸다', () => {
    const { onResolve } = show();
    enter();
    const zoneLefts = new Set<number>();
    for (let i = 0; i < 7; i++) {
      zoneLefts.add(pct(document.querySelector('[data-duel="zone"]'), 'left'));
      waitForZone();
      fireEvent.click(screen.getByRole('button', { name: '챔질!' }));
    }
    expect(zoneLefts.size).toBeGreaterThan(1); // 맞힐 때마다 존이 옮겨 갔다
    expect(onResolve).not.toHaveBeenCalled();
    expect(screen.getByText('메갈로돈')).toBeInTheDocument();
    expect(screen.getByText('메갈로돈이 수면 위로 떠올랐다.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '토벌' }));
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith({ hits: 7, misses: 0, success: true });
  });

  it('스페이스바도 챔질이 된다', () => {
    show();
    enter();
    for (let i = 0; i < 7; i++) {
      waitForZone();
      fireEvent.keyDown(document.body, { code: 'Space' });
    }
    expect(screen.getByRole('button', { name: '토벌' })).toBeInTheDocument();
  });

  it('승부 중에는 닫기 X·Esc가 없다 — 도망으로 흔적을 지키지 못한다', () => {
    const { onClose } = show();
    enter();
    expect(screen.queryByRole('button', { name: '닫기' })).toBeNull();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('맞히면 체력이 줄고, 존 밖에서 치면 도주 게이지가 찬다', () => {
    show();
    enter();
    expect(screen.getByLabelText('체력 7/7')).toBeInTheDocument();
    waitForZone();
    fireEvent.click(screen.getByRole('button', { name: '챔질!' }));
    expect(screen.getByLabelText('체력 6/7')).toBeInTheDocument();
    expect(screen.getByText('명중!')).toBeInTheDocument();
    waitForZone(false);
    fireEvent.click(screen.getByRole('button', { name: '챔질!' }));
    expect(screen.getByLabelText('도주 1/4')).toBeInTheDocument();
  });

  it('커서는 끝에서 처음으로 순간이동하지 않고 되돌아온다', () => {
    show();
    enter();
    // 첫 편도는 바 시간 그대로 1000ms
    act(() => { vi.advanceTimersByTime(950); });
    const nearEnd = pct(document.querySelector('[data-duel="cursor"]'), 'left');
    act(() => { vi.advanceTimersByTime(150); });
    const after = pct(document.querySelector('[data-duel="cursor"]'), 'left');
    expect(nearEnd).toBeGreaterThan(80);
    expect(after).toBeGreaterThan(80); // 1100ms — 끝(100%)을 찍고 되돌아오는 중
    expect(after).toBeLessThan(100);
  });

  it('치지 않고 한 번 왕복할 때마다 도주 1칸 — 4칸이 차면 탈락하고 즉시 실패를 보낸다', () => {
    const { onResolve, onClose } = show();
    enter();
    act(() => { vi.advanceTimersByTime(8000); });
    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith({ hits: 0, misses: 4, success: false });
    expect(screen.getByText(/흔적이 사라졌다/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '돌아가기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('닫기 X와 Esc는 같은 출구다', () => {
    const { onClose } = show();
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
