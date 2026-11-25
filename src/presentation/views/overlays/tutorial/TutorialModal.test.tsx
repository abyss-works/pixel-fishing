// 튜토리얼 창은 먼저 뜰 안내 창(업데이트 소식, 미끼 환불 안내)이 끝난 뒤에 뜬다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { resetTutorialSession, useTutorialTrigger } from '../../../../features/tutorial/service/tutorial';
import { markPromptsAnswered, resetAnnouncements, setLastSeenVersion } from '../../../../platform/adapters/announcements';
import { resetWhatsNewSession } from '../../../../features/announcements/service/whatsNew';
import { SETTING_PROMPTS } from '../../../../features/announcements/model/whatsNew';
import { APP_VERSION } from '../../../../version';
import type { TutorialId } from '../../../../game/content/tutorials';
import type { GameAction } from '../../../../game/rules/actions';
import { newState } from '../../../../game/rules/logic';
import WhatsNewModal from '../whats-new/WhatsNewModal';
import TutorialModal from './TutorialModal';

function Harness({
  after = false,
  triggers = ['village'],
  seen = [],
  dispatch = () => {},
}: {
  after?: boolean;
  triggers?: readonly TutorialId[];
  seen?: readonly string[];
  dispatch?: (a: GameAction) => void;
}) {
  useTutorialTrigger('village', triggers.includes('village'));
  useTutorialTrigger('sea', triggers.includes('sea'));
  useTutorialTrigger('bounty-quests', triggers.includes('bounty-quests'));
  useTutorialTrigger('bounty-named', triggers.includes('bounty-named'));
  return (
    <>
      <WhatsNewModal game={{ ...newState(), fame: 120 }} ready />
      <TutorialModal seen={seen} ready after={after} dispatch={dispatch} />
    </>
  );
}

beforeEach(() => {
  localStorage.clear();
  resetAnnouncements();
  resetWhatsNewSession();
  resetTutorialSession();
  // 소식 창이 뜰 차례가 아닌 접속 - 보지 않은 소식과 질문이 없다
  setLastSeenVersion(APP_VERSION);
  markPromptsAnswered(SETTING_PROMPTS.map(p => p.id));
});
afterEach(cleanup);

describe('튜토리얼 창의 차례', () => {
  it('미끼 환불 안내가 남아 있으면 뜨지 않고, 끝나면 뜬다', () => {
    const { rerender } = render(<Harness after />);
    expect(screen.queryByText('마을에 오신 걸 환영해요')).not.toBeInTheDocument();
    act(() => rerender(<Harness after={false} />));
    expect(screen.getByText('마을에 오신 걸 환영해요')).toBeInTheDocument();
  });
});

