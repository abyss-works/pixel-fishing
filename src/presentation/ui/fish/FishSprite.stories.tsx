// 어종 스프라이트 스토리 — 프리셋·폼·실루엣.
import type { Meta, StoryObj } from '@storybook/react';
import FishSprite from './FishSprite';
import { FISH } from '../../../game/content/fish';

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

export const Animated: Story = {
  args: { fish: goldcarp, preset: 'card', animate: true },
};

/** 14형태를 한 화면에 — 형태당 첫 어종을 등급 윤곽과 함께 icon 프리셋으로 */
export const AllShapes: Story = {
  render: () => {
    const firstOfShape = [...new Map(FISH.map(f => [f.shape, f])).values()];
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, max-content)', gap: 12 }}>
        {firstOfShape.map(f => (
          <figure key={f.id} style={{ margin: 0, textAlign: 'center' }}>
            <FishSprite fish={f} preset="icon" animate />
            <figcaption style={{ fontSize: 11 }}>{f.shape} · {f.name}</figcaption>
          </figure>
        ))}
      </div>
    );
  },
};
