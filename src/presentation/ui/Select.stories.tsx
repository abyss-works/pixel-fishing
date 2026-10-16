// 선택 상자 스토리 — 기본 / 표 셀용(compact).
import type { Meta, StoryObj } from '@storybook/react';
import Select from './Select';

const meta: Meta<typeof Select> = { title: 'UI/Select', component: Select };
export default meta;
type Story = StoryObj<typeof Select>;

const options = [<option key="a">조각배</option>, <option key="b">돛단배</option>];
export const Default: Story = { args: { children: options } };
export const Compact: Story = { args: { compact: true, children: options } };
