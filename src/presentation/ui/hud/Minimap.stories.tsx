// 미니맵 스토리 — 자기 캔버스를 소유하고 변경 시에만 그린다.
import type { Meta, StoryObj } from '@storybook/react';
import Minimap from './Minimap';
import { REGION_PACKS } from '../../../game/world';
import { setPlayerPos } from '../../../game/world/currentSpot';

const meta: Meta<typeof Minimap> = {
  title: 'Overlays/Minimap',
  component: Minimap,
};

export default meta;
type Story = StoryObj<typeof Minimap>;

const def = REGION_PACKS.world;
setPlayerPos({ x: def.spawn.x, y: def.spawn.y });

export const World: Story = {
  args: { def, boat: 1, covered: false },
};

export const Covered: Story = {
  args: { def, boat: 1, covered: true },
};
