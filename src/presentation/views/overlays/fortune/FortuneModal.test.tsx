import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DailyFortune } from '../../../../game/rules/fortune';
import FortuneModal from './FortuneModal';

afterEach(() => cleanup());

const sample = (kind: DailyFortune['kind'], index: DailyFortune['index']): DailyFortune => ({
  day: '2026-11-25',
  kind,
  index,
});

describe('오늘의 운세 팝업 (FortuneModal)', () => {
  it('정본 용어·등급 핍·보너스 대상과 메뉴 달력 안내를 표시하고 확인 시 닫힌다', () => {
    const onClose = vi.fn();
    render(<FortuneModal fortune={sample('fish', 5)} onClose={onClose} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '오늘의 운세' })).toBeInTheDocument();
    expect(screen.getByText('풍어운')).toBeInTheDocument();
    expect(screen.getByLabelText('지수 5, 좋은 운')).toBeInTheDocument();
    expect(screen.getByText('+5%p')).toBeInTheDocument();
    expect(screen.getByText(/메뉴의 운세 항목에서 지난 달력 기록을 볼 수 있어요\./)).toBeInTheDocument();
    // 희귀 낱말은 등급색 강조 요소로 그려진다
    expect(screen.getAllByText('희귀').some(el => el.getAttribute('data-rarity') === 'rare')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('그림자 운에서는 네임드 강조와 지수 3 적당한 운을 표시한다', () => {
    render(<FortuneModal fortune={sample('shadow', 3)} onClose={vi.fn()} />);

    expect(screen.getByText('그림자 운')).toBeInTheDocument();
    expect(screen.getByLabelText('지수 3, 적당한 운')).toBeInTheDocument();
    expect(screen.getByText('+3%p')).toBeInTheDocument();
    expect(within(screen.getByLabelText('오늘의 보너스')).getByText('네임드')).toBeInTheDocument();
    expect(screen.getAllByText('네임드').length).toBeGreaterThanOrEqual(2);
  });
});
