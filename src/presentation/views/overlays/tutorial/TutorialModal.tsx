import { useState } from 'react';
import type { ReactNode } from 'react';
import type { TutorialId } from '../../../../game/content/tutorials';
import type { GameAction } from '../../../../game/rules/actions';
import { BOUNTY_DAILY_CAP, CHALLENGE_MISS_LIMIT } from '../../../../game/rules/balance';
import { GAME_DAY_RESET_TEXT } from '../../../../game/rules/time';
import { TICKET_EXPIRY_TEXT } from '../../../../game/rules/challenge';
import { useTutorial } from '../../../../features/tutorial/service/tutorial';
import { useWhatsNewPending } from '../../../../features/announcements/service/whatsNew';
import Button from '../../../ui/Button';
import { cx } from '../../../ui/cx';
import { HighlightRarityText } from '../../../ui/fish/RarityTag';
import Inset from '../../../ui/Inset';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import Subheading from '../../../ui/Subheading';
import TutorialCardVisual from './TutorialCardVisual';
import type { TutorialVisualKind } from './TutorialCardVisual';

interface TutorialCard {
  sub: string;
  caption: ReactNode;
  visual: TutorialVisualKind;
}

interface TutorialDeckDef {
  title: string;
  cards: readonly TutorialCard[];
}

// 튜토리얼 카드 덱(4종 17장) — 도움말 화면과 같은 규칙 서술·용어를 쓴다. 네임드·밤 어종 이름은 스포일러라 쓰지 않는다.
// 수치는 규칙 모듈에서 읽는다(밸런스가 바뀌어도 문구가 옛 숫자로 남지 않게).
const TUTORIAL: Record<TutorialId, TutorialDeckDef> = {
  village: {
    title: '마을에 오신 걸 환영해요',
    cards: [
      {
        sub: '마을 안에서 이동하기',
        caption: <><b>방향키</b>나 <b>WASD</b>로 마을을 걸어 다녀요.</>,
        visual: 'village-move',
      },
      {
        sub: '어군 앞에서 찌 던지기',
        caption: <><b>어군</b> 가까이에서 <b>스페이스</b>나 화면을 눌러 찌를 던져요.</>,
        visual: 'village-cast',
      },
      {
        sub: '가만히 두는 방치 낚시',
        caption: <>찌를 던져 두면 누르지 않아도 <b>방치 낚시</b>가 계속 이어져요.</>,
        visual: 'village-idle',
      },
      {
        sub: '집의 궤짝과 작업대',
        caption: <>집의 <b>궤짝</b>에서 물고기를 팔고 <b>작업대</b>에서 낚싯대를 강화해요.</>,
        visual: 'village-home',
      },
    ],
  },
  sea: {
    title: '바다에 나왔어요',
    cards: [
      {
        sub: '구역마다 다른 바다 물고기',
        caption: <>바다는 여러 <b>구역</b>으로 나뉘며 구역마다 사는 물고기가 달라요.</>,
        visual: 'sea-zones',
      },
      {
        sub: '구역 진입에 필요한 배',
        caption: <>다음 구역으로 넘어가려면 구역에 맞는 <b>배</b>가 필요해요.</>,
        visual: 'sea-boat',
      },
      {
        sub: '해역별 낚싯대 파워 요구치',
        caption: <>요구 <b>파워</b>가 모자라면 입질이 늦고 <HighlightRarityText text="희귀한 물고기" />가 잘 걸리지 않아요.</>,
        visual: 'sea-power',
      },
      {
        sub: '항구 정비와 마을 여객선',
        caption: <><b>항구</b>에서 팔고 정비하거나 <b>여객선</b>을 타고 마을로 돌아가요.</>,
        visual: 'sea-harbor',
      },
      {
        sub: '미니맵으로 세계지도 보기',
        caption: <>화면 구석의 <b>미니맵</b>을 누르면 <b>세계지도</b>가 열려요.</>,
        visual: 'sea-map',
      },
    ],
  },
  'bounty-quests': {
    title: '일반 의뢰',
    cards: [
      {
        sub: '수주 뒤 잡은 물고기 집계',
        caption: <><b>수주</b>한 뒤 해당 구역에서 잡은 물고기만 의뢰에 세어요.</>,
        visual: 'quest-accept',
      },
      {
        sub: '수배판에서 의뢰 완료하기',
        caption: <>물고기는 <b>가방</b>에 남기고 수배판에서 <b>완료</b>를 눌러 골드를 받아요.</>,
        visual: 'quest-complete',
      },
      {
        sub: '하루 상한과 의뢰 초기화',
        caption: <>하루 <b>{BOUNTY_DAILY_CAP}번</b> 클리어하며 <b>{GAME_DAY_RESET_TEXT}</b>에 못 채운 의뢰가 새로 바뀌어요.</>,
        visual: 'quest-reset',
      },
    ],
  },
  'bounty-named': {
    title: '네임드 토벌',
    cards: [
      {
        sub: '토벌 수주 중 네임드 조우',
        caption: <><HighlightRarityText text="네임드 토벌" />을 수주하고 그 구역에서 낚시하면 <b>방치 낚시</b> 중에도 드물게 마주쳐요.</>,
        visual: 'named-encounter',
      },
      {
        sub: '바다에 남는 흔적 카드',
        caption: <>조우하면 바다에 <b>흔적 카드</b>가 뜨고 <b>{TICKET_EXPIRY_TEXT}</b> 유지돼요.</>,
        visual: 'named-trace',
      },
      {
        sub: '추적 뒤 이어지는 결투',
        caption: <><b>추적</b>해 연 결투에서 <b>금색 칸</b>을 맞히며 도주 <b>{CHALLENGE_MISS_LIMIT}칸</b>이 차기 전에 토벌해요.</>,
        visual: 'named-duel',
      },
      {
        sub: '다른 탭에서도 조우 알림',
        caption: <>설정의 <b>알림</b>을 켜면 다른 탭을 보는 중에도 조우를 바로 알려 줘요.</>,
        visual: 'named-alert',
      },
      {
        sub: '교환 재료로 유물 얻기',
        caption: <>토벌 보상의 <b>교환 재료</b>는 수배판 <b>유물 탭</b>에서 유물로 바꿔요.</>,
        visual: 'named-relic',
      },
    ],
  },
};

