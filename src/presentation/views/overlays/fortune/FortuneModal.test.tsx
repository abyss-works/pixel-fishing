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
  it('통합 헤더 카드, 로어 2문장, 곱연산 배수 요약을 보이고 중복 지수·안내 3줄·하단 버튼 없이 닫기 X로만 닫힌다', () => {
    const onClose = vi.fn();
    render(<FortuneModal fortune={sample('fish', 5)} onClose={onClose} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '오늘의 운세' })).toBeInTheDocument();
    expect(screen.getByText('풍어운')).toBeInTheDocument();
    expect(screen.getByLabelText('강도 좋은 운')).toBeInTheDocument();
    expect(screen.getByText('좋은 운')).toBeInTheDocument();
    expect(screen.getByText('×1.05')).toBeInTheDocument();

    // 지수 단어, 중복 숫자, %p, 중복 안내문 3줄, 하단 확인/운세 달력 보기 버튼 제거 확인
    expect(within(dialog).queryByText(/지수/)).toBeNull();
    expect(within(dialog).queryByText(/^[35]$/)).toBeNull();
    expect(within(dialog).queryByText(/%p/i)).toBeNull();
    expect(within(dialog).queryByText(/새 운세는 하루마다 새로 뽑혀요/)).toBeNull();
    expect(within(dialog).queryByText(/메뉴의 운세 항목에서/)).toBeNull();
    expect(within(dialog).queryByText(/행운 효과가 \+/)).toBeNull();
    expect(within(dialog).queryByRole('button', { name: '확인' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: '운세 달력 보기' })).toBeNull();

    // 희귀 낱말은 등급색 강조 요소로 그려진다
    expect(screen.getAllByText('희귀').some(el => el.getAttribute('data-rarity') === 'rare')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('그림자 운에서는 네임드 강조와 강도 적당한 운, ×1.03 배수를 표시한다', () => {
    render(<FortuneModal fortune={sample('shadow', 3)} onClose={vi.fn()} />);

    expect(screen.getByText('그림자 운')).toBeInTheDocument();
    expect(screen.getByLabelText('강도 적당한 운')).toBeInTheDocument();
    expect(screen.getByText('×1.03')).toBeInTheDocument();
    expect(within(screen.getByLabelText('오늘의 행운 효과')).getByText('네임드')).toBeInTheDocument();
    expect(screen.queryByText(/지수/)).toBeNull();
    expect(screen.queryByText(/%p/i)).toBeNull();
  });
});
