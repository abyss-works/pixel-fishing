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

    // 이벤트 1 당첨 상세 + 목표 어종 출현 해역 + 진행 중 안내
    fireEvent.click(screen.getByRole('button', { name: /삼총사를 낚아라/ }));
    const targetList = screen.getByLabelText('목표 어종 목록');
    expect(within(targetList).getByText('태평양 연안')).toBeInTheDocument();
    expect(within(targetList).getByText('태평양 (마리아나 해구)')).toBeInTheDocument();
    expect(within(targetList).getByText('동남아 (드래곤 홀)')).toBeInTheDocument();
    expect(screen.getByText('당첨을 축하해요')).toBeInTheDocument();
    expect(screen.getByText('1234567890123456')).toBeInTheDocument();
    expect(screen.getByLabelText('교환권 바코드')).toBeInTheDocument();
    expect(screen.getByText('유효기간 2026년 12월 31일까지')).toBeInTheDocument();
    expect(screen.getByText('교환권 번호가 유출되지 않도록 다른 사람에게 공유하지 마세요.')).toBeInTheDocument();
    expect(document.querySelectorAll('input')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: '목록' }));
    expect(screen.getByLabelText('진행 중인 이벤트 목록')).toBeInTheDocument();
  });

  it('이벤트 1 미달성 상세에서 기간 내 신규 포획 보조 안내를 표시한다', async () => {
    apiMock.readEvents.mockResolvedValue({
      ...SAMPLE_SNAP,
      trio: {
        ...SAMPLE_SNAP.trio!,
        won: false,
        completedAt: null,
        rewardPin: null,
        slots: [
          { fishId: 'mackerel', form: 'normal', completed: true, completedAt: NOW },
          { fishId: 'squid', form: 'normal', completed: false, completedAt: null },
          { fishId: 'sailfish', form: 'normal', completed: false, completedAt: null },
        ],
      },
    });
    renderModal();

    await waitFor(() => expect(screen.getByText('삼총사를 낚아라')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /삼총사를 낚아라/ }));
    expect(screen.getByText('이벤트 기간 안에 정해진 형태로 새로 낚아야 달성할 수 있어요.')).toBeInTheDocument();
  });

  it('이벤트 2 대회 상세에서 헤더 입장 버튼, 순위 시상대, 정산 단가와 정산 버튼, 도감 9종과 한정 모자 배너를 표시한다', async () => {
    apiMock.readEvents.mockResolvedValue(SAMPLE_SNAP);
    const onEnterEventZone = vi.fn();
    const onSettleEventReward = vi.fn();
    renderModal({ onEnterEventZone, onSettleEventReward });

    await waitFor(() => expect(screen.getByText('강태공 선수권 대회')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /강태공 선수권 대회/ }));

    // 상단 단독 [순위/점수 + 입장하기] 바는 제거되고, 입장하기는 헤더에 배치된다
    expect(screen.queryByText('순위 집계 중')).toBeNull();
    const enterBtn = screen.getByRole('button', { name: '입장하기' });
    expect(enterBtn.closest('.border-b')).not.toBeNull();

    // 순위 탭 1줄 안내 + 표준 장비(돌연변이 자홍 배지) + 시상대 높이 규격
    expect(screen.getByText('모두 같은 표준 장비로 낚은 누적 점수로 순위를 겨뤄요.')).toBeInTheDocument();
    const mutationBadge = screen.getByText('돌연변이 1.25배');
    expect(mutationBadge.className).toContain('border-mutation');
    expect(mutationBadge.className).toContain('text-mutation');
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
    fireEvent.click(enterBtn);
    expect(onEnterEventZone).toHaveBeenCalledWith('ev-champ');

    // 정산 탭 1줄 안내 + font-sans tabular-nums 선명한 숫자 + 정돈된 카드 계층
    fireEvent.click(screen.getByRole('button', { name: /정산/ }));
    expect(screen.getByText('대회에서 쌓인 골드와 명성을 원할 때 바로 정산받을 수 있어요.')).toBeInTheDocument();
    expect(screen.getByText('미정산 보상')).toBeInTheDocument();
    const pendingGoldEl = screen.getByText('2,400G');
    expect(pendingGoldEl.className).toContain('font-sans');
    expect(pendingGoldEl.className).toContain('tabular-nums');
    expect(pendingGoldEl.className).not.toContain('pf-accent');
    const pendingFameEl = screen.getByText('8');
    expect(pendingFameEl.className).toContain('font-sans');
    expect(pendingFameEl.className).not.toContain('pf-accent');
    expect(screen.getByText('보상은 현재 배 단계에 따라 결정돼요. 골드가 쌓이는 대로 틈틈이 배를 업그레이드해 주세요.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '정산하기' }));
    expect(onSettleEventReward).toHaveBeenCalledWith('ev-champ');

    // 도감 탭 1줄 안내 + 모자 배너 + 9종 + 어종 공개 토글
    fireEvent.click(screen.getByRole('button', { name: /도감/ }));
    expect(screen.getByText('호수의 일반과 돌연변이 도감을 모두 채우면 한정 모자를 받아요.')).toBeInTheDocument();
    const hatBanner = screen.getByLabelText('대회 한정 모자 보상');
    expect(within(hatBanner).getByText('천지 강태공 삿갓')).toBeInTheDocument();
    expect(within(hatBanner).getByText('천년 비늘 왕관')).toBeInTheDocument();
    expect(screen.getAllByText('글라키').length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole('button', { name: '어종 공개' }));
    expect(screen.getAllByText('거북복').length).toBeGreaterThanOrEqual(1);
  });

  it('시상대는 참여자가 0명·1명이어도 2-1-3 3열을 유지하고 빈 자리에 기록 대기를 표시하며, 1~3위는 하단 내 순위 바를 숨긴다', async () => {
    apiMock.readEvents.mockResolvedValue({
      ...SAMPLE_SNAP,
      championship: {
        ...SAMPLE_SNAP.championship!,
        rank: 1,
        top: [{ rank: 1, userId: 'me', nickname: '나혼자일등', score: 520, look: null, me: true }],
      },
      draw: {
        ...SAMPLE_SNAP.draw!,
        rank: null,
        top: [],
      },
    });
    renderModal();

    await waitFor(() => expect(screen.getByText('강태공 선수권 대회')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /강태공 선수권 대회/ }));
    const champPodium = screen.getByLabelText('순위 시상대');
    expect([...champPodium.querySelectorAll('[data-place]')].map(el => el.getAttribute('data-place'))).toEqual(['2', '1', '3']);
    expect(within(champPodium).getByText('나혼자일등')).toBeInTheDocument();
    expect(within(champPodium).getAllByText('기록 대기')).toHaveLength(2);
    expect(screen.queryByLabelText('내 순위')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '목록' }));
    fireEvent.click(screen.getByRole('button', { name: /천하제일 행운왕/ }));
    const emptyPodium = screen.getByLabelText('순위 시상대');
    expect([...emptyPodium.querySelectorAll('[data-place]')].map(el => el.getAttribute('data-place'))).toEqual(['2', '1', '3']);
    expect(within(emptyPodium).getAllByText('기록 대기')).toHaveLength(3);
    expect(screen.queryByLabelText('내 순위')).toBeNull();
  });

  it('이벤트 3 행운왕 상세에서 서브탭 안내, 금빛 네잎클로버 순위 시상대, 5일 점괘판 3상태를 표시한다', async () => {
    apiMock.readEvents.mockResolvedValue({
      ...SAMPLE_SNAP,
      now: '2026-12-03T12:00:00.000Z',
      events: SAMPLE_SNAP.events.map(ev => ev.kind === 'draw' ? {
        ...ev,
        startsAt: '2026-11-30T19:00:00.000Z',
        endsAt: '2026-12-05T19:00:00.000Z',
      } : ev),
      draw: {
        ...SAMPLE_SNAP.draw!,
        days: [
          { day: '2026-12-01', kind: 'grand-catch', index: 5, score: 97 },
          { day: '2026-12-03', kind: 'fish', index: 5, score: 88 },
        ],
        rank: 4,
        top: [
          ...SAMPLE_SNAP.draw!.top.map(r => ({ ...r, me: false })),
          { rank: 4, userId: 'me', nickname: '내캐릭터', score: 150, look: null, me: true },
        ],
      },
    });
    renderModal();

    await waitFor(() => expect(screen.getByText('천하제일 행운왕')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /천하제일 행운왕/ }));

    expect(screen.getByText('매일 모은 오늘의 운세 누적 점수로 순위를 겨뤄요.')).toBeInTheDocument();
    const podium = screen.getByLabelText('순위 시상대');
    expect(podium.querySelector('[data-glyph="clover"]')).not.toBeNull();
    const fourthRow = screen.getByText('4위').parentElement!;
    expect(fourthRow.querySelector('[data-glyph="clover"]')).not.toBeNull();
    const myBar = screen.getByLabelText('내 순위');
    expect(myBar.querySelector('[data-glyph="clover"]')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '점괘판' }));
    expect(screen.getByText('오늘의 운세를 확인할 때마다 점괘판이 한 칸씩 채워져요.')).toBeInTheDocument();
    const board = screen.getByLabelText('행운 출석 점괘판');
    expect(board.children).toHaveLength(5);
    expect(within(board).getByText('12/1')).toBeInTheDocument();
    expect(within(board).getByText('97')).toBeInTheDocument();
    expect(within(board).getAllByText('미출석')).toHaveLength(1);
    expect(within(board).getAllByText('예정')).toHaveLength(2);
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
