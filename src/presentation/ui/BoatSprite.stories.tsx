// 배 스프라이트 스토리 — 단계·프리셋.
import type { Meta, StoryObj } from '@storybook/react';
import BoatSprite from './BoatSprite';

const meta: Meta<typeof BoatSprite> = { title: 'UI/BoatSprite', component: BoatSprite };
export default meta;
type Story = StoryObj<typeof BoatSprite>;

export const Hero: Story = { args: { tier: 7, preset: 'hero', ariaLabel: '원양어선' } };
export const Row: Story = { args: { tier: 1, preset: 'row', ariaLabel: '조각배' } };