describe('튜토리얼 카드 덱', () => {
  it('이전/다음으로 카드를 넘기고 마지막 장 알겠어요 버튼으로 닫으며 본 기록을 남긴다', () => {
    const dispatch = vi.fn();
    render(<Harness triggers={['village']} dispatch={dispatch} />);

    expect(screen.getByRole('dialog', { name: '마을에 오신 걸 환영해요' })).toBeInTheDocument();
    expect(screen.getByText('1 / 4')).toBeInTheDocument();
    expect(screen.getByText('마을 안에서 이동하기')).toBeInTheDocument();

    const prev = screen.getByRole('button', { name: '이전' });
    expect(prev).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByText('2 / 4')).toBeInTheDocument();
    expect(screen.getByText('어군 앞에서 찌 던지기')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이전' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: '이전' }));
    expect(screen.getByText('1 / 4')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByText('3 / 4')).toBeInTheDocument();
    expect(screen.getByText('가만히 두는 방치 낚시')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByText('4 / 4')).toBeInTheDocument();
    expect(screen.getByText('집의 궤짝과 작업대')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다음' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '알겠어요' }));
    expect(screen.queryByRole('dialog', { name: '마을에 오신 걸 환영해요' })).not.toBeInTheDocument();
    expect(dispatch).toHaveBeenCalledWith({ type: 'seeTutorial', id: 'village' });
  });

  it('건너뛰기·Esc·닫기 버튼·백드롭으로 닫아도 본 기록을 남기고 다음 튜토리얼은 1장부터 시작한다', () => {
    const dispatch = vi.fn();
    render(<Harness triggers={['village', 'sea', 'bounty-quests', 'bounty-named']} dispatch={dispatch} />);

    // village: 건너뛰기로 닫기
    expect(screen.getByText('1 / 4')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.click(screen.getByRole('button', { name: '건너뛰기' }));
    expect(dispatch).toHaveBeenNthCalledWith(1, { type: 'seeTutorial', id: 'village' });

    // sea (5장): 다음으로 넘기고 희귀 등급색 확인 후 Esc로 닫기
    expect(screen.getByRole('dialog', { name: '바다에 나왔어요' })).toBeInTheDocument();
    expect(screen.getByText('1 / 5')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByText('3 / 5')).toBeInTheDocument();
    const rare = screen.getByText('희귀');
    expect(rare).toHaveAttribute('data-rarity', 'rare');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dispatch).toHaveBeenNthCalledWith(2, { type: 'seeTutorial', id: 'sea' });

    // bounty-quests (3장): X 닫기 버튼
    expect(screen.getByRole('dialog', { name: '일반 의뢰' })).toBeInTheDocument();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('닫기'));
    expect(dispatch).toHaveBeenNthCalledWith(3, { type: 'seeTutorial', id: 'bounty-quests' });

    // bounty-named (5장): 백드롭 클릭으로 닫기 + 네임드 강조 확인
    const namedDialog = screen.getByRole('dialog', { name: '네임드 토벌' });
    expect(namedDialog).toBeInTheDocument();
    expect(screen.getByText('1 / 5')).toBeInTheDocument();
    expect(screen.getByText('네임드', { selector: '.text-epic' })).toBeInTheDocument();
    fireEvent.click(namedDialog.parentElement!);
    expect(dispatch).toHaveBeenNthCalledWith(4, { type: 'seeTutorial', id: 'bounty-named' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('4종 튜토리얼 총 17장의 카드 제목을 모두 전환하며 확인할 수 있다', () => {
    const decks: ReadonlyArray<{ id: TutorialId; title: string; subs: readonly string[] }> = [
      {
        id: 'village',
        title: '마을에 오신 걸 환영해요',
        subs: ['마을 안에서 이동하기', '어군 앞에서 찌 던지기', '가만히 두는 방치 낚시', '집의 궤짝과 작업대'],
      },
      {
        id: 'sea',
        title: '바다에 나왔어요',
        subs: ['구역마다 다른 바다 물고기', '구역 진입에 필요한 배', '해역별 낚싯대 파워 요구치', '항구 정비와 마을 여객선', '미니맵으로 세계지도 보기'],
      },
      {
        id: 'bounty-quests',
        title: '일반 의뢰',
        subs: ['수주 뒤 잡은 물고기 집계', '수배판에서 의뢰 완료하기', '하루 상한과 의뢰 초기화'],
      },
      {
        id: 'bounty-named',
        title: '네임드 토벌',
        subs: ['토벌 수주 중 네임드 조우', '바다에 남는 흔적 카드', '추적 뒤 이어지는 결투', '다른 탭에서도 조우 알림', '교환 재료로 유물 얻기'],
      },
    ];
    expect(decks.reduce((acc, d) => acc + d.subs.length, 0)).toBe(17);

    render(<Harness triggers={['village', 'sea', 'bounty-quests', 'bounty-named']} />);
    for (const deck of decks) {
      expect(screen.getByRole('dialog', { name: deck.title })).toBeInTheDocument();
      deck.subs.forEach((sub, idx) => {
        expect(screen.getByText(`${idx + 1} / ${deck.subs.length}`)).toBeInTheDocument();
        expect(screen.getByText(sub)).toBeInTheDocument();
        if (idx < deck.subs.length - 1) {
          fireEvent.click(screen.getByRole('button', { name: '다음' }));
        } else {
          fireEvent.click(screen.getByRole('button', { name: '알겠어요' }));
        }
      });
    }
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
