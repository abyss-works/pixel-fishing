// 제목 달린 칸 스토리 — 한 칸과, 같은 줄 높이를 맞추는 2열 배치.
import type { Meta, StoryObj } from '@storybook/react';
import TitledCell from './TitledCell';
import Inset from './Inset';
import KeyValueRow from './KeyValueRow';

const meta: Meta<typeof TitledCell> = { title: 'UI/TitledCell', component: TitledCell };
export default meta;
type Story = StoryObj<typeof TitledCell>;

export const Default: Story = {
  args: {
    title: '기록',
    children: (
      <Inset divided className="flex-1">
        <KeyValueRow label="가격" value="120G" />
        <KeyValueRow label="잡은 수" value="3마리" />
      </Inset>
    ),
  },
};

export const TwoColumns: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-x-5 gap-y-4">
      <TitledCell title="짧은 칸">
        <Inset className="flex-1 p-3 text-sm">한 줄</Inset>
      </TitledCell>
      <TitledCell title="긴 칸">
        <Inset className="flex-1 p-3 text-sm">같은 줄의 칸은 높이를 맞추고, 안쪽 칸이 남은 높이를 채워요.<br />둘째 줄<br />셋째 줄</Inset>
      </TitledCell>
    </div>
  ),
};
