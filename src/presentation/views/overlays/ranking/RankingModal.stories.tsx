// 랭킹 창 스토리 — 명성, 도감 두 탭과 내 순위가 상위 목록 안과 밖일 때. 순위는 MSW가 응답한다.
import type { Meta, StoryObj } from '@storybook/react';
import { http, HttpResponse } from 'msw';
import { userEvent, within } from 'storybook/test';
import type { RankingBoard, RankingRow } from '../../../../platform/api';
import RankingModal from './RankingModal';

const NICKS = ['청새치사냥', '바다사나이', '심해잠수부', '밤낚시꾼', '가람', '물안개', '노을빛', '고등어왕', '파도타기', '등대지기',
  '갈매기', '산호초', '해달', '은빛비늘', '연어떼', '먼바다', '조약돌', '참돔낚시', '돌고래', '방파제'];

/** 상위 목록. meAt이 있으면 그 순위의 줄이 나다 */
const top = (first: number, step: number, meAt?: number): RankingRow[] =>
  NICKS.map((nickname, i) => ({ rank: i + 1, nickname, value: first - i * step, me: i + 1 === meAt }));

const rankApi = (fame: RankingBoard, dex: RankingBoard) => http.get('/api/rank', ({ request }) =>
  HttpResponse.json(new URL(request.url).searchParams.get('board') === 'dex' ? dex : fame));

const FAME_OUT: RankingBoard = { board: 'fame', top: top(98_000, 3_850), me: { rank: 128, value: 4_210 } };
const FAME_IN: RankingBoard = { board: 'fame', top: top(98_000, 3_850, 5), me: { rank: 5, value: 82_600 } };
const DEX_OUT: RankingBoard = { board: 'dex', top: top(43, 1), me: { rank: 57, value: 12 } };
const DEX_IN: RankingBoard = { board: 'dex', top: top(43, 1, 3), me: { rank: 3, value: 41 } };

const meta: Meta<typeof RankingModal> = {
  title: 'Stage/RankingModal',
  component: RankingModal,
  parameters: { layout: 'fullscreen', stage: {} },
  args: { onClose: () => {} },
};
export default meta;
type Story = StoryObj<typeof RankingModal>;

const openDex = async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  await userEvent.click(await within(canvasElement).findByRole('button', { name: '도감' }));
  // 클릭으로 생긴 포커스 테두리를 캡처에 남기지 않는다
  (document.activeElement as HTMLElement | null)?.blur();
};

export const FameMeOutside: Story = { parameters: { msw: [rankApi(FAME_OUT, DEX_OUT)] } };
export const FameMeInside: Story = { parameters: { msw: [rankApi(FAME_IN, DEX_IN)] } };
export const DexMeOutside: Story = { parameters: { msw: [rankApi(FAME_OUT, DEX_OUT)] }, play: openDex };
export const DexMeInside: Story = { parameters: { msw: [rankApi(FAME_IN, DEX_IN)] }, play: openDex };
export const Empty: Story = {
  parameters: { msw: [rankApi({ board: 'fame', top: [], me: null }, { board: 'dex', top: [], me: null })] },
};
