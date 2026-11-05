// 플레이어 정보 창(400 폭) 스토리 — 채팅 이름에서 연다. 공개 프로필, 친구 관계, 차단 목록은 MSW가 응답한다.
import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { http, HttpResponse, ws } from 'msw';
import { useLive } from '../../../../features/live/service/useLive';
import { ARTIFACTS } from '../../../../game/content/artifacts';
import { FISH } from '../../../../game/content/fish';
import { LIVE_PATH } from '../../../../game/rules/live';
import type { FriendItem, PublicProfile } from '../../../../platform/api';
import PlayerModal from './PlayerInfo';

const TARGET = { uid: 'p1', nick: '바다사나이', chatId: 812 };
const PROFILE: PublicProfile = {
  nickname: '바다사나이', boat: 4, rod: 18, fame: 61_720, account: true,
  dexFish: FISH.filter((_, i) => i % 4 !== 0).map(f => f.id),
  artifacts: ARTIFACTS.slice(0, 5).map(a => a.id),
};

/** 실시간 채널: 대상이 접속해 있으면 hello의 다른 플레이어에 넣는다 */
const liveApi = (online: boolean) => ws.link(`ws://${location.host}${LIVE_PATH}`).addEventListener('connection', ({ client }) => {
  const others = online ? [{ uid: TARGET.uid, nick: TARGET.nick, boat: 4, region: 'pacific', zone: 'pacific', x: 120, y: 80, dir: 0, line: false }] : [];
  client.send(JSON.stringify({ t: 'hello', you: 'u-me', others, recentChat: [] }));
});
const profileApi = (profile: PublicProfile = PROFILE) => http.get('/api/players/:uid', () => HttpResponse.json(profile));
const friendsApi = (state: FriendItem['state'] | null) => http.get('/api/friends', () => HttpResponse.json({
  friends: state ? [{ uid: TARGET.uid, nick: TARGET.nick, state, lastActiveAt: null, online: true, region: 'pacific', zone: 'pacific' }] : [],
}));
const blocksApi = (blocked: boolean) => http.get('/api/blocks', () =>
  HttpResponse.json({ blocks: blocked ? [{ uid: TARGET.uid, nick: TARGET.nick }] : [] }));

function Live({ children }: { children: ReactNode }) {
  useLive();
  return children;
}

const meta: Meta<typeof PlayerModal> = {
  title: 'Stage/PlayerModal',
  component: PlayerModal,
  parameters: { layout: 'fullscreen', stage: {} },
  decorators: [Story => <Live><Story /></Live>],
  args: { target: TARGET, self: false, account: 'me@example.com', setToast: () => {}, onClose: () => {} },
};
export default meta;
type Story = StoryObj<typeof PlayerModal>;

export const Stranger: Story = { parameters: { msw: [liveApi(true), profileApi(), friendsApi(null), blocksApi(false)] } };
export const Friend: Story = { parameters: { msw: [liveApi(true), profileApi(), friendsApi('friend'), blocksApi(false)] } };
export const Incoming: Story = { parameters: { msw: [liveApi(false), profileApi(), friendsApi('incoming'), blocksApi(false)] } };
export const Blocked: Story = { parameters: { msw: [liveApi(false), profileApi(), friendsApi(null), blocksApi(true)] } };
export const Guest: Story = { args: { account: null }, parameters: { msw: [liveApi(true), profileApi()] } };
export const Self: Story = {
  args: { target: { uid: 'u-me', nick: '가람' }, self: true },
  parameters: { msw: [liveApi(false), profileApi({ ...PROFILE, nickname: '가람', boat: 0, rod: 1, fame: 120, dexFish: [], artifacts: [] })] },
};
