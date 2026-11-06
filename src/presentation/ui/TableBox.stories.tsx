// 표 칸 스토리 — 좁은 칸에서 표만 가로로 스크롤한다.
import type { Meta, StoryObj } from '@storybook/react';
import DataTable from './DataTable';
import TableBox from './TableBox';

const meta: Meta<typeof TableBox> = {
  title: 'UI/TableBox',
  component: TableBox,
};

export default meta;
type Story = StoryObj<typeof TableBox>;

export const Narrow: Story = {
  render: () => (
    <TableBox className="w-[260px] h-40 px-3 pb-2">
      <DataTable cols={[null, '4rem', '5rem']} nameMin="8rem">
        <thead><tr className="sticky top-0 text-2xs text-text-dim"><th className="text-left font-normal">이름</th><th>오늘</th><th>누적</th></tr></thead>
        <tbody>
          <tr><td className="truncate">붕어낚시꾼</td><td>12</td><td>340</td></tr>
          <tr><td className="truncate">바다의 주인</td><td>0</td><td>8</td></tr>
        </tbody>
      </DataTable>
    </TableBox>
  ),
};
