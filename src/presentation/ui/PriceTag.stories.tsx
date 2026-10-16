// 가격 표기 스토리 — 정가 / 할인.
import type { Meta, StoryObj } from '@storybook/react';
import PriceTag from './PriceTag';

const meta: Meta<typeof PriceTag> = { title: 'UI/PriceTag', component: PriceTag };
export default meta;
type Story = StoryObj<typeof PriceTag>;

export const ListPrice: Story = { args: { list: 200, price: 200 } };
export const Discounted: Story = { args: { list: 200, price: 150, size: 'lg' } };
