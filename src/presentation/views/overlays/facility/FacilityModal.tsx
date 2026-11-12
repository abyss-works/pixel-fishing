import { useState } from 'react';
import { REJECT_TEXT } from '../../../../game/rules/logic';
import type { GameState } from '../../../../game/rules/logic';
import { selectBoatPurchaseResult } from '../../../../features/gameplay/model/facility';
import type { GameAction } from '../../../../game/rules/actions';
import { when } from '../../../../shared/lib/when';
import type { DispatchResult, MaybePromise } from '../../../../features/gameplay/service/types';
import type { BaseId } from '../../../../game/content/places';
import { isBountyPort } from '../../../../game/content/bounties';
import { hatById } from '../../../../game/content/wardrobe';
import BountyPanel from '../bounty/BountyPanel';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import { fmtGold, josa } from '../../../ui/format';
import type { Notify } from '../../../ui/hud/messageFeed';
import BoatPanel from './BoatPanel';
import RodPanel from './RodPanel';
import KitchenPanel from './KitchenPanel';
import SaleWindow from './SaleWindow';
import WardrobePanel from '../wardrobe/WardrobePanel';
/** 열려 있는 정비 패널 — 거점의 시설 선택이 연다. null = 닫힘 */
export type ActionPanel = 'sell' | 'rod' | 'boat' | 'bounty' | 'wardrobe' | 'kitchen' | null;

interface Props {
  panel: Exclude<ActionPanel, null>;
  game: GameState;
  /** 수배판이 뜬 항구 — 수배 가구가 항구에만 있어 base가 항구일 때만 bounty가 열린다 */
  base?: BaseId;
  /** 일일 의뢰 해시 대상 — 없으면 로컬 고정값 */
  uid?: string | null;
  /** 길드 판매가 보너스 비율 - 서버가 알려 준 값. 길드가 없으면 0 */
  sellBonus: number;
  /** 게스트 여부 - 게스트에게는 판매 창의 기운 얻기 탭이 잠긴다 */
  guest?: boolean;
  /** 상태 변경의 유일한 경로 (서버 권위 v0.5.0) — 판매/강화/구매는 서버(또는 로컬 리듀서)가 실행 */
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: Notify;
  onClose: () => void;
}

// 정비 상호작용(판매/강화/배)은 게임 스테이지 위 모달로 띄운다 — 정비 중에는 이동하지
// 않으므로 화면을 점유해도 자연스럽고, 사이드바 탭 흐름을 방해하지 않는다.
// 목록형 시설(낚싯대 강화, 조선소)은 920 폭에 왼쪽 목록과 오른쪽 상세(비교 표, 잔액, 확정 버튼)를 둔다.
// 수배판과 옷장은 탭이 있는 창이라 680 폭에 높이를 고정한다. 부엌과 판매 창은 탭이 있는 목록형 창이라 920 폭에 높이를 고정한다.
// busy: HTTP 왕복 동안 확정 버튼 잠금 — 더블클릭이 낙관 락 재시도로 이중 적용되는 것 방지.
export default function FacilityModal({ panel, game, dispatch, setToast, onClose, base, uid, sellBonus, guest = false }: Props) {
  const [busy, setBusy] = useState(false);
  const run = (action: GameAction, onOk?: (r: Extract<DispatchResult, { status: 'ok' }>) => void) => {
    if (busy) return;
    setBusy(true);
    when(dispatch(action), r => {
      setBusy(false);
      if (r.status === 'ok') onOk?.(r);
      else if (r.status === 'rejected') setToast(REJECT_TEXT[r.error], 'warn');
    });
  };

  return (
    // 높이: 수배판은 가장 긴 탭(일반 의뢰 카드 셋)이 스크롤 없이 들어가는 480px, 옷장은 미리보기 줄과 탭, 고정 높이의 아래 줄이 들어가는 560px,
    // 부엌과 판매 창은 (정보 줄과) 탭 아래 두 열이 들어가는 560px로 고정하고, 모바일 레이아웃에서도 탭과 상태에 상관없이 가용 높이로 고정한다.
    // 수배판과 옷장은 모바일 레이아웃에서 내용 높이를 따른다.
    <Modal layer="stage" xl={panel === 'rod' || panel === 'boat' || panel === 'kitchen' || panel === 'sell'} md={panel === 'bounty' || panel === 'wardrobe'}
           height={panel === 'bounty' ? 480 : panel === 'wardrobe' || panel === 'kitchen' || panel === 'sell' ? 560 : undefined}
           mobileFixed={panel === 'kitchen' || panel === 'sell'} onClose={onClose}>
      {panel === 'sell' && base !== undefined && (
        <SaleWindow game={game} base={base} guest={guest} sellBonus={sellBonus} busy={busy} act={run} setToast={setToast} onClose={onClose}
          onSell={uids => run({ type: 'sell', uids }, r => {
            onClose();
            setToast(`물고기를 팔아 ${fmtGold(r.result.type === 'sell' ? r.result.gold : 0)}를 벌었어요!`, 'gold');
          })} />
      )}
      {panel === 'rod' && (
        <RodPanel game={game} onClose={onClose} busy={busy}
          onUpgrade={() => run({ type: 'upgradeRod' }, r => {
            setToast(`낚싯대를 강화했어요! 지금 Lv.${r.state.rod}이에요. 입질이 빨라지고 파워도 올라요.`, 'gold');
          })} />
      )}
      {panel === 'boat' && (
        <BoatPanel game={game} onClose={onClose} busy={busy}
          onBuy={() => run({ type: 'buyBoat' }, r => {
            const { boatName, openedSpots } = selectBoatPurchaseResult(r.state.boat);
            onClose();
            setToast(r.state.boat === 1
              ? `${josa(boatName, '을/를')} 구매했어요! 이제 포구에서 대양으로 나갈 수 있어요.`
              : `${josa(boatName, '을/를')} 구매했어요! ${openedSpots.length > 0 ? `배가 더 빨라졌고 [${openedSpots.map(spot => spot.name).join(', ')}] 해역이 열렸어요.` : '배가 더 빠르고 튼튼해졌어요.'}`, 'gold');
          })} />
      )}
      {panel === 'wardrobe' && (
        <WardrobePanel game={game} busy={busy} onClose={onClose}
          onChangeClothes={(shirt, pants) => run({ type: 'changeClothes', shirt, pants }, () => {
            setToast('옷을 갈아입었어요.');
          })}
          onBuyHat={hatId => run({ type: 'buyHat', hat: hatId }, () => {
            setToast(`${josa(hatById(hatId)?.name ?? '', '을/를')} 샀어요! 이제 쓸 수 있어요.`, 'gold');
          })}
          onWearHat={hatId => run({ type: 'wearHat', hat: hatId }, () => {
            setToast(hatId === null ? '모자를 벗었어요.' : `${josa(hatById(hatId)?.name ?? '', '을/를')} 썼어요.`);
          })} />
      )}
      {panel === 'kitchen' && (
        <KitchenPanel game={game} busy={busy} act={run} onClose={onClose} />
      )}
      {panel === 'bounty' && base !== undefined && isBountyPort(base) && (
        <ModalCard title="수배판" onClose={onClose} fixed>
          <BountyPanel game={game} port={base} uid={uid ?? null} dispatch={dispatch} setToast={setToast} />
        </ModalCard>
      )}
    </Modal>
  );
}
