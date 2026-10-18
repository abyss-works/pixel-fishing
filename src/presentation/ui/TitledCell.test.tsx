// 제목 달린 칸 — 제목 아래에 내용을 두고, 제목은 노드를 받으며, 나머지 속성은 section에 전달한다.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import TitledCell from './TitledCell';

afterEach(cleanup);

describe('TitledCell', () => {
  it('제목(h4) 아래에 내용을 둔다', () => {
    render(<TitledCell title="기록"><p>값</p></TitledCell>);
    expect(screen.getByRole('heading', { level: 4, name: '기록' })).toBeInTheDocument();
    expect(screen.getByText('값')).toBeInTheDocument();
  });

  it('제목에 조작(노드)을 둘 수 있고, aria-labelledby로 칸의 이름을 잇는다', () => {
    render(
      <TitledCell aria-labelledby="cell-title"
                  title={<button type="button"><span id="cell-title">해역</span></button>}>
        내용
      </TitledCell>,
    );
    expect(screen.getByRole('region', { name: '해역' })).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('className을 칸에 더하고, 기본으로 줄어들 수 있는 세로 칸이다', () => {
    render(<TitledCell title="칸" className="xl:col-span-2">내용</TitledCell>);
    const cell = screen.getByText('내용').closest('section')!;
    expect(cell).toHaveClass('min-w-0', 'flex-col', 'xl:col-span-2');
  });
});
