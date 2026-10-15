// 선택 카드 — 미리보기·이름·뱃지·설명. 선택/비선택 두 상태를 나란히 본다.
import type { Meta, StoryObj } from '@storybook/react';
import ChoiceCard from './ChoiceCard';

const meta: Meta<typeof ChoiceCard> = { title: 'UI/ChoiceCard', component: ChoiceCard };
export default meta;
type Story = StoryObj<typeof ChoiceCard>;

const preview = <span className="text-text-dim text-xs">미리보기</span>;

export const Pair: Story = {
  render: () => (
    <div role="radiogroup" className="grid grid-cols-2 gap-2 w-[440px]">
      <ChoiceCard selected onSelect={() => {}} preview={preview} label="v1" sub="legacy" badge="기본"
                  description="지금까지 보던 그림이에요." />
      <ChoiceCard selected={false} onSelect={() => {}} preview={preview} label="v2" sub="beta" badge="실험"
                  description="새로 그린 픽셀 그래픽이에요." />
    </div>
  ),
};
