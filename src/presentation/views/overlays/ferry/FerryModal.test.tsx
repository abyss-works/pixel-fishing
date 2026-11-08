import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { newState } from '../../../../game/rules/logic';
import FerryModal from './FerryModal';

afterEach(cleanup);

describe('여객선 빠른 이동 창', () => {
  it('지금 있는 항구를 뺀 항구를 바다 이름과 함께 늘어놓는다', () => {
    render(<FerryModal game={{ ...newState(), boat: 9 }} from="manila" onPick={() => {}} onClose={() => {}} />);
    expect(screen.getAllByRole('button', { name: /항$/ }).map(b => b.getAttribute('aria-label')))
      .toEqual(['부산항', '콜롬보항', '투아마시나항', '월비스베이항']);
    expect(screen.getByRole('button', { name: '부산항' })).toHaveTextContent('태평양');
    expect(screen.queryByRole('button', { name: '마닐라항' })).toBeNull();
  });

  it('배가 모자란 항구는 필요한 배를 보이고 고를 수 없다', () => {
    const onPick = vi.fn();
    render(<FerryModal game={{ ...newState(), boat: 3 }} from="harbor" onPick={onPick} onClose={() => {}} />);
    const colombo = screen.getByRole('button', { name: '콜롬보항' });
    expect(colombo).toBeDisabled();
    expect(colombo).toHaveTextContent('증기선(5단계) 필요');
    fireEvent.click(colombo);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('갈 수 있는 항구를 누르면 그 항구를 알린다', () => {
    const onPick = vi.fn();
    render(<FerryModal game={{ ...newState(), boat: 3 }} from="harbor" onPick={onPick} onClose={() => {}} />);
    const manila = screen.getByRole('button', { name: '마닐라항' });
    expect(manila).toBeEnabled();
    expect(manila).not.toHaveTextContent('필요');
    fireEvent.click(manila);
    expect(onPick).toHaveBeenCalledWith('manila');
  });
});
