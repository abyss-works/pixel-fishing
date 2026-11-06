// 사람 그림 스토리.
import type { Meta, StoryObj } from '@storybook/react';
import PersonSprite from './PersonSprite';

const meta: Meta<typeof PersonSprite> = { title: 'UI/PersonSprite', component: PersonSprite };
export default meta;
type Story = StoryObj<typeof PersonSprite>;

export const Default: Story = { args: { look: { shirt: 0, pants: 0, hat: null }, scale: 4 } };
export const WithHat: Story = { args: { look: { shirt: 6, pants: 1, hat: 'cap-red' }, scale: 4 } };
export const OnBoat: Story = { args: { look: { shirt: 2, pants: 7, hat: 'cap-blue' }, scale: 2, onBoat: true } };
