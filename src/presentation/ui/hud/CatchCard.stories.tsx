// 획득 카드 — 게임 프레임 가운데에 뜨는 등급색 노치 카드. 변이 문구와 월척 줄은 해당할 때만 그린다.
import type { Meta, StoryObj } from '@storybook/react';
import { FISH } from '../../../game/content/fish';
import CatchCard from './CatchCard';

const fish = (id: string) => FISH.find(f => f.id === id)!;

const meta: Meta<typeof CatchCard> = {
  title: 'Stage/CatchCard',
  component: CatchCard,
  parameters: { layout: 'fullscreen', stage: { frame: true } },
};
export default meta;
type Story = StoryObj<typeof CatchCard>;

/** 일반 획득 — 이름, 크기, 판매가만 */
export const Normal: Story = {
  args: { fish: fish('seabream'), info: { size: 48.2, form: 'normal', percentile: 42, isBig: false, isNew: false } },
};

/** 변이 — 이름이 빛나고 낮춰 말하는 한 줄이 붙는다 */
export const Variant: Story = {
  args: { fish: fish('tuna'), info: { size: 182.4, form: 'variant', percentile: 30, isBig: false, isNew: false } },
};

/** 월척 — 골드 왕관 줄 */
export const BigCatch: Story = {
  args: { fish: fish('sailfish'), info: { size: 312.4, form: 'normal', percentile: 3, isBig: true, isNew: false } },
};

/** 새 어종이면서 월척 — 왼쪽 위 NEW 꼬리표 */
export const NewAndBig: Story = {
  args: { fish: fish('sailfish'), info: { size: 312.4, form: 'normal', percentile: 3, isBig: true, isNew: true } },
};
