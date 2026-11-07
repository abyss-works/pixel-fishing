import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bountyById } from '../../../../game/content/bounties';
import { newState } from '../../../../game/rules/logic';
import type { BountySnapshot } from '../../../../features/bounty/model/types';
import { fmtGold } from '../../../ui/format';

let snap: BountySnapshot | null = null;
let loaded = true;
vi.mock('../../../../features/bounty/service/useBounty', () => ({
  useBounty: () => ({ snap, loaded, refresh: () => {} }),
}));

import QuestInfoModal from './QuestInfoModal';

const general = bountyById('pacific-easy-common')!;
const named = bountyById('pacific-named-megalodon')!;
const snapshot = (over: Partial<BountySnapshot> = {}): BountySnapshot => ({
  clearsToday: { general: 0, named: 0 }, progress: [], tickets: [], ...over,
});
const open = () => render(<QuestInfoModal game={newState()} onClose={() => {}} />);
const dialog = () => screen.getByRole('dialog');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-13T00:01:00.000Z'));
  snap = snapshot();
  loaded = true;
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('의뢰 창', () => {
  it('제목 "의뢰" 아래 고정 정보 줄에 오늘 남은 클리어를 두고, 그 아래에 일반 의뢰, 네임드 토벌 두 탭이 있다', () => {
    snap = snapshot({ clearsToday: { general: 0, named: 1 } });
    open();
    expect(within(dialog()).getByText('의뢰')).toBeInTheDocument();
    const fixed = screen.getByText('오늘 남은 클리어').closest('[class*="h-10"]')!;
    expect(within(fixed as HTMLElement).getByLabelText('오늘 남은 일반 의뢰')).toHaveTextContent('1/1');
    expect(within(fixed as HTMLElement).getByLabelText('오늘 남은 네임드 토벌')).toHaveTextContent('0/1');
    expect(fixed.compareDocumentPosition(screen.getByRole('button', { name: '일반 의뢰' })))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByRole('button', { name: '네임드 토벌' })).toBeInTheDocument();
  });

  it('받은 의뢰가 없어도 열리고, 빈 카드가 수배판이 있는 항구를 안내한다', () => {
    open();
    expect(screen.getByText('수주한 일반 의뢰가 없어요.')).toBeInTheDocument();
    expect(dialog()).toHaveTextContent('수배판은 부산항, 마닐라항, 콜롬보항, 투아마시나항에 있어요.');
    fireEvent.click(screen.getByRole('button', { name: '네임드 토벌' }));
    expect(screen.getByText('수주한 네임드 토벌이 없어요.')).toBeInTheDocument();
    expect(dialog()).toHaveTextContent('수배판은 부산항, 마닐라항, 콜롬보항, 투아마시나항에 있어요.');
  });

  it('탭은 한 장씩 보인다 - 일반 의뢰가 먼저고, 네임드 토벌 탭을 누르면 바뀐다', () => {
    snap = snapshot({ progress: [{ questId: general.id, progress: 0 }, { questId: named.id, progress: 0 }] });
    open();
    expect(screen.getByText('태평양 쉬움 의뢰')).toBeInTheDocument();
    expect(screen.queryByText('???')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '네임드 토벌' }));
    expect(screen.queryByText('태평양 쉬움 의뢰')).not.toBeInTheDocument();
    expect(screen.getByText('???')).toBeInTheDocument();
  });

  it('진행 중인 일반 의뢰는 이름, 목표, 진행도, 보상, 마치는 곳을 보인다', () => {
    snap = snapshot({ progress: [{ questId: general.id, progress: 3 }] });
    open();
    const card = dialog();
    expect(card).toHaveTextContent('태평양 쉬움 의뢰');
    expect(card).toHaveTextContent(`${general.count}마리`);
    expect(within(card).getByRole('meter', { name: '진행' })).toHaveAttribute('aria-valuenow', '3');
    expect(card).toHaveTextContent(`3/${general.count}`);
    expect(card).toHaveTextContent(fmtGold(general.reward));
    expect(card).toHaveTextContent('마치는 곳');
    expect(card).toHaveTextContent('부산항 수배판');
  });

  it('진행 중인 네임드 토벌은 미발견이면 ???, 나타나는 곳, 보상, 교환 재료, 흔적 남은 시간, 마치는 곳을 보인다', () => {
    snap = snapshot({
      progress: [{ questId: named.id, progress: 0 }],
      tickets: [{ questId: named.id, issuedAt: '2026-10-13T00:00:00.000Z' }],
    });
    open();
    fireEvent.click(screen.getByRole('button', { name: '네임드 토벌' }));
    const card = dialog();
    expect(card).toHaveTextContent('???');
    expect(card).toHaveTextContent('나타나는 곳');
    expect(card).toHaveTextContent(fmtGold(named.reward));
    expect(card).toHaveTextContent('교환 재료');
    expect(card).toHaveTextContent('돌이 된 이빨');
    expect(card).toHaveTextContent('0/1');
    expect(card).toHaveTextContent('흔적');
    expect(card).toHaveTextContent('부산항 수배판');
  });

  it('도전권이라는 말은 화면에 쓰지 않는다 - 흔적으로 보인다', () => {
    snap = snapshot({
      progress: [{ questId: named.id, progress: 0 }],
      tickets: [{ questId: named.id, issuedAt: '2026-10-13T00:00:00.000Z' }],
    });
    open();
    fireEvent.click(screen.getByRole('button', { name: '네임드 토벌' }));
    expect(dialog().textContent).not.toContain('도전권');
  });

  it('흔적이 없으면 흔적 줄을 그리지 않는다', () => {
    snap = snapshot({ progress: [{ questId: named.id, progress: 0 }] });
    open();
    fireEvent.click(screen.getByRole('button', { name: '네임드 토벌' }));
    expect(dialog().textContent).not.toContain('흔적');
  });

  it('포기 버튼을 두지 않는다 - 어느 탭에도 없다', () => {
    snap = snapshot({ progress: [{ questId: general.id, progress: 1 }, { questId: named.id, progress: 0 }] });
    open();
    for (const tab of ['일반 의뢰', '네임드 토벌']) {
      fireEvent.click(screen.getByRole('button', { name: tab }));
      expect(screen.queryByRole('button', { name: /포기/ })).not.toBeInTheDocument();
      expect(dialog().textContent).not.toContain('포기');
    }
  });

  it('불러오는 중에는 빈 카드가 아니라 불러오는 중이라고 하고, 오프라인이면 그렇게 안내한다', () => {
    loaded = false;
    snap = null;
    const view = open();
    expect(dialog()).toHaveTextContent('불러오는 중이에요.');
    expect(dialog()).not.toHaveTextContent('수주한 일반 의뢰가 없어요.');
    loaded = true;
    view.rerender(<QuestInfoModal game={newState()} onClose={() => {}} />);
    expect(dialog()).toHaveTextContent('오프라인에서는 의뢰를 볼 수 없어요.');
    expect(screen.getByLabelText('오늘 남은 일반 의뢰')).toHaveTextContent('-');
  });

  it('닫기를 누르면 닫는다', () => {
    const onClose = vi.fn();
    render(<QuestInfoModal game={newState()} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /닫기/ }));
    expect(onClose).toHaveBeenCalled();
  });
});
