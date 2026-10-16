// 장비 스프라이트 스토리 — 프리셋별 크기.
import type { Meta, StoryObj } from '@storybook/react';
import GearSprite from './GearSprite';

const meta: Meta<typeof GearSprite> = { title: 'UI/GearSprite', component: GearSprite };
export default meta;
type Story = StoryObj<typeof GearSprite>;

export const Hero: Story = { args: { kind: 'rod', preset: 'hero', ariaLabel: '낚싯대' } };
export const Row: Story = { args: { kind: 'rod', preset: 'row', ariaLabel: '낚싯대' } };
