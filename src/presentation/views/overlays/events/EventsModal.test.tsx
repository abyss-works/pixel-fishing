import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newState } from '../../../../game/rules/logic';
import type { EventsSnapshot } from '../../../../platform/api';
import { allowConsentGate, resetConsentGate } from '../../../../features/account/service/consentGate';
import { sessionKey } from '../../../../features/account/service/session';

const apiMock = vi.hoisted(() => ({
  readEvents: vi.fn(),
  isConfigured: true,
}));

vi.mock('../../../../platform/api', async importOriginal => {
  const mod = await importOriginal<typeof import('../../../../platform/api')>();
  return {
    ...mod,
    readEvents: apiMock.readEvents,
    api: {
      ...mod.api,
      auth: {
        ...mod.api.auth,
        get isConfigured() { return apiMock.isConfigured; },
        ensureSession: vi.fn(async () => 'u1'),
      },
    },
  };
});

import EventsModal from './EventsModal';

const NOW = '2026-12-01T12:00:00.000Z';

const SAMPLE_SNAP: EventsSnapshot = {
  now: NOW,
  events: [
    {
      id: 'ev-trio',
      kind: 'trio',
      title: '삼총사를 낚아라',
      description: '목표 어종 3마리를 모두 낚아 응모하세요.',
      startsAt: '2026-12-01T00:00:00.000Z',
      endsAt: '2026-12-06T12:00:00.000Z',
      active: true,
      config: {},
    },
    {
      id: 'ev-champ',
      kind: 'championship',
      title: '강태공 선수권 대회',
      description: '분지 호수에서 실력을 겨루고 보상을 정산하세요.',
      startsAt: '2026-12-01T00:00:00.000Z',
      endsAt: '2026-12-11T12:00:00.000Z',
      active: true,
      config: {},
    },
    {
      id: 'ev-draw',
      kind: 'draw',
      title: '천하제일 행운왕',
      description: '매일 운세 점수를 쌓아 행운왕에 도전하세요.',
      startsAt: '2026-12-01T00:00:00.000Z',
      endsAt: '2026-12-06T12:00:00.000Z',
      active: true,
      config: {},
    },
  ],
  trio: {
    eventId: 'ev-trio',
    slots: [
      { fishId: 'mackerel', form: 'normal', completed: true, completedAt: NOW },
      { fishId: 'squid', form: 'normal', completed: true, completedAt: NOW },
      { fishId: 'sailfish', form: 'normal', completed: true, completedAt: NOW },
    ],
    completedAt: NOW,
    claimedAt: null,
    won: true,
    rewardPin: '1234567890123456',
    rewardExpiresAt: '2026-12-31T14:59:59.000Z',
  },
  championship: {
    eventId: 'ev-champ',
    score: 520,
    bestFishId: 'event-glaaki',
    bestFishScore: 400,
    catches: 4,
    dex: { 'event-glaaki': { normal: 1, variant: 0 } },
    hatsGranted: [],
    pendingGold: 2400,
    pendingFame: 8,
    rank: 4,
    top: [
      { rank: 1, userId: 'u1', nickname: '금메달', score: 2000, look: { shirt: 1, pants: 1, hat: null }, me: false },
      { rank: 2, userId: 'u2', nickname: '은메달', score: 1500, look: { shirt: 2, pants: 2, hat: null }, me: false },
      { rank: 3, userId: 'u3', nickname: '동메달', score: 900, look: { shirt: 3, pants: 3, hat: null }, me: false },
      { rank: 4, userId: 'me', nickname: '내캐릭터', score: 520, look: null, me: true },
    ],
  },
  draw: {
    eventId: 'ev-draw',
    totalScore: 185,
    attendedDays: 2,
    days: [
      { day: '2026-12-01', kind: 'grand-catch', index: 5, score: 97 },
      { day: '2026-12-02', kind: 'fish', index: 5, score: 88 },
      { day: '2026-12-03', kind: null, index: null, score: null },
      { day: '2026-12-04', kind: null, index: null, score: null },
      { day: '2026-12-05', kind: null, index: null, score: null },
    ],
    rank: 2,
    top: [
      { rank: 1, userId: 'u1', nickname: '운빨일등', score: 290, look: null, me: false },
      { rank: 2, userId: 'me', nickname: '내캐릭터', score: 185, look: null, me: true },
      { rank: 3, userId: 'u3', nickname: '삼등왕', score: 170, look: null, me: false },
    ],
    won: false,
  },
};

