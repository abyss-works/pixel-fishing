// 우편함 창 스토리 — 골드 우편과 골드 없는 우편을 고른 모습, 고르지 않은 모습, 빈 우편함. 우편 목록은 MSW가 응답한다.
import type { Meta, StoryObj } from '@storybook/react';
import { http, HttpResponse } from 'msw';
import { userEvent, within } from 'storybook/test';
import type { MailItem } from '../../../../platform/api';
import MailboxModal from './MailboxModal';

const at = (date: string) => `${date}T03:00:00.000Z`;
const mail = (id: number, title: string, body: string, gold: number, date: string, over: Partial<MailItem> = {}): MailItem =>
  ({ id, title, body, gold, createdAt: at(date), readAt: null, claimedAt: null, ...over });

const MAILS: MailItem[] = [
  mail(6, '11월 정기 점검 보상', '점검 동안 기다려 주셔서 고마워요.\n보상 골드를 받아 주세요.', 5_000, '2026-11-05'),
  mail(5, '길드 기능이 열렸어요', '이제 길드를 만들거나 초대 코드로 들어갈 수 있어요.\n길드 창은 오른쪽 위 메뉴에서 열 수 있어요.', 0, '2026-11-03'),
  mail(4, '대서양 사전 알림', '다음 업데이트에서 대서양 해역이 열려요.', 0, '2026-10-30'),
  mail(3, '10월 이벤트 당첨', '10월 낚시 대회에 참여해 주셔서 고마워요.', 10_000, '2026-10-28',
    { readAt: at('2026-10-28'), claimedAt: at('2026-10-28') }),
  mail(2, '환영 선물', '픽셀 피싱에 온 것을 환영해요!', 1_000, '2026-10-01', { readAt: at('2026-10-01'), claimedAt: at('2026-10-01') }),
  mail(1, '9월 점검 보상', '점검 보상이에요.', 2_000, '2026-09-21', { readAt: at('2026-09-21'), claimedAt: at('2026-09-21') }),
];

const mailApi = (mails: MailItem[]) => [
  http.get('/api/mail', () => HttpResponse.json({ mails })),
  http.post('/api/mail', () => HttpResponse.json({ ok: true })),
];
const pick = (title: string) => async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  await userEvent.click(await within(canvasElement).findByText(title));
  // 클릭으로 생긴 포커스 테두리를 캡처에 남기지 않는다
  (document.activeElement as HTMLElement | null)?.blur();
};

const meta: Meta<typeof MailboxModal> = {
  title: 'Stage/MailboxModal',
  component: MailboxModal,
  parameters: { layout: 'fullscreen', stage: {} },
  args: {
    dispatch: () => ({ status: 'ok' as const, state: undefined as never, result: { type: 'none' as const } }),
    setToast: () => {}, onClose: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof MailboxModal>;

export const GoldMail: Story = { parameters: { msw: mailApi(MAILS) }, play: pick('11월 정기 점검 보상') };
export const ClaimedGoldMail: Story = { parameters: { msw: mailApi(MAILS) }, play: pick('10월 이벤트 당첨') };
export const PlainMail: Story = { parameters: { msw: mailApi(MAILS) }, play: pick('길드 기능이 열렸어요') };
export const NoneSelected: Story = { parameters: { msw: mailApi(MAILS) } };
export const Empty: Story = { parameters: { msw: mailApi([]) } };
