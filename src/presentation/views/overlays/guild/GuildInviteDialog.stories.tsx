// 초대 링크 확인 창 — 상태마다 안내와 버튼이 다르다(들어가기, 가입 신청, 받지 않음, 가득 참, 이미 길드에 있음, 게스트, 없는 코드).
// 초대 미리보기는 GET /api/guild-invites/:code, 내 길드는 GET /api/guilds/me가 준다.
import type { Meta, StoryObj } from '@storybook/react';
import { http, HttpResponse } from 'msw';
import type { GuildInvitePreview } from '../../../../platform/api';
import GuildInviteDialog from './GuildInviteDialog';

const meta: Meta<typeof GuildInviteDialog> = {
  title: 'Stage/GuildInviteDialog',
  component: GuildInviteDialog,
  parameters: { layout: 'fullscreen', stage: {} },
  args: { code: 'K7QX2MAB', account: 'sea@example.com', onAccount: () => {}, onClose: () => {}, setToast: () => {} },
};
export default meta;
type Story = StoryObj<typeof GuildInviteDialog>;

const preview = (over: Partial<GuildInvitePreview> = {}): GuildInvitePreview =>
  ({ code: 'K7QX2MAB', name: '새벽선단', level: 4, members: 7, cap: 10, joinMode: 'open', ...over });
const handlers = (invite: GuildInvitePreview | null, myGuild: string | null = null) => [
  http.get('/api/guild-invites/:code', () => (invite ? HttpResponse.json({ invite }) : new HttpResponse(null, { status: 404 }))),
  http.get('/api/guilds/me', () => HttpResponse.json({
    guild: myGuild ? { name: myGuild } : null, request: null,
  })),
];

export const Open: Story = { parameters: { msw: handlers(preview()) } };
export const Approval: Story = { parameters: { msw: handlers(preview({ joinMode: 'approval' })) } };
export const Closed: Story = { parameters: { msw: handlers(preview({ joinMode: 'closed' })) } };
export const Full: Story = { parameters: { msw: handlers(preview({ members: 10 })) } };
export const InOtherGuild: Story = { parameters: { msw: handlers(preview(), '심해선단') } };
export const Guest: Story = { args: { account: null }, parameters: { msw: handlers(preview()) } };
export const BadCode: Story = { parameters: { msw: handlers(null) } };
