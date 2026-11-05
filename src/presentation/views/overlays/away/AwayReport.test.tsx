// 방치 결과 알림 카드와 결과 창 — 요약을 문구·절로 보이고, 해당하지 않는 절은 뺀다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { summarizeAway } from '../../../../game/rules/away';
import type { AwayEvent } from '../../../../game/rules/away';
import { BOATS, newState } from '../../../../game/rules/logic';
import AwayCard from './AwayCard';
import AwayReportModal from './AwayReportModal';
import { awayLineText } from './awayText';

afterEach(cleanup);

const T0 = '2026-11-05T05:00:00.000Z';
const at = (min: number) => new Date(Date.parse(T0) + min * 60_000).toISOString();
const W = { from: T0, to: at(134), awayMs: 134 * 60_000 };
const caught = (min: number, fishId: string, over: Record<string, unknown> = {}): AwayEvent => ({
  type: 'catch', at: at(min),
  payload: { uid: `u${min}`, fishId, form: 'normal', size: 30, spot: 'sea', isNew: false, ...over },
});
const released: AwayEvent = {
  type: 'autoRelease', at: at(92),
  payload: { uids: ['r'], reason: 'bag-full', fish: [{ uid: 'r', fishId: 'mackerel', form: 'normal' }] },
};
const full = summarizeAway([
  caught(1, 'mackerel'), caught(2, 'seabream', { isNew: true, size: 48 }),
  caught(3, 'hairtail', { form: 'variant', isNew: true, size: 11 }), released,
], W);
const plain = summarizeAway([caught(1, 'mackerel'), caught(2, 'mackerel')], W);

describe('메시지 창 한 줄', () => {
  it('비운 시간과 잡은 수, 새 도감이 있으면 그 수를 쓴다', () => {
    expect(awayLineText(full)).toBe('2시간 14분 동안 3마리를 잡았어요. 새 도감 2종.');
    expect(awayLineText(plain)).toBe('2시간 14분 동안 2마리를 잡았어요.');
  });
});

describe('알림 카드', () => {
  it('비운 시간·잡은 수·명성·새 도감과 가방이 찬 한 줄을 보인다', () => {
    render(<AwayCard report={full} onClose={() => {}} onDetail={() => {}} />);
    const card = screen.getByRole('status', { name: '자리를 비운 사이' });
    expect(card).toHaveTextContent('2시간 14분');
    expect(card).toHaveTextContent('잡음 3');
    expect(card).toHaveTextContent(`명성 +${full.fame}`);
    expect(card).toHaveTextContent('새 도감 2');
    expect(card).toHaveTextContent('1시간 32분 만에 가방이 차서 1마리를 놓쳤어요.');
  });

  it('가방이 차지 않았으면 가방 줄이 없다. 닫기와 자세히를 알린다', () => {
    const onClose = vi.fn(), onDetail = vi.fn();
    render(<AwayCard report={plain} onClose={onClose} onDetail={onDetail} />);
    expect(screen.getByRole('status')).not.toHaveTextContent('가방');
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    fireEvent.click(screen.getByRole('button', { name: '자세히' }));
    expect(onClose).toHaveBeenCalled();
    expect(onDetail).toHaveBeenCalled();
  });
});

describe('결과 창', () => {
  const game = { ...newState(), boat: 1, fame: BOATS[1].fameReq - 500 };

  it('지표 타일·새 도감 카드·등급·가방·다음엔 절을 보인다', () => {
    render(<AwayReportModal report={full} game={game} onClose={() => {}} onOpenBag={() => {}} />);
    expect(screen.getByText('태평양', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('잡은 물고기').parentElement).toHaveTextContent('3');
    const dex = within(screen.getByRole('region', { name: '새로 도감에 오른 물고기' }));
    expect(dex.getByText('참돔').parentElement).toHaveTextContent('48.0cm');
    expect(dex.getByText('새 도감')).toBeInTheDocument();
    expect(dex.getByText('돌연변이')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '등급' })).toHaveTextContent('돌연변이 1마리 (33.3%)');
    expect(screen.getByRole('region', { name: '가방' })).toHaveTextContent('1시간 32분 만에 가득 참 · 이후 42분 동안 1마리');
    const tips = screen.getByRole('region', { name: '다음엔' });
    expect(tips).toHaveTextContent('이번엔 1시간 32분 만에 가방이 찼어요. 오래 비울 땐 먼저 팔고 가세요.');
    expect(tips).toHaveTextContent(`다음 배 ${BOATS[1].name}까지 명성 500 남았어요. 지금 속도면 약`);
  });

  it('새 도감·가방·조언이 없으면 그 절을 뺀다', () => {
    render(<AwayReportModal report={plain} game={{ ...newState(), boat: BOATS.length }} onClose={() => {}} onOpenBag={() => {}} />);
    expect(screen.queryByRole('region', { name: '새로 도감에 오른 물고기' })).toBeNull();
    expect(screen.queryByRole('region', { name: '가방' })).toBeNull();
    expect(screen.queryByRole('region', { name: '다음엔' })).toBeNull();
    expect(screen.getByRole('region', { name: '등급' })).toBeInTheDocument();
  });

  it('닫기와 가방 열기를 알린다', () => {
    const onClose = vi.fn(), onOpenBag = vi.fn();
    render(<AwayReportModal report={plain} game={newState()} onClose={onClose} onOpenBag={onOpenBag} />);
    fireEvent.click(screen.getByRole('button', { name: '가방 열기' }));
    fireEvent.click(screen.getAllByRole('button', { name: '닫기' }).at(-1)!);
    expect(onOpenBag).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