function TutorialDeck({ deck, onClose }: { deck: TutorialDeckDef; onClose: () => void }) {
  const [page, setPage] = useState(0);
  const total = deck.cards.length;
  const card = deck.cards[page];
  const isFirst = page === 0;
  const isLast = page === total - 1;

  return (
    <ModalCard
      title={deck.title}
      onClose={onClose}
      fixed
      confirm={(
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={onClose}>건너뛰기</Button>
          <div className="flex items-center gap-1.5">
            <Button disabled={isFirst} onClick={() => setPage(p => Math.max(0, p - 1))}>이전</Button>
            <Button
              variant="primary"
              onClick={isLast ? onClose : () => setPage(p => Math.min(total - 1, p + 1))}
            >
              {isLast ? '알겠어요' : '다음'}
            </Button>
          </div>
        </div>
      )}
    >
      <div className="flex flex-1 min-h-0 flex-col justify-between gap-2.5 pt-1">
        <Subheading className="mb-0 text-center font-bold text-text">{card.sub}</Subheading>
        <Inset tone="deep" className="flex-1 min-h-0 flex items-center justify-center p-3">
          <TutorialCardVisual
            kind={card.visual}
            dailyCap={BOUNTY_DAILY_CAP}
            resetText={GAME_DAY_RESET_TEXT}
            expiryText={TICKET_EXPIRY_TEXT}
            missLimit={CHALLENGE_MISS_LIMIT}
          />
        </Inset>
        <p className="text-sm text-text text-center leading-relaxed min-h-[2.75rem] flex items-center justify-center [&_b]:text-gold">
          <span>{card.caption}</span>
        </p>
        <div className="flex items-center justify-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {deck.cards.map((c, i) => (
              <span key={c.visual} className={cx('w-2 h-2', i === page ? 'bg-gold' : 'bg-line')} />
            ))}
          </div>
          <span className="pf-accent text-xs text-text-dim">{page + 1} / {total}</span>
        </div>
      </div>
    </ModalCard>
  );
}

// 튜토리얼 창 — 트리거마다 한 번 뜬다. 업데이트 소식 창과 미끼 환불 안내가 끝난 뒤 차례로 뜨고, 닫으면 본 것으로 남는다.
export default function TutorialModal({ seen, ready, after, dispatch }: {
  seen: readonly string[];
  /** 먼저 뜰 다른 안내 창(미끼 환불 안내)이 남아 있으면 참 - 끝난 뒤에 띄운다 */
  after: boolean;
  /** 세이브가 준비됐는지 — 준비 전의 빈 상태로 판정하지 않게 */
  ready: boolean;
  dispatch: (action: GameAction) => unknown;
}) {
  const whatsNewPending = useWhatsNewPending();
  const { current, close } = useTutorial({ seen, ready, suspended: whatsNewPending || after, dispatch });
  if (!current) return null;
  return (
    <Modal layer="stage" sm height={400} onClose={close}>
      <TutorialDeck key={current} deck={TUTORIAL[current]} onClose={close} />
    </Modal>
  );
}
