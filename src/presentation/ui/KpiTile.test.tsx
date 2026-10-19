// 지표 타일 — 이름·값·보조 문구의 표시와 값 색(tone), 값 title을 확인한다.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import KpiTile from './KpiTile';

afterEach(cleanup);

describe('KpiTile', () => {
  it('이름·값·보조 문구를 보이고, 값에 전체 값을 title로 둔다', () => {
    render(<KpiTile label="금일 DAU" value="1.2만" hint="최근 7일 WAU 3만" />);
    expect(screen.getByText('금일 DAU')).toBeInTheDocument();
    expect(screen.getByText('1.2만')).toHaveAttribute('title', '1.2만');
    expect(screen.getByText('최근 7일 WAU 3만')).toBeInTheDocument();
  });

  it('보조 문구가 없으면 그 줄을 만들지 않는다', () => {
    const { container } = render(<KpiTile label="등록 유저" value="3" />);
    expect(container.querySelectorAll('span')).toHaveLength(2);
  });

  it('값 색은 tone을 따른다 — 기본은 골드', () => {
    render(
      <>
        <KpiTile label="기본" value="1" />
        <KpiTile label="경고" value="2" tone="danger" />
        <KpiTile label="없음" value="0" tone="dim" />
      </>,
    );
    expect(screen.getByText('1')).toHaveClass('text-gold');
    expect(screen.getByText('2')).toHaveClass('text-danger');
    expect(screen.getByText('0')).toHaveClass('text-text-dim');
  });
});
