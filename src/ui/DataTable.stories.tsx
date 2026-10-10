// 표 스토리 — 호출부가 thead/tbody 조립.
import type { Meta, StoryObj } from '@storybook/react';
import DataTable from './DataTable';

const meta: Meta<typeof DataTable> = {
  title: 'UI/DataTable',
  component: DataTable,
};

export default meta;
type Story = StoryObj<typeof DataTable>;

export const Default: Story = {
  render: () => (
    <DataTable>
      <thead><tr><th>어종</th><th>가격</th><th>잡은 수</th></tr></thead>
      <tbody>
        <tr><td>붕어</td><td>6G</td><td>12마리</td></tr>
        <tr><td>잉어</td><td>30G</td><td>3마리</td></tr>
      </tbody>
    </DataTable>
  ),
};
