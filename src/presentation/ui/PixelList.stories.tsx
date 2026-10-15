// 목록 스토리.
import type { Meta, StoryObj } from '@storybook/react';
import PixelList from './PixelList';

const meta: Meta<typeof PixelList> = {
  title: 'UI/PixelList',
  component: PixelList,
};

export default meta;
type Story = StoryObj<typeof PixelList>;

export const Default: Story = {
  render: () => (
    <PixelList>
      <li><b>방치</b>로 낚을 때는 희귀한 어종이 잘 걸리지 않는다.</li>
      <li>판매는 <b>집 궤짝</b>·항구 어시장에서.</li>
    </PixelList>
  ),
};
