// 길드 창 — 길드가 없을 때(코드로 들어가기, 만들기, 넣어 둔 신청), 길드원의 탭 셋, 길드장의 관리 탭.
// 내 길드는 GET /api/guilds/me가 준다. 세션 uid는 u-me다.
import type { Meta, StoryObj } from '@storybook/react';
import { http, HttpResponse } from 'msw';
import { userEvent, within } from 'storybook/test';
import type { GuildInfo, GuildMemberItem, GuildState } from '../../../../platform/api';
import GuildModal from './GuildModal';

const meta: Meta<typeof GuildModal> = {
  title: 'Stage/GuildModal',
  component: GuildModal,
  parameters: { layout: 'fullscreen', stage: {} },
  args: { setToast: () => {}, onGoldChanged: () => {}, onClose: () => {} },
};
export default meta;
type Story = StoryObj<typeof GuildModal>;

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const member = (uid: string, nick: string, over: Partial<GuildMemberItem> = {}): GuildMemberItem => ({
  uid, nick, role: 'member', joinedAt: ago(60 * 24 * 12), leftAt: null, online: false,
  contribution: { total: 4_200, today: 300 }, ...over,
});

const guild = (role: GuildInfo['role']): GuildInfo => ({
  id: 'g1', name: '심해선단', createdAt: ago(60 * 24 * 30), role,
  code: 'K7QX2MAB', joinMode: 'approval', pitch: '매일 저녁 태평양에서 같이 낚시해요.',
  requests: role === 'leader' ? [
    { uid: 'r1', nick: '바다거북', requestedAt: ago(35) },
    { uid: 'r2', nick: '은빛고래', requestedAt: ago(60 * 5) },
    { uid: 'r3', nick: '새벽물결', requestedAt: ago(60 * 26) },
  ] : [],
  members: [
    member(role === 'leader' ? 'u-me' : 'L', '가람', { role: 'leader', online: true, contribution: { total: 31_900, today: 1_400 } }),
    member(role === 'leader' ? 'M' : 'u-me', '나루', { online: true, contribution: { total: 12_300, today: 900 } }),
    member('A', '다온', { online: true, contribution: { total: 8_750, today: 2_000 } }),
    member('B', '모래성', { contribution: { total: 6_100, today: 0 } }),
    member('C', '파도소리', { contribution: { total: 2_050, today: 150 } }),
    member('D', '해초', { contribution: { total: 400, today: 0 } }),
    member('E', '갈매기', { leftAt: ago(60 * 30), contribution: { total: 3_300, today: 0 } }),
  ],
  growth: { level: 3, total: 64_800, floor: 50_000, next: 100_000 },
  bonuses: [
    { id: 'sell', unlock: 1, rank: 2, cap: 3, pool: 125_000, next: 500_000, effect: 0.04, nextEffect: 0.06, mine: 100_000 },
    { id: 'bag', unlock: 2, rank: 3, cap: 3, pool: 0, next: 1_500_000, effect: 0.12, nextEffect: 0.16, mine: 0 },
    { id: 'named', unlock: 3, rank: 1, cap: 3, pool: 40_000, next: 150_000, effect: 0.05, nextEffect: 0.1, mine: 20_000 },
    { id: 'rare', unlock: 4, rank: 0, cap: 0, pool: 0, next: null, effect: 0, nextEffect: 0.02, mine: 0 },
    { id: 'mutation', unlock: 5, rank: 0, cap: 0, pool: 0, next: null, effect: 0, nextEffect: 0.01, mine: 0 },
  ],
  effects: { sell: 0.04, bag: 0.12, named: 0.05, rare: 0, mutation: 0 },
  donors: [
    { uid: 'M', nick: '나루', gold: 900_000 }, { uid: 'L', nick: '가람', gold: 420_000 },
    { uid: 'A', nick: '다온', gold: 125_000 }, { uid: null, nick: null, gold: 30_000 },
  ],
  logbook: [
    { id: 9, kind: 'legendary', uid: 'A', nick: '다온', detail: 'goldcarp', value: null, at: ago(20) },
    { id: 8, kind: 'donate', uid: 'M', nick: '나루', detail: 'sell', value: 50_000, at: ago(95) },
    { id: 7, kind: 'named', uid: 'L', nick: '가람', detail: 'pacific-named-megalodon', value: null, at: ago(60 * 3) },
    { id: 6, kind: 'bonus-up', uid: 'M', nick: '나루', detail: 'bag', value: 3, at: ago(60 * 7) },
    { id: 5, kind: 'leave', uid: 'E', nick: '갈매기', detail: null, value: null, at: ago(60 * 30) },
    { id: 4, kind: 'join', uid: 'D', nick: '해초', detail: null, value: null, at: ago(60 * 50) },
    { id: 3, kind: 'kick', uid: 'F', nick: '먹구름', detail: null, value: null, at: ago(60 * 52) },
  ],
});

const mine = (state: GuildState) => [http.get('/api/guilds/me', () => HttpResponse.json(state))];
const openTab = (name: RegExp): Story['play'] => async ({ canvasElement }) => {
  await userEvent.click(await within(canvasElement).findByRole('button', { name }));
  // 캡처에 클릭 포커스 테두리가 남지 않게 한다
  (document.activeElement as HTMLElement | null)?.blur();
};

/** 길드가 없다: 코드로 들어가기와 만들기 */
export const NoGuild: Story = { parameters: { msw: mine({ guild: null, request: null }) } };
/** 길드가 없고 넣어 둔 가입 신청이 있다 */
export const NoGuildRequested: Story = {
  parameters: { msw: mine({ guild: null, request: { code: 'K7QX2MAB', name: '새벽선단', requestedAt: ago(60 * 26) } }) },
};
export const MemberMembers: Story = { parameters: { msw: mine({ guild: guild('member'), request: null }) } };
export const MemberSkills: Story = { parameters: { msw: mine({ guild: guild('member'), request: null }) }, play: openTab(/^길드 스킬/) };
export const MemberLogbook: Story = { parameters: { msw: mine({ guild: guild('member'), request: null }) }, play: openTab(/^항해일지/) };
/** 길드장: 관리 탭(가입 방식, 코드와 링크, 가입 신청 셋) */
export const LeaderManage: Story = { parameters: { msw: mine({ guild: guild('leader'), request: null }) }, play: openTab(/^관리/) };
