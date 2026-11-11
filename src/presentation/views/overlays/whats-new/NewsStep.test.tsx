// 업데이트 소식 본문 — 여러 버전은 최신 순으로 버전 머리와 범주 묶음을 이어 보이고, 한 버전은 머리와 목록을 보인다.
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PatchNote } from '../../../../game/content/patchnotes';
import NewsStep from './NewsStep';

const note = (version: string, text: string): PatchNote => ({
  version, date: '2026-11-01', summary: `${version} 요약`, notes: [{ tag: '기능', text }],
});

describe('업데이트 소식 본문', () => {
  afterEach(cleanup);

  it('여러 버전은 받은 순서대로 버전마다 머리와 항목을 보인다', () => {
    render(<NewsStep news={[note('0.2.0', '둘째 항목'), note('0.1.0', '첫째 항목')]} />);
    const sections = screen.getAllByRole('region');
    expect(sections.map(s => s.getAttribute('aria-label'))).toEqual(['v0.2.0', 'v0.1.0']);
    expect(within(sections[0]).getByText('v0.2.0')).toBeInTheDocument();
    expect(within(sections[0]).getByText('둘째 항목')).toBeInTheDocument();
    expect(within(sections[1]).getByText('0.1.0 요약')).toBeInTheDocument();
    expect(within(sections[1]).getByText('첫째 항목')).toBeInTheDocument();
  });

  it('한 버전은 머리와 항목을 보인다', () => {
    render(<NewsStep news={[note('0.1.0', '첫째 항목')]} />);
    expect(screen.getByText('v0.1.0')).toBeInTheDocument();
    expect(screen.getByText('첫째 항목')).toBeInTheDocument();
  });
});
