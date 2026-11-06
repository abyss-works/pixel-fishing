import { useMemo, useState } from 'react';
import { REJECT_TEXT } from '../../../../game/rules/logic';
import type { GameState } from '../../../../game/rules/logic';
import { selectSalePreview } from '../../../../features/inventory/model/catalog';
import { selectBoatPurchaseResult } from '../../../../features/gameplay/model/facility';
import InstanceLine, { UnsizedLine } from '../../../ui/fish/InstanceLine';
import { toggleSellRow, useSellView } from '../../game/tabs/bag/bagView';
import type { GameAction } from '../../../../game/rules/actions';
import { when } from '../../../../shared/lib/when';
import type { DispatchResult, MaybePromise } from '../../../../features/gameplay/service/types';
import type { BaseId } from '../../../../game/content/places';
import { isBountyPort } from '../../../../game/content/bounties';
import { hatById } from '../../../../game/content/wardrobe';
import BountyPanel from '../bounty/BountyPanel';
import Button from '../../../ui/Button';
import CostLine from '../../../ui/CostLine';
import IconButton from '../../../ui/IconButton';
import DataTable from '../../../ui/DataTable';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import Note from '../../../ui/Note';
import PixelIcon from '../../../ui/PixelIcon';
import { fmtGold, josa } from '../../../ui/format';
import type { Notify } from '../../../ui/hud/messageFeed';
import { RarityText } from '../../../ui/fish/RarityTag';
import BoatPanel from './BoatPanel';
import RodPanel from './RodPanel';
import WardrobePanel from '../wardrobe/WardrobePanel';
import ShopPanel from './ShopPanel';
/** 열려 있는 정비 패널 — 거점의 시설 선택이 연다. null = 닫힘 */
export type ActionPanel = 'sell' | 'rod' | 'boat' | 'shop' | 'bounty' | 'wardrobe' | null;

interface Props {
  panel: Exclude<ActionPanel, null>;
  game: GameState;
  /** 수배판이 뜬 항구 — 수배 가구가 항구에만 있어 base가 항구일 때만 bounty가 열린다 */
  base?: BaseId;
  /** 일일 의뢰 해시 대상 — 없으면 로컬 고정값 */
  uid?: string | null;
  /** 상태 변경의 유일한 경로 (서버 권위 v0.5.0) — 판매/강화/구매는 서버(또는 로컬 리듀서)가 실행 */
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: Notify;
  onClose: () => void;
}

/** 수배판 창 높이: 가장 긴 탭(일반 의뢰 카드 셋)이 스크롤 없이 들어가는 480px로 고정하고, 스테이지가 그보다 낮으면 위아래 16px을 남긴다.
    좁은 화면에서는 내용 높이를 따른다 */
const BOUNTY_HEIGHT = 'h-[min(480px,calc(100%-32px))] max-[640px]:h-auto';
/** 옷장 창 높이: 미리보기 줄과 탭, 고정 높이의 아래 줄이 들어가는 560px로 고정한다. 좁은 화면에서는 내용 높이를 따른다 */
const WARDROBE_HEIGHT = 'h-[min(560px,calc(100%-32px))] max-[640px]:h-auto';

