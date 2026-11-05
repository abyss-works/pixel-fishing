// 소셜 창 스토리 — 탭 셋(친구, 요청, 차단)과 각 탭의 빈 상태. 친구와 차단 목록은 MSW가 응답한다.
import type { Meta, StoryObj } from '@storybook/react';
import { http, HttpResponse } from 'msw';
import { userEvent, within } from 'storybook/test';
import type { FriendItem } from '../../../../platform/api';
import FriendsModal from './FriendsModal';

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const friend = (uid: string, nick: string, over: Partial<FriendItem> = {}): FriendItem =>
  ({ uid, nick, state: 'friend', lastActiveAt: ago(5), online: false, region: null, zone: null, ...over });

const FRIENDS: FriendItem[] = [
  friend('f1', '바다사나이', { online: true, region: 'pacific', zone: 'pacific' }),
  friend('f2', '밤낚시꾼', { online: true, region: 'village' }),
  friend('f3', '심해잠수부', { online: true, region: 'seasia', zone: 'coron' }),
  friend('f4', '노을빛', { lastActiveAt: ago(42) }),
  friend('f5', '고등어왕', { lastActiveAt: ago(60 * 7) }),
  friend('f6', '물안개', { lastActiveAt: ago(60 * 24 * 3) }),
  friend('f7', '파도타기', { lastActiveAt: ago(60 * 24 * 12) }),
  friend('f8', '등대지기', { lastActiveAt: null }),
  friend('f9', '청새치사냥', { lastActiveAt: ago(60 * 30) }),
  friend('f10', '갈매기', { lastActiveAt: ago(60 * 24 * 40) }),
];
const REQUESTS: FriendItem[] = [
  friend('r1', '산호초', { state: 'incoming' }),
  friend('r2', '가람', { state: 'incoming' }),
  friend('r3', '해달', { state: 'outgoing' }),
];

const friendsApi = (friends: FriendItem[]) => http.get('/api/friends', () => HttpResponse.json({ friends }));
const blocksApi = (blocks: { uid: string; nick: string | null }[]) => http.get('/api/blocks', () => HttpResponse.json({ blocks }));
const openTab = (name: RegExp) => async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  await userEvent.click(await within(canvasElement).findByRole('button', { name }));
  // 클릭으로 생긴 포커스 테두리를 캡처에 남기지 않는다
  (document.activeElement as HTMLElement | null)?.blur();
};

const meta: Meta<typeof FriendsModal> = {
  title: 'Stage/FriendsModal',
  component: FriendsModal,
  parameters: { layout: 'fullscreen', stage: {} },
  args: { setToast: () => {}, onClose: () => {} },
};
export default meta;
type Story = StoryObj<typeof FriendsModal>;

export const Friends: Story = { parameters: { msw: [friendsApi([...FRIENDS, ...REQUESTS])] } };
export const FriendsEmpty: Story = { parameters: { msw: [friendsApi([])] } };
export const Requests: Story = { parameters: { msw: [friendsApi([...FRIENDS, ...REQUESTS])] }, play: openTab(/^요청/) };
export const RequestsMany: Story = {
  parameters: {
    msw: [friendsApi([
      ...REQUESTS,
      friend('r4', '은빛비늘', { state: 'incoming' }), friend('r5', '연어떼', { state: 'incoming' }),
      friend('r6', '먼바다', { state: 'outgoing' }), friend('r7', '조약돌', { state: 'outgoing' }),
      friend('r8', '참돔낚시', { state: 'outgoing' }),
    ])],
  },
  play: openTab(/^요청/),
};
export const RequestsEmpty: Story = { parameters: { msw: [friendsApi(FRIENDS)] }, play: openTab(/^요청/) };
export const Blocks: Story = {
  parameters: { msw: [friendsApi(FRIENDS), blocksApi([{ uid: 'b1', nick: '욕쟁이123' }, { uid: 'b2', nick: '도배꾼' }])] },
  play: openTab(/^차단/),
};
export const BlocksEmpty: Story = { parameters: { msw: [friendsApi(FRIENDS), blocksApi([])] }, play: openTab(/^차단/) };
