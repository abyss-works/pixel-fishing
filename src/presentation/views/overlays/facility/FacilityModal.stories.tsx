// 정비 패널 4종과 수배판 — 격리 검수용. dispatch는 항상 ok를 돌려주는 스텁이라 상태는 바뀌지 않는다.
import type { Meta, StoryObj } from '@storybook/react';
import { http, HttpResponse } from 'msw';
import { userEvent, within } from 'storybook/test';
import { gameDay } from '../../../../features/bounty/service/queryKeys';
import { dailyQuestFor } from '../../../../game/content/bounties';
import FacilityModal from './FacilityModal';
import { newState } from '../../../../game/rules/logic';
import type { GameState } from '../../../../game/rules/logic';
import type { FishInstance } from '../../../../game/rules/logic';

const meta: Meta<typeof FacilityModal> = {
  title: 'Stage/FacilityModal',
  component: FacilityModal,
  // 스테이지 모달은 absolute라 게임 스테이지 크기의 상자 안에 띄운다
  parameters: { layout: 'fullscreen', stage: {} },
};
export default meta;
type Story = StoryObj<typeof FacilityModal>;

const inst = (uid: string, fishId: string, size = 20): FishInstance =>
  ({ uid, fishId, form: 'normal', size, caughtAt: null, spot: null, judgment: null, locked: false });
const game = (over: Partial<GameState> = {}): GameState => ({ ...newState(), gold: 12_317, fame: 61_720, rod: 4, boat: 2, ...over });
const common = {
  dispatch: () => ({ status: 'ok' as const, state: game(), result: { type: 'none' as const } }),
  setToast: () => {}, onClose: () => {},
};

export const Rod: Story = { args: { ...common, panel: 'rod', game: game() } };
export const RodShortOfGold: Story = { args: { ...common, panel: 'rod', game: game({ gold: 120, rod: 9 }) } };
export const Boat: Story = { args: { ...common, panel: 'boat', game: game({ gold: 40_000 }) } };
export const BoatShortOfFame: Story = { args: { ...common, panel: 'boat', game: game({ boat: 4, gold: 50_000, fame: 8_000 }) } };
export const BoatMax: Story = { args: { ...common, panel: 'boat', game: game({ boat: 6 }) } };
export const Sell: Story = {
  args: { ...common, panel: 'sell', game: game({ bag: [inst('a', 'crucian'), inst('b', 'carp', 31.2), inst('c', 'carp', 18.5)] }) },
};
/** 잠근 개체가 섞인 가방: 잠근 종은 자물쇠와 툴팁으로 판매에서 빠진다 */
export const SellWithLocked: Story = {
  args: {
    ...common, panel: 'sell',
    game: game({ bag: [inst('a', 'crucian'), inst('b', 'carp', 31.2), { ...inst('c', 'catfish', 54.0), locked: true }] }),
  },
};
export const Shop: Story = { args: { ...common, panel: 'shop', game: game({ items: { 'bait-common': 3 } }) } };

// ---------- 수배판(태평양 항구) ----------
// 수배판 스냅샷은 GET /api/me?q=bounty가 준다. 진행 행의 시작 시각은 오늘 게임 날짜 안이어야 살아 있다.
const rec = () => ({ count: 1, maxSize: null, first: null });
const dexOf = (...ids: string[]) => Object.fromEntries(ids.map(id => [id, { normal: rec() }]));
/** 태평양 전설을 뺀 전부: 일반 의뢰 라이선스 조건 */
const BASIC_DEX = dexOf('mackerel', 'hairtail', 'anglerfish', 'seabream', 'yellowtail', 'squid', 'tuna', 'coelacanth', 'oarfish');
/** 태평양 전부(밤 어종, 전설 포함): 네임드 토벌 라이선스 조건 */
const NAMED_DEX = { ...BASIC_DEX, ...dexOf('shark', 'kraken', 'moonveil', 'abyssveil') };
const bountySnap = (snap: {
  clears?: { kind: string; cleared_at: string }[];
  progress?: { quest_id: string; progress: number }[];
  tickets?: { quest_id: string; issued_at: string }[];
} = {}) => http.get('/api/me', () => HttpResponse.json({
  clears: snap.clears ?? [],
  progress: (snap.progress ?? []).map(p => ({ ...p, started_at: new Date().toISOString() })),
  tickets: snap.tickets ?? [],
}));
const bounty = (over: Partial<GameState>) => ({ ...common, panel: 'bounty' as const, base: 'harbor' as const, uid: 'u-me', game: game(over) });
const openTab = (name: string): Story['play'] => async ({ canvasElement }) => {
  await userEvent.click(await within(canvasElement).findByRole('button', { name }));
  // 캡처에 클릭 포커스 테두리가 남지 않게 한다
  (document.activeElement as HTMLElement | null)?.blur();
};
const easyQuest = () => dailyQuestFor('pacific', 'easy', 'u-me', gameDay())!;

/** 일반 의뢰: 쉬움을 수주해 진행 중이고, 오늘 일반 의뢰를 한 번 마쳤다 */
export const BountyQuests: Story = {
  args: bounty({ fame: 1_500, dex: BASIC_DEX }),
  parameters: {
    msw: [bountySnap({
      clears: [{ kind: 'general', cleared_at: new Date().toISOString() }],
      progress: [{ quest_id: easyQuest().id, progress: Math.floor(easyQuest().count / 2) }],
    })],
  },
};
/** 일반 의뢰 라이선스 조건 미달: 본문을 흐리고 조건 목록을 덮는다 */
export const BountyLocked: Story = {
  args: bounty({ fame: 800 }),
  parameters: { msw: [bountySnap()] },
};
/** 네임드 토벌: 흔적(도전권)이 남아 있다 */
export const BountyNamed: Story = {
  args: bounty({ fame: 1_500, dex: NAMED_DEX }),
  parameters: {
    msw: [bountySnap({
      progress: [{ quest_id: 'pacific-named-megalodon', progress: 0 }],
      tickets: [{ quest_id: 'pacific-named-megalodon', issued_at: new Date(Date.now() - 40 * 60_000).toISOString() }],
    })],
  },
  play: openTab('네임드 토벌'),
};
/** 네임드 토벌 라이선스 조건 미달(일반 의뢰는 열림) */
export const BountyNamedLocked: Story = {
  args: bounty({ fame: 1_500, dex: BASIC_DEX }),
  parameters: { msw: [bountySnap()] },
  play: openTab('네임드 토벌'),
};
/** 유물: 교환 재료를 하나 가지고 있다 */
export const BountyRelic: Story = {
  args: bounty({ fame: 1_500, dex: NAMED_DEX, items: { 'mat-abyss-lantern': 1 } }),
  parameters: { msw: [bountySnap()] },
  play: openTab('유물'),
};