// 정비 상호작용(판매/강화/배)은 게임 스테이지 위 모달로 띄운다 — 정비 중에는 이동하지
// 않으므로 화면을 점유해도 자연스럽고, 사이드바 탭 흐름을 방해하지 않는다.
// 목록형 시설(낚싯대 강화, 조선소, 상점)은 920 폭에 왼쪽 목록과 오른쪽 상세(비교 표, 잔액, 확정 버튼)를 둔다.
// 수배판과 옷장은 탭이 있는 창이라 680 폭에 높이를 고정한다.
// busy: HTTP 왕복 동안 확정 버튼 잠금 — 더블클릭이 낙관 락 재시도로 이중 적용되는 것 방지.
export default function FacilityModal({ panel, game, dispatch, setToast, onClose, base, uid }: Props) {
  const [busy, setBusy] = useState(false);
  const run = (action: GameAction, onOk: (r: Extract<DispatchResult, { status: 'ok' }>) => void) => {
    if (busy) return;
    setBusy(true);
    when(dispatch(action), r => {
      setBusy(false);
      if (r.status === 'ok') onOk(r);
      else if (r.status === 'rejected') setToast(REJECT_TEXT[r.error], 'warn');
    });
  };

  return (
    <Modal layer="stage" xl={panel === 'rod' || panel === 'boat' || panel === 'shop'} md={panel === 'bounty' || panel === 'wardrobe'}
           className={panel === 'bounty' ? BOUNTY_HEIGHT : panel === 'wardrobe' ? WARDROBE_HEIGHT : undefined} onClose={onClose}>
      {panel === 'sell' && (
        <SellPanel game={game} onClose={onClose} busy={busy}
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
      {panel === 'shop' && (
        <ShopPanel game={game} onClose={onClose} busy={busy}
          onBuy={(baitId, count) => run({ type: 'buyBait', bait: baitId, count }, () => {
            setToast('미끼를 구매했어요! 가방 탭의 아이템에서 켤 수 있어요.', 'gold');
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
      {panel === 'bounty' && base !== undefined && isBountyPort(base) && (
        <ModalCard title="수배판" onClose={onClose} className="flex-1">
          <BountyPanel game={game} port={base} uid={uid ?? null} dispatch={dispatch} setToast={setToast} />
        </ModalCard>
      )}
    </Modal>
  );
}

// R1: 판매 확인 패널 — 기본 전부 선택, 해제한 것만 기록한다.
// 선택의 원자 단위는 **개체(uid)**다: 행 체크는 그 행 전부를 켜고 끄는 단축일 뿐이고,
// 줄을 펼치면 개체 하나씩 고를 수 있다. 같은 종이라도 큰 놈만 남기는 게 이 화면의 목적.
// 잠근 **개체**는 개별로 선택 불가(가방 탭에서 해제) — 같은 종 안에서도 섞일 수 있다.
function SellPanel({ game, onSell, onClose, busy }: {
  game: GameState; onSell: (uids: string[]) => void; onClose: () => void; busy: boolean;
}) {
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set()); // uid 단위
  const { collapsed } = useSellView(); // 판매 패널 펼침 — 기본 닫힘(가방과 동일), 가방 탭과 별개 저장소
  const { rows, soldUids, total, lockedCount } = useMemo(
    () => selectSalePreview(game.bag, excluded), [game.bag, excluded],
  );

  const flip = (set: Set<string>, keys: string[], on: boolean) => {
    const next = new Set(set);
    for (const k of keys) { if (on) next.delete(k); else next.add(k); }
    return next;
  };
  const toggleRow = (uids: string[], allOn: boolean) =>
    setExcluded(prev => flip(prev, uids, !allOn));
  const toggleOne = (uid: string) =>
    setExcluded(prev => flip(prev, [uid], prev.has(uid)));

  if (rows.length === 0) {
    return (
      <ModalCard title={`판매: 가방 (${game.bag.length}마리)`} onClose={onClose}>
        <Note>가방이 비어 있어요.<br />어군을 찾아 낚시해 보세요.</Note>
      </ModalCard>
    );
  }

  return (
    <ModalCard title={`판매: 가방 (${game.bag.length}마리)`} onClose={onClose}
      footer={<>
        {lockedCount > 0 && (
          <Note className="my-0">잠근 개체 {lockedCount}마리는 팔리지 않아요.<br />잠금은 가방 탭에서 풀 수 있어요.</Note>
        )}
        <CostLine have={game.gold} delta={total} />
      </>}
      confirm={
        <Button variant="primary" disabled={total === 0 || busy} onClick={() => onSell(soldUids)}>
          판매 (+{fmtGold(total)})
        </Button>
      }>
      {/* ── 어종 목록 — 내부 스크롤. 높이 = min(≈30행, 모달 가용 높이) ──
          개수가 늘어도 확정 영역이 화면 밖으로 밀려나지 않게 목록만 굴린다(v0.6.4).
          840px ≈ 행 30개(28px) — flex(min-h-0)가 먼저 작아지므로 작은 화면에선
          가용 높이가 이긴다("둘 중 작은 값"). */}
      <div className="pf-scroll overflow-y-auto flex-1 min-h-0 max-h-[840px] pr-1">
        <DataTable>
          <thead><tr><th>판매</th><th>어종</th><th>등급</th><th>수량</th><th>소계</th></tr></thead>
          <tbody>
          {rows.map(({ key, fish, name, items, sized, unsized, sellable, maxByForm,
                      selectedCount, allSelected, selectedSubtotal }) => {
            const locked = sellable.length === 0; // 이 종 개체가 전부 잠김
            const on = selectedCount;
            const allOn = allSelected;
            const glyph = on === 0 ? 'checkOff' : allOn ? 'checkOn' : 'checkPartial';
            const expanded = collapsed.has(key);
            return [
              <tr key={key} className={locked || on === 0 ? 'text-text-dim' : ''}>
                <td>
                  {locked ? (
                    <span className="text-text-dim cursor-default" title="잠금은 가방 탭에서 풀 수 있어요">
                      <PixelIcon glyph="lock" size={13} />
                    </span>
                  ) : (
                    <IconButton glyph={glyph} size={13}
                              tone={on > 0 ? 'gold' : 'dim'}
                              className="p-0 leading-none"
                              aria-label={`${name} 판매 ${allOn ? '해제' : '선택'}`}
                              onClick={() => toggleRow(sellable.map(i => i.uid), allOn)} />
                  )}
                </td>
                <td>
                  <IconButton glyph={expanded ? 'caretDown' : 'caretRight'} size={9}
                              className="p-0 text-inherit gap-1"
                              aria-label={`${name} 개체 ${expanded ? '접기' : '펼치기'}`}
                              aria-expanded={expanded}
                              onClick={() => toggleSellRow(key)}>
                    {name}
                  </IconButton>
                </td>
                <td><RarityText rarity={fish.rarity} /></td>
                <td className="pf-accent">
                  {on === items.length ? `×${items.length}` : `${on}/${items.length}`}
                </td>
                <td className="pf-accent">
                  {on > 0 && !locked ? fmtGold(selectedSubtotal) : '0G'}
                </td>
              </tr>,
              expanded ? (
                <tr key={`${key}-items`}>
                  <td colSpan={5} className="p-0 bg-bg">
                    {sized.map(inst => (
                      <InstanceLine key={inst.uid} inst={inst} fish={fish}
                                    best={inst.size !== null && inst.size === maxByForm[inst.form]}
                                    checked={!inst.locked && !excluded.has(inst.uid)}
                                    onToggle={inst.locked ? undefined : () => toggleOne(inst.uid)}>
                        <PixelIcon size={11}
                                   className={!inst.locked && !excluded.has(inst.uid) ? 'text-gold' : 'text-text-dim'}
                                   glyph={inst.locked ? 'lock'
                                     : excluded.has(inst.uid) ? 'checkOff' : 'checkOn'} />
                      </InstanceLine>
                    ))}
                    {/* 크기 미상은 묶음 단위로 고른다 — 구별할 정보가 없으니 개별 선택이 무의미하다 */}
                    {unsized.map(g => {
                      const on = g.selectedCount;
                      const glyph = g.free.length === 0 ? 'lock'
                        : on === 0 ? 'checkOff' : g.allSelected ? 'checkOn' : 'checkPartial';
                      return (
                        <UnsizedLine key={g.form} count={g.items.length} form={g.form}
                                     locked={g.free.length === 0}
                                     checked={on > 0}
                                     onToggle={g.free.length === 0
                                       ? undefined
                                       : () => toggleRow(g.free.map(i => i.uid), g.allSelected)}>
                          <PixelIcon size={11} glyph={glyph}
                                     className={on > 0 ? 'text-gold' : 'text-text-dim'} />
                        </UnsizedLine>
                      );
                    })}
                  </td>
                </tr>
              ) : null,
            ];
          })}
          </tbody>
        </DataTable>
      </div>
    </ModalCard>
  );
}
