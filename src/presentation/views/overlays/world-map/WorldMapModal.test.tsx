import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import WorldMapModal from './WorldMapModal';

describe('세계지도 창 — 확대·축소 조작', () => {
  afterEach(cleanup);

  it('전체 보기에서 시작하고, 확대·축소·전체 버튼이 배율을 바꾼다', () => {
    render(<WorldMapModal world={false} onClose={() => {}} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByLabelText('축소')).toBeDisabled();

    fireEvent.click(screen.getByLabelText('확대'));
    expect(screen.getByText('125%')).toBeInTheDocument();
    expect(screen.getByLabelText('축소')).toBeEnabled();

    fireEvent.click(screen.getByLabelText('확대'));
    fireEvent.click(screen.getByText('전체'));
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('최대 배율에서는 확대 버튼이 막힌다', () => {
    render(<WorldMapModal world={false} onClose={() => {}} />);
    for (let i = 0; i < 10; i++) fireEvent.click(screen.getByLabelText('확대'));
    expect(screen.getByText('400%')).toBeInTheDocument();
    expect(screen.getByLabelText('확대')).toBeDisabled();
  });
});
