// 업데이트 소식 본문 — 여러 버전은 최신 순으로 버전 머리와 핵심/일반 요약 묶음을 이어 보이고, 한 버전은 머리와 목록을 보인다.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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

  it('important가 없으면 핵심 변경 섹션을 그리지 않고 일반 변경만 보인다', () => {
    render(<NewsStep news={[note('0.2.0', '일반 항목만 있어요.')]} />);
    expect(screen.queryByText('핵심 변경')).not.toBeInTheDocument();
    expect(screen.getByText('그 밖의 변경 요약')).toBeInTheDocument();
    expect(screen.getByText('1건')).toBeInTheDocument();
    expect(screen.getByText('일반 항목만 있어요.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('important 항목을 상단 핵심 변경으로 분리하고, compact 요약 클릭 시 상세 본문을 펼치고 접는다', () => {
    const layered: PatchNote = {
      version: '0.3.0',
      date: '2026-11-25',
      summary: '핵심 개편 요약',
      notes: [
        { tag: '기능', compact: '출항 전용 연결 창 분리', text: '포구 출항 시 게스트 연결 전용 창이 열리고 완료 후 바로 출항해요.', important: true },
        { tag: 'UI', compact: '상세 창 설명 우선 순서 통일', text: '아이템과 유물 상세 창에서 로어 설명을 먼저 보이도록 정리했어요.' },
        { tag: '수정', compact: '중복 없는 요약', text: '중복 없는 요약' },
      ],
    };

    render(<NewsStep news={[layered]} />);

    expect(screen.getByText('핵심 변경')).toBeInTheDocument();
    expect(screen.getByText('그 밖의 변경 요약')).toBeInTheDocument();
    expect(screen.getByText('1건')).toBeInTheDocument();
    expect(screen.getByText('2건')).toBeInTheDocument();

    // compact가 있는 항목은 처음에 접혀 있고, 핵심 변경이 그 밖의 변경 요약보다 먼저 나온다
    const importantBtn = screen.getByRole('button', { name: /출항 전용 연결 창 분리/ });
    const regularBtn = screen.getByRole('button', { name: /상세 창 설명 우선 순서 통일/ });
    expect(importantBtn).toHaveAttribute('aria-expanded', 'false');
    expect(regularBtn).toHaveAttribute('aria-expanded', 'false');
    expect(importantBtn.compareDocumentPosition(regularBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(screen.queryByText('포구 출항 시 게스트 연결 전용 창이 열리고 완료 후 바로 출항해요.')).not.toBeInTheDocument();
    expect(screen.queryByText('아이템과 유물 상세 창에서 로어 설명을 먼저 보이도록 정리했어요.')).not.toBeInTheDocument();

    // compact와 text가 같은 항목은 토글 버튼 없이 한 번만 보인다
    expect(screen.getAllByText('중복 없는 요약')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /중복 없는 요약/ })).not.toBeInTheDocument();

    // 클릭으로 상세 펼침 → 재클릭으로 접힘
    fireEvent.click(importantBtn);
    expect(importantBtn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('포구 출항 시 게스트 연결 전용 창이 열리고 완료 후 바로 출항해요.')).toBeInTheDocument();

    fireEvent.click(regularBtn);
    expect(regularBtn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('아이템과 유물 상세 창에서 로어 설명을 먼저 보이도록 정리했어요.')).toBeInTheDocument();

    fireEvent.click(importantBtn);
    expect(importantBtn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('포구 출항 시 게스트 연결 전용 창이 열리고 완료 후 바로 출항해요.')).not.toBeInTheDocument();
  });
});
