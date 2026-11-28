import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FISH, newState, priceOf } from '../../../../../game/rules/logic';
import { defaultZoneOfRegion, zoneById } from '../../../../../game/content/zones';
import { setCurrentSpot } from '../../../../../game/world/currentSpot';
import { fmtCompact3 } from '../../../../ui/format';
import VRegion from './VRegion';

afterEach(() => {
  cleanup();
  act(() => {
    setCurrentSpot(null);
  });
});

function show(over: Partial<ReturnType<typeof newState>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const game = { ...newState(), ...over };
  render(
    <QueryClientProvider client={client}>
      <VRegion region="village" game={game} />
    </QueryClientProvider>,
  );
}

describe('VRegion', () => {
  it('최상단 2줄 요약 구역 이야기 상자와 자세히 버튼 → 등급 분포 → 가까운 어군 순서로 배치하고, 자세히 클릭 시 두루마리 오버레이에 전체 원문(항해 팁 제외)을 보이며 닫기 버튼과 Escape로 닫힌다', () => {
    show();
    const title = screen.getByRole('heading', { name: '고향 마을' });
    expect(title).toBeInTheDocument();
    expect(screen.queryByText('지역 안내')).toBeNull();
    expect(screen.queryByText('여기서 할 수 있는 것')).toBeNull();

    const detailBtn = screen.getByRole('button', { name: '자세히' });
    expect(detailBtn).toBeInTheDocument();
    const villageZone = zoneById(defaultZoneOfRegion('village'))!;
    const firstPart = villageZone.lore.split('\n\n')[0].slice(0, 20);
    const summaryParagraph = screen.getByText(new RegExp(firstPart));
    expect(summaryParagraph.className).toContain('line-clamp-2');

    const tableHeading = screen.getByRole('heading', { name: /^등급 분포/ });
    const nearbyHeading = screen.getByRole('heading', { name: '가까운 어군' });
    expect(title.compareDocumentPosition(tableHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tableHeading.compareDocumentPosition(nearbyHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(detailBtn);
    const dialog = screen.getByRole('dialog', { name: '고향 마을' });
    expect(dialog).toHaveTextContent(villageZone.tagline);
    for (const part of villageZone.lore.split('\n\n').filter(Boolean)) {
      expect(dialog).toHaveTextContent(part);
    }
    expect(dialog).not.toHaveTextContent('항해 팁');

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('dialog', { name: '고향 마을' })).toBeNull();

    fireEvent.click(detailBtn);
    expect(screen.getByRole('dialog', { name: '고향 마을' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '고향 마을' })).toBeNull();
  });

  it('사거리 내 어군에서는 4등급 묶음(일반→희귀→영웅→전설) 3열 격자로 보이고 발견 어종은 축약 가격을 표시하며 누르면 도감 상세가 열린다', () => {
    const crucian = FISH.find(f => f.id === 'crucian')!;
    act(() => setCurrentSpot('pond'));
    show({ dex: { crucian: { normal: { count: 1, maxSize: 18, first: null } } } });
    const infoHeading = screen.getByRole('heading', { name: /^어군 정보/ });
    const tableHeading = screen.getByRole('heading', { name: /^등급 분포/ });
    expect(tableHeading.compareDocumentPosition(infoHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const unknownCards = screen.getAllByText('???').map(el => el.parentElement!);
    expect(unknownCards.length).toBeGreaterThan(0);
    const knownBtn = screen.getByRole('button', { name: /붕어/ });
    expect(knownBtn.parentElement?.className).toContain('grid-cols-3');
    expect(knownBtn.className).toContain('min-h-[76px]');
    expect(unknownCards[0].className).toContain('min-h-[76px]');
    expect(knownBtn).toHaveTextContent(fmtCompact3(priceOf(crucian, 'normal')));
    expect(unknownCards[0]).not.toHaveTextContent(/\d/);

    fireEvent.click(knownBtn);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('붕어');
    expect(dialog).toHaveTextContent('표본');
  });

  it('돌연변이만 발견한 어종은 돌연변이 이름으로 보이고 상세가 돌연변이 폼으로 열린다', () => {
    const crucian = FISH.find(f => f.id === 'crucian')!;
    act(() => setCurrentSpot('pond'));
    show({ dex: { crucian: { variant: { count: 1, maxSize: 18, first: null } } } });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(crucian.variant.name) }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(crucian.variant.name);
    expect(dialog).toHaveTextContent('돌연변이 2/');
  });
});
