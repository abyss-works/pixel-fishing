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
  it('통합 헤더 카드, 로어, 단일 곱연산 배수 요약을 보이고 중복 지수·안내 3줄·하단 버튼 없이 닫기 X로만 닫힌다', () => {
    const onClose = vi.fn();
    render(<FortuneModal fortune={sample('fish', 5)} onClose={onClose} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '오늘의 운세' })).toBeInTheDocument();
    expect(screen.getByText('만선 풍어운')).toBeInTheDocument();
    expect(screen.getByLabelText('강도 좋은 운')).toBeInTheDocument();
    expect(screen.getByText('좋은 운')).toBeInTheDocument();
    expect(screen.getByText('×1.10')).toBeInTheDocument();

    expect(within(dialog).queryByText(/지수|1등급|2등급|3등급|65%|25%|10%/)).toBeNull();
    expect(within(dialog).queryByText(/^[35]$/)).toBeNull();
    expect(within(dialog).queryByText(/%p/i)).toBeNull();
    expect(within(dialog).queryByRole('button', { name: '확인' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: '운세 달력 보기' })).toBeNull();

    expect(screen.getAllByText('희귀').some(el => el.getAttribute('data-rarity') === 'rare')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('그림자 운과 오색 물빛 운에서 전용 색상과 강도, 배수를 표시하고 변이 단축어를 쓰지 않는다', () => {
    const { rerender } = render(<FortuneModal fortune={sample('shadow', 3)} onClose={vi.fn()} />);

    expect(screen.getByText('얕은 그림자 운')).toHaveClass('text-named');
    expect(screen.getByLabelText('강도 적당한 운')).toBeInTheDocument();
    expect(screen.getByText('×1.05')).toBeInTheDocument();
    expect(within(screen.getByLabelText('오늘의 행운 효과')).getByText('네임드')).toHaveClass('text-named');

    rerender(<FortuneModal fortune={sample('mutation', 5)} onClose={vi.fn()} />);
    expect(screen.getByText('오색 물빛 운')).toHaveClass('text-mutation');
    expect(screen.getByText('×1.10')).toBeInTheDocument();
    expect(within(screen.getByLabelText('오늘의 행운 효과')).getByText('돌연변이')).toHaveClass('text-mutation');
    expect(screen.getByRole('dialog').textContent!.replace(/돌연변이/g, '')).not.toContain('변이');
  });

  it('복합 대길(신기루 운 2효과, 만선 대길 3효과)은 대상별 배수 여러 행을 나열한다', () => {
    const { rerender } = render(<FortuneModal fortune={sample('mirage', 5)} onClose={vi.fn()} />);

    expect(screen.getByText('신기루 운')).toHaveClass('text-mutation');
    const mirageBox = screen.getByLabelText('오늘의 행운 효과');
    expect(within(mirageBox).getByText('전설')).toHaveAttribute('data-rarity', 'legendary');
    expect(within(mirageBox).getByText('돌연변이')).toHaveClass('text-mutation');
    expect(within(mirageBox).getAllByText('×1.08')).toHaveLength(2);
    expect(within(mirageBox).queryByText('적용 대상')).toBeNull();

    rerender(<FortuneModal fortune={sample('grand-catch', 5)} onClose={vi.fn()} />);
    expect(screen.getByText('만선 대길')).toHaveClass('text-gold');
    const grandBox = screen.getByLabelText('오늘의 행운 효과');
    expect(within(grandBox).getByText('희귀')).toHaveAttribute('data-rarity', 'rare');
    expect(within(grandBox).getByText('판매가')).toBeInTheDocument();
    expect(within(grandBox).getByText('네임드')).toHaveClass('text-named');
    expect(within(grandBox).getAllByText('×1.10')).toHaveLength(3);
  });
});
