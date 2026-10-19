// 지표 타일 스토리 — 값 색(tone)과 보조 문구, 여러 장을 한 줄에 놓은 모습.
import type { Meta, StoryObj } from '@storybook/react';
import KpiTile from './KpiTile';

const meta: Meta<typeof KpiTile> = { title: 'UI/KpiTile', component: KpiTile };
export default meta;
type Story = StoryObj<typeof KpiTile>;

export const Default: Story = { args: { label: '등록 유저', value: '128' } };

export const WithHint: Story = { args: { label: '금일 DAU', value: '42', hint: '최근 7일 WAU 97' } };

export const Danger: Story = { args: { label: '제재 계정', value: '3', tone: 'danger' } };

export const Dim: Story = { args: { label: '연타 플래그 유저', value: '0', tone: 'dim' } };

export const Row: Story = {
  render: () => (
    <div className="grid grid-cols-4 gap-2">
      <KpiTile label="잔고 합" value="12.4만" hint="저장된 골드 총합" />
      <KpiTile label="중앙값" value="1,200" />
      <KpiTile label="상위 25% 이상" value="5,800" />
      <KpiTile label="최대" value="3.1만" />
    </div>
  ),
};
