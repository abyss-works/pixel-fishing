// 로어 문단 — 첫 글자 강조는 선택 사항이고 기본은 강조 없이 그린다.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import LoreParagraph from './LoreParagraph';

afterEach(cleanup);

describe('LoreParagraph', () => {
  it('기본은 첫 글자 강조 없이 그린다', () => {
    render(<LoreParagraph>바다는 깊다.</LoreParagraph>);
    expect(screen.getByText('바다는 깊다.').className).not.toContain('first-letter');
  });

  it('emphasis를 켜면 첫 글자를 강조한다', () => {
    render(<LoreParagraph emphasis>바다는 깊다.</LoreParagraph>);
    expect(screen.getByText('바다는 깊다.').className).toContain('first-letter:text-gold');
  });

  it('className은 강조 여부와 상관없이 그대로 붙는다', () => {
    render(<LoreParagraph className="text-xs">문단</LoreParagraph>);
    expect(screen.getByText('문단').className).toContain('text-xs');
  });
});
