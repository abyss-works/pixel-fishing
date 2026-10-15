// 등급 표기 스토리 — 4등급 텍스트·점.
import type { Meta, StoryObj } from '@storybook/react';
import { RarityText, RarityDot } from './RarityTag';

const meta: Meta = {
  title: 'UI/RarityTag',
};

export default meta;

export const Text: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-1 text-sm">
      <span><RarityText rarity="common" /></span>
      <span><RarityText rarity="rare" /></span>
      <span><RarityText rarity="epic" /></span>
      <span><RarityText rarity="legendary" /></span>
    </div>
  ),
};

export const Dot: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-1 text-sm text-text-dim">
      <span><RarityDot rarity="common" />미확인</span>
      <span><RarityDot rarity="rare" />미확인</span>
      <span><RarityDot rarity="epic" />미확인</span>
      <span><RarityDot rarity="legendary" />미확인</span>
    </div>
  ),
};
