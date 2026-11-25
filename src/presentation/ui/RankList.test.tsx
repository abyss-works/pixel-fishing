import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import ProgressCount from './ProgressCount';
import RankList, { RankMeBar } from './RankList';

afterEach(cleanup);

describe('RankList(공용 랭킹 표)', () => {
  it('모든 행과 내 줄, 하단 고정 내 순위 바의 오른쪽 수치에 골드 강조(ProgressCount)를 적용한다', () => {
    const rows = [
      { rank: 1, nickname: '가', value: 1200, me: false },
      { rank: 2, nickname: '나', value: 900, me: true },
      { rank: 4, nickname: '라', value: 300, me: false },
    ];
    render(
      <div>
        <RankList embedded rows={rows} me={null} valueLabel="명성" format={v => v.toLocaleString('ko-KR')} />
        <RankMeBar me={{ rank: 15, value: 100 }} format={v => <ProgressCount current={v} target={200} percent={50} />} />
      </div>,
    );

    const table = screen.getByRole('table');
    const myRow = within(table).getByText('나').closest('tr')!;
    expect(myRow).toHaveAttribute('aria-current', 'true');
    expect(myRow).toHaveAttribute('data-me', 'true');
    expect(myRow).toHaveAttribute('data-rank', '2');
    const myValueCell = within(myRow).getAllByRole('cell')[2];
    expect(myValueCell.querySelector('[data-progress-count]')).toHaveAttribute('data-tone', 'gold');

    const mine = screen.getByLabelText('내 순위');
    expect(mine).toHaveAttribute('data-me', 'true');
    expect(mine).toHaveAttribute('data-rank', '15');
    expect(mine.querySelector('[data-progress-count]')).toHaveAttribute('data-tone', 'gold');
    expect(mine.querySelector('[data-progress-current]')?.textContent).toBe('100');
    expect(mine.querySelector('[data-progress-target]')?.textContent).toBe(' / 200');
    expect(mine.querySelector('[data-progress-percent]')?.textContent).toBe('(50%)');
  });
});
