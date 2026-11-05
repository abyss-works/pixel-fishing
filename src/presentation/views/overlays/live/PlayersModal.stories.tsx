// 이 바다의 플레이어 창 스토리 — 접속 목록은 실시간 채널의 hello, 고른 사람의 정보는 공개 프로필 조회로 받는다.
import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { http, HttpResponse, ws } from 'msw';
import { useLive } from '../../../../features/live/service/useLive';
import { LIVE_PATH } from '../../../../game/rules/live';
import type { Presence } from '../../../../game/rules/live';
import { ARTIFACTS } from '../../../../game/content/artifacts';
import { FISH } from '../../../../game/content/fish';
import type { PublicProfile } from '../../../../platform/api';
import PlayersModal from './PlayersModal';

/** 실시간 채널: 연결되면 hello로 이 바다의 다른 플레이어를 알린다 */
const liveApi = (others: Presence[]) => ws.link(`ws://${location.host}${LIVE_PATH}`).addEventListener('connection', ({ client }) => {
  client.send(JSON.stringify({ t: 'hello', you: 'u-me', others, recentChat: [] }));
});
const PROFILE: PublicProfile = {
  nickname: null, boat: 3, rod: 12, fame: 48_200, account: true,
  dexFish: FISH.filter((_, i) => i % 3 !== 0).map(f => f.id),
  artifacts: ARTIFACTS.slice(0, 3).map(a => a.id),
};
const profileApi = http.get('/api/players/:uid', ({ params }) =>
  HttpResponse.json({ ...PROFILE, nickname: NICKS[Number(String(params.uid).slice(1))] ?? '바다사나이' }));

const NICKS = ['바다사나이', '밤낚시꾼', '심해잠수부', '노을빛', '고등어왕', '물안개', '파도타기', '등대지기', '청새치사냥', '갈매기', '산호초'];
const presence = (nick: string, i: number): Presence =>
  ({ uid: `p${i}`, nick, boat: 1 + (i % 5), region: 'pacific', zone: 'pacific', x: 100 + i * 10, y: 80, dir: 0, line: false });

/** 실시간 채널 연결을 스토리 수명에 묶는다 */
function Live({ children }: { children: ReactNode }) {
  useLive();
  return children;
}

const meta: Meta<typeof PlayersModal> = {
  title: 'Stage/PlayersModal',
  component: PlayersModal,
  parameters: { layout: 'fullscreen', stage: {} },
  decorators: [Story => <Live><Story /></Live>],
  args: { region: 'pacific', account: 'me@example.com', setToast: () => {}, onClose: () => {} },
};
export default meta;
type Story = StoryObj<typeof PlayersModal>;

const friendsApi = http.get('/api/friends', () => HttpResponse.json({ friends: [] }));
const blocksApi = http.get('/api/blocks', () => HttpResponse.json({ blocks: [] }));

export const Many: Story = { parameters: { msw: [liveApi(NICKS.map(presence)), profileApi, friendsApi, blocksApi] } };
export const Few: Story = { parameters: { msw: [liveApi(NICKS.slice(0, 2).map(presence)), profileApi, friendsApi, blocksApi] } };
export const Guest: Story = {
  args: { account: null },
  parameters: { msw: [liveApi(NICKS.slice(0, 5).map(presence)), profileApi] },
};
export const Nobody: Story = { parameters: { msw: [liveApi([])] } };
