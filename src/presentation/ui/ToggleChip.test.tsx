import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ToggleChip from './ToggleChip';

describe('토글 칩', () => {
  afterEach(cleanup);

  it('켜짐 여부를 aria-pressed로 알리고 누르면 onClick을 부른다', () => {
    const onClick = vi.fn();
    render(<ToggleChip pressed onClick={onClick}>채팅</ToggleChip>);
    const chip = screen.getByRole('button', { name: '채팅', pressed: true });
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalled();
  });

  it('강조를 세 단계로 나눈다 — 골드는 완전 강조에만 쓴다', () => {
    render(<>
      <ToggleChip pressed emphasis>가</ToggleChip>
      <ToggleChip pressed>나</ToggleChip>
      <ToggleChip pressed={false}>다</ToggleChip>
      <ToggleChip pressed={false} disabled>라</ToggleChip>
    </>);
    const chip = (name: string) => screen.getByRole('button', { name });
    expect(chip('가')).toHaveClass('border-gold', 'text-gold');
    expect(chip('나')).toHaveClass('border-line', 'text-text');
    expect(chip('나')).not.toHaveClass('text-gold');
    expect(chip('다')).toHaveClass('border-transparent', 'text-text-dim');
    expect(chip('라')).toBeDisabled();
    expect(chip('라')).toHaveAttribute('data-tier', 'off-disabled');
  });
});
