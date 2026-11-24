// 도감 탭 — 1단 보기 서브탭(일반·돌연변이·네임드)과 2단 구역 서브탭 구성을 고정한다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { newState } from '../../../../../game/rules/logic';
import DexTab from './DexTab';

afterEach(cleanup);

describe('DexTab - 2단 서브탭', () => {
  it('1단에 일반·돌연변이·네임드 보기 서브탭, 2단에 구역 서브탭을 둔다', () => {
    const onView = vi.fn();
    const onSub = vi.fn();
    render(<DexTab game={newState()} view="base" onView={onView} sub="village" onSub={onSub} />);

    const baseBtn = screen.getByRole('button', { name: '일반' });
    const variantBtn = screen.getByRole('button', { name: '돌연변이' });
    const namedBtn = screen.getByRole('button', { name: '네임드' });
    expect(baseBtn).toHaveAttribute('aria-pressed', 'true');
    expect(variantBtn).toHaveAttribute('aria-pressed', 'false');
    expect(namedBtn).toHaveAttribute('aria-pressed', 'false');

    const zoneBtn = screen.getByRole('button', { name: /^태평양/ });
    expect(zoneBtn).toBeInTheDocument();

    fireEvent.click(variantBtn);
    expect(onView).toHaveBeenCalledWith('variant');
    fireEvent.click(namedBtn);
    expect(onView).toHaveBeenCalledWith('named');
    fireEvent.click(zoneBtn);
    expect(onSub).toHaveBeenCalledWith('pacific');
  });

  it('네임드 보기에서도 1단 보기 서브탭은 그대로 있고 2단 구역에서 마을만 빠진다', () => {
    render(<DexTab game={newState()} view="named" onView={vi.fn()} sub="village" onSub={vi.fn()} />);
    expect(screen.getByRole('button', { name: '네임드' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '일반' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^마을/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^태평양/ })).toHaveAttribute('aria-pressed', 'true');
  });
});
