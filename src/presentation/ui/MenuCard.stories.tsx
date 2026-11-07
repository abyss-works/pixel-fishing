// 메뉴 영역 카드 스토리 — 이름 붙은 size 컨테이너 안에서 폭·높이에 따라 크기와 생략 글자가 바뀐다.
import type { ReactElement } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import MenuCard from './MenuCard';

const meta: Meta<typeof MenuCard> = {
  title: 'UI/MenuCard',
  component: MenuCard,
  args: { onClick: fn(), icon: <span className="block h-full w-full bg-surface-2" />, title: '공방', sub: '낚싯대 Lv.3', subRole: 'omittable' },
};

export default meta;
type Story = StoryObj<typeof MenuCard>;

const area = (w: number, h: number) => (Story: () => ReactElement) => (
  <div className="flex items-center justify-center [container:basemenu/size]" style={{ width: w, height: h }}><Story /></div>
);

/** 넓은 메뉴 영역 — 설명 줄을 보인다 */
export const Wide: Story = { decorators: [area(900, 500)] };

/** 좁은 메뉴 영역 — 설명 줄을 숨기고 마우스를 올리면 툴팁으로 보인다 */
export const Narrow: Story = { decorators: [area(360, 600)] };

/** 낮은 메뉴 영역 */
export const Short: Story = { decorators: [area(900, 340)] };

/** 설명이 필수인 카드 — 좁아져도 숨기지 않는다 */
export const RequiredSub: Story = { args: { subRole: 'required' }, decorators: [area(360, 600)] };