function renderModal(props: Partial<Parameters<typeof EventsModal>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionKey, 'u1');
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(
    <Wrapper>
      <EventsModal
        accountState="account"
        game={newState()}
        nickname="내캐릭터"
        onEnterEventZone={vi.fn()}
        onLeaveEventZone={vi.fn()}
        onSettleEventReward={vi.fn()}
        onConnectGoogle={vi.fn()}
        onClose={vi.fn()}
        {...props}
      />
    </Wrapper>,
  );
}

describe('EventsModal', () => {
  beforeEach(() => {
    apiMock.readEvents.mockReset();
    allowConsentGate();
  });

  afterEach(() => {
    resetConsentGate();
    cleanup();
  });

  it('게스트는 구글 계정 연결 안내와 연결 버튼을 본다', () => {
    const onConnectGoogle = vi.fn();
    renderModal({ accountState: 'guest', onConnectGoogle });
    expect(screen.getByText('계정 연결 필요')).toBeInTheDocument();
    expect(screen.getByText('구글 계정을 연결하면 이벤트에 참여할 수 있어요.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '구글 계정 연결' }));
    expect(onConnectGoogle).toHaveBeenCalledTimes(1);
    expect(apiMock.readEvents).not.toHaveBeenCalled();
  });

  it('1단계 목록에서 3개 이벤트 카드와 남은 일수, 상세 진입을 제공한다', async () => {
    apiMock.readEvents.mockResolvedValue(SAMPLE_SNAP);
    renderModal();

    await waitFor(() => expect(screen.getByLabelText('진행 중인 이벤트 목록')).toBeInTheDocument());
    expect(screen.getByText('삼총사를 낚아라')).toBeInTheDocument();
    expect(screen.getByText('강태공 선수권 대회')).toBeInTheDocument();
    expect(screen.getByText('천하제일 행운왕')).toBeInTheDocument();
    expect(screen.getAllByText('5일 남음')).toHaveLength(2);
    expect(screen.getByText('10일 남음')).toBeInTheDocument();

    // 이벤트 1 당첨 상세
    fireEvent.click(screen.getByRole('button', { name: /삼총사를 낚아라/ }));
    expect(screen.getByText('당첨을 축하해요')).toBeInTheDocument();
    expect(screen.getByText('1234567890123456')).toBeInTheDocument();
    expect(screen.getByLabelText('교환권 바코드')).toBeInTheDocument();
    expect(screen.getByText('유효기간 2026년 12월 31일까지')).toBeInTheDocument();
    expect(screen.getByText('교환권 번호가 유출되지 않도록 다른 사람에게 공유하지 마세요.')).toBeInTheDocument();
    expect(document.querySelectorAll('input')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: '목록' }));
    expect(screen.getByLabelText('진행 중인 이벤트 목록')).toBeInTheDocument();
  });

  it('이벤트 2 대회 상세에서 순위 시상대, 정산 단가와 정산 버튼, 도감 9종과 한정 모자 배너를 표시한다', async () => {
    apiMock.readEvents.mockResolvedValue(SAMPLE_SNAP);
    const onEnterEventZone = vi.fn();
    const onSettleEventReward = vi.fn();
    renderModal({ onEnterEventZone, onSettleEventReward });

    await waitFor(() => expect(screen.getByText('강태공 선수권 대회')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /강태공 선수권 대회/ }));

    // 순위 탭 + 입장하기 + 표준 장비 배지 + 시상대 높이 규격
    const podium = screen.getByLabelText('순위 시상대');
    const places = [...podium.querySelectorAll('[data-place]')].map(el => el.getAttribute('data-place'));
    expect(places).toEqual(['2', '1', '3']);
    expect(podium.querySelector('[data-place="1"]')?.className).toContain('min-h-[98px]');
    expect(podium.querySelector('[data-place="1"]')?.className).toContain('mobile:min-h-[90px]');
    expect(podium.querySelector('[data-place="2"]')?.className).toContain('min-h-[86px]');
    expect(podium.querySelector('[data-place="2"]')?.className).toContain('mobile:min-h-[80px]');
    expect(podium.querySelector('[data-place="3"]')?.className).toContain('min-h-[76px]');
    expect(podium.querySelector('[data-place="3"]')?.className).toContain('mobile:min-h-[72px]');
    expect(screen.getByText('방치 5배')).toBeInTheDocument();
    expect(screen.queryByText('방치 +5%')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '입장하기' }));
    expect(onEnterEventZone).toHaveBeenCalledWith('ev-champ');

    // 정산 탭
    fireEvent.click(screen.getByRole('button', { name: /정산/ }));
    expect(screen.getByText('2,400G')).toBeInTheDocument();
    expect(screen.getByText('보상은 현재 배 단계에 따라 결정돼요. 골드가 쌓이는 대로 틈틈이 배를 업그레이드해 주세요.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '정산하기' }));
    expect(onSettleEventReward).toHaveBeenCalledWith('ev-champ');

    // 도감 탭
    fireEvent.click(screen.getByRole('button', { name: /도감/ }));
    const hatBanner = screen.getByLabelText('대회 한정 모자 보상');
    expect(within(hatBanner).getByText('천지 강태공 삿갓')).toBeInTheDocument();
    expect(within(hatBanner).getByText('천년 비늘 왕관')).toBeInTheDocument();
    expect(screen.getAllByText('글라키').length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole('button', { name: '어종 공개' }));
    expect(screen.getAllByText('거북복').length).toBeGreaterThanOrEqual(1);
  });

  it('이벤트 3 행운왕 상세에서 금빛 네잎클로버 순위 시상대와 순위표·내 순위 바, 5일 점괘판을 표시한다', async () => {
    apiMock.readEvents.mockResolvedValue({
      ...SAMPLE_SNAP,
      draw: {
        ...SAMPLE_SNAP.draw!,
        rank: 4,
        top: [
          ...SAMPLE_SNAP.draw!.top,
          { rank: 4, userId: 'me', nickname: '내캐릭터', score: 150, look: null, me: true },
        ],
      },
    });
    renderModal();

    await waitFor(() => expect(screen.getByText('천하제일 행운왕')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /천하제일 행운왕/ }));

    const podium = screen.getByLabelText('순위 시상대');
    expect(podium.querySelector('[data-glyph="clover"]')).not.toBeNull();
    const fourthRow = screen.getByText('4위').parentElement!;
    expect(fourthRow.querySelector('[data-glyph="clover"]')).not.toBeNull();
    const myBar = screen.getByLabelText('내 순위');
    expect(myBar.querySelector('[data-glyph="clover"]')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '점괘판' }));
    const board = screen.getByLabelText('행운 출석 점괘판');
    expect(within(board).getByText('12/1')).toBeInTheDocument();
    expect(within(board).getByText('97')).toBeInTheDocument();
    expect(screen.getByText('동점이면 출석 일수가 많은 쪽이 앞서요.')).toBeInTheDocument();
  });

  it('진행 예정·종료 이벤트는 진행 중 배지를 달지 않고, 트리오 추첨 대기(rewardPin 없음)에서는 알림점을 띄우지 않는다', async () => {
    apiMock.readEvents.mockResolvedValue({
      ...SAMPLE_SNAP,
      events: [
        { ...SAMPLE_SNAP.events[0] },
        {
          ...SAMPLE_SNAP.events[1],
          startsAt: '2026-12-03T00:00:00.000Z',
          endsAt: '2026-12-10T00:00:00.000Z',
          active: true,
        },
        {
          ...SAMPLE_SNAP.events[2],
          startsAt: '2026-11-20T00:00:00.000Z',
          endsAt: '2026-11-30T00:00:00.000Z',
          active: true,
        },
      ],
      trio: {
        ...SAMPLE_SNAP.trio!,
        won: true,
        claimedAt: null,
        rewardPin: null,
      },
      championship: {
        ...SAMPLE_SNAP.championship!,
        pendingGold: 0,
        pendingFame: 0,
      },
    });
    renderModal();

    await waitFor(() => expect(screen.getByLabelText('진행 중인 이벤트 목록')).toBeInTheDocument());
    expect(document.querySelector('[data-alert="true"]')).toBeNull();
    expect(screen.getByText('진행 예정')).toBeInTheDocument();
    expect(screen.getByText('종료')).toBeInTheDocument();
    expect(screen.queryByText('진행 중')).toBeNull();
  });
});
