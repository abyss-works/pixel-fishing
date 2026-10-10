// 어종 스프라이트 스토리 — 프리셋·폼·실루엣.
import type { Meta, StoryObj } from '@storybook/react';
import FishSprite from './FishSprite';
import { FISH } from '../data/fish';

const meta: Meta<typeof FishSprite> = {
  title: 'UI/FishSprite',
  component: FishSprite,
};

export default meta;
type Story = StoryObj<typeof FishSprite>;

const crucian = FISH[0];
const goldcarp = FISH.find(f => f.id === 'goldcarp') ?? FISH[0];

export const Thumb: Story = {
  args: { fish: crucian, preset: 'thumb' },
};

export const Icon: Story = {
  args: { fish: crucian, preset: 'icon' },
};

export const Portrait: Story = {
  args: { fish: goldcarp, preset: 'portrait' },
};

export const Variant: Story = {
  args: { fish: crucian, preset: 'icon', form: 'variant' },
};

export const Silhouette: Story = {
  args: { fish: crucian, preset: 'icon', discovered: false, ariaLabel: '미확인 어종' },
};
