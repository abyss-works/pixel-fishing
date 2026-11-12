// 탭 바 — 잠긴 탭은 자리를 그대로 두고 눌러도 열리지 않으며, 키보드 포커스와 보조 기술에 잠김을 알린다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TabBar from './TabBar';

afterEach(cleanup);

const tabs = [
  { key: 'sell', label: '판매' },
  { key: 'energy', label: '기운 얻기', lock: ['인도양 항로가 열리면 기운 얻기를 할 수 있어요.', '인도양 항로는 증기선(5단계)부터 열려요.'] },
] as const;

describe('TabBar 잠긴 탭', () => {
  it('잠기지 않은 탭은 누르면 선택한다', () => {
    const onSelect = vi.fn();
    render(<TabBar tabs={[...tabs]} activeKey="sell" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: '판매' }));
    expect(onSelect).toHaveBeenCalledWith('sell');
  });

  it('잠긴 탭은 눌러도 선택하지 않는다', () => {
    const onSelect = vi.fn();
    render(<TabBar tabs={[...tabs]} activeKey="sell" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /기운 얻기/ }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('잠긴 탭은 자물쇠를 붙이고 비활성이 아니라 aria-disabled로 포커스를 받는다', () => {
    const { container } = render(<TabBar tabs={[...tabs]} activeKey="sell" onSelect={() => {}} />);
    const locked = screen.getByRole('button', { name: /기운 얻기/ });
    expect(locked).toHaveAttribute('aria-disabled', 'true');
    expect(locked).not.toBeDisabled();
    expect(locked.querySelector('[data-glyph="lock"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-glyph="lock"]')).toHaveLength(1);
  });

  it('잠금 줄을 보조 기술에 설명으로 알린다', () => {
    render(<TabBar tabs={[...tabs]} activeKey="sell" onSelect={() => {}} />);
    const locked = screen.getByRole('button', { name: /기운 얻기/ });
    const reason = document.getElementById(locked.getAttribute('aria-describedby')!);
    expect(reason).toHaveTextContent('인도양 항로가 열리면 기운 얻기를 할 수 있어요. 인도양 항로는 증기선(5단계)부터 열려요.');
  });

  it('마우스를 올리거나 포커스하면 잠금 줄이 공용 툴팁으로 열린다', () => {
    render(<TabBar tabs={[...tabs]} activeKey="sell" onSelect={() => {}} />);
    const locked = screen.getByRole('button', { name: /기운 얻기/ });
    fireEvent.mouseEnter(locked.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('인도양 항로는 증기선(5단계)부터 열려요.');
    fireEvent.mouseLeave(locked.parentElement!);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(locked.parentElement!);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('잠금 줄이 비어 있으면 잠긴 탭이 아니다', () => {
    const onSelect = vi.fn();
    render(<TabBar tabs={[{ key: 'a', label: '가', lock: [] }]} activeKey={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: '가' }));
    expect(onSelect).toHaveBeenCalledWith('a');
  });
});
