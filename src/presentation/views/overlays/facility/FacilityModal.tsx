import { useMemo, useState } from 'react';
import { REJECT_TEXT } from '../../../../game/rules/logic';
import type { GameState } from '../../../../game/rules/logic';
import { BAIT_BUY_MAX } from '../../../../game/rules/balance';
import { selectSalePreview } from '../../../../features/inventory/model/catalog';
import {
  createBaitQuantities, normalizeBaitQuantity, selectBaitShopRows, selectBoatPurchasePreview,
  selectBoatPurchaseResult, selectRodUpgradePreview,
} from '../../../../features/gameplay/model/facility';
import InstanceLine, { UnsizedLine } from '../../../ui/fish/InstanceLine';
import { toggleSellRow, useSellView } from '../../game/tabs/bag/bagView';
import type { GameAction } from '../../../../game/rules/actions';
import { when } from '../../../../shared/lib/when';
import type { DispatchResult, MaybePromise } from '../../../../features/gameplay/service/types';
import type { BaseId } from '../../../../game/content/places';
import { zoneOfPort } from '../../../../game/content/bounties';
import { zoneById } from '../../../../game/content/zones';
import BountyPanel from '../bounty/BountyPanel';
import Button from '../../../ui/Button';
import CostLine from '../../../ui/CostLine';
import IconButton from '../../../ui/IconButton';
import DataTable from '../../../ui/DataTable';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import Note from '../../../ui/Note';
import NumberStepper from '../../../ui/NumberStepper';
import PixelIcon from '../../../ui/PixelIcon';
import StatCompare from '../../../ui/StatCompare';
import { fmtGold, fmtNum } from '../../../ui/format';
import { RarityText } from '../../../ui/fish/RarityTag';
/** 열려 있는 정비 패널 — 시설 클릭(거점)·목공소 트리거(필드)가 연다. null = 닫힘 */
export type ActionPanel = 'sell' | 'rod' | 'boat' | 'shop' | 'bounty' | null;

interface Props {
  panel: Exclude<ActionPanel, null>;
  game: GameState;
  /** 수배판이 뜬 항구 — 수배 가구가 항구에만 있어 base가 항구일 때만 bounty가 열린다 */
  base?: BaseId;
  /** 일일 의뢰 해시 대상 — 없으면 로컬 고정값 */
  uid?: string | null;
  /** 상태 변경의 유일한 경로 (서버 권위 v0.5.0) — 판매/강화/구매는 서버(또는 로컬 리듀서)가 실행 */
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: (msg: string) => void;
  onClose: () => void;
}

// 정비 상호작용(판매/강화/배)은 게임 스테이지 위 모달로 띄운다 — 정비 중에는 이동하지
// 않으므로 화면을 점유해도 자연스럽고, 사이드바 탭 흐름을 방해하지 않는다.
// 패널 골격은 ModalCard 하나다: 제목 — 본문(비교 표·목록) — 확정 영역(잔액 줄 · 사유 · 확정 버튼) — 닫기.
// busy: HTTP 왕복 동안 확정 버튼 잠금 — 더블클릭이 낙관 락 재시도로 이중 적용되는 것 방지.
export default function FacilityModal({ panel, game, dispatch, setToast, onClose, base, uid }: Props) {
  const [busy, setBusy] = useState(false);
  const run = (action: GameAction, onOk: (r: Extract<DispatchResult, { status: 'ok' }>) => void) => {
    if (busy) return;
    setBusy(true);
    when(dispatch(action), r => {
      setBusy(false);
      if (r.status === 'ok') onOk(r);
      else if (r.status === 'rejected') setToast(REJECT_TEXT[r.error]);
    });
  };

  return (
    <Modal layer="stage" xl={panel === 'bounty'} onClose={onClose}>
      {panel === 'sell' && (
        <SellPanel game={game} onClose={onClose} busy={busy}
          onSell={uids => run({ type: 'sell', uids }, r => {
            onClose();
            setToast(`물고기를 팔아 ${fmtGold(r.result.type === 'sell' ? r.result.gold : 0)}를 벌었다!`);
          })} />
      )}
      {panel === 'rod' && (
        <RodPanel game={game} onClose={onClose} busy={busy}
          onUpgrade={() => run({ type: 'upgradeRod' }, r => {
            setToast(`낚싯대가 Lv.${r.state.rod}이 되었다! 입질이 빨라지고 파워도 오른다.`);
          })} />
      )}
      {panel === 'boat' && (
        <BoatPanel game={game} onClose={onClose} busy={busy}
          onBuy={() => run({ type: 'buyBoat' }, r => {
            const { boatName, openedSpots } = selectBoatPurchaseResult(r.state.boat);
            onClose();
            setToast(r.state.boat === 1
              ? `${boatName} 구매! 이제 포구에서 대양으로 나갈 수 있다.`
              : `${boatName} 구매! 더 빠르고${openedSpots.length > 0 ? `, [${openedSpots.map(spot => spot.name).join('·')}] 해역이 열렸다!` : ' 튼튼하다.'}`);
          })} />
      )}
      {panel === 'shop' && (
        <ShopPanel game={game} onClose={onClose} busy={busy}
          onBuy={(baitId, count) => run({ type: 'buyBait', bait: baitId, count }, () => {
            setToast('미끼를 샀다 — 가방의 아이템 섹션에서 활성화한다.');
          })} />
      )}
      {panel === 'bounty' && (base === 'harbor' || base === 'manila' || base === 'colombo') && (
        <ModalCard title={`수배판 — ${zoneById(zoneOfPort(base)!)!.shortName}`} onClose={onClose}>
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
      <ModalCard title={`판매 — 가방 (${game.bag.length}마리)`} onClose={onClose}>
        <Note>가방이 비어 있다. 낚시하러 가자.</Note>
      </ModalCard>
    );
  }

  return (
    <ModalCard title={`판매 — 가방 (${game.bag.length}마리)`} onClose={onClose}
      footer={<>
        {lockedCount > 0 && (
          <Note className="my-0">잠근 개체 {lockedCount}마리는 팔리지 않는다 (가방 탭에서 잠금 해제)</Note>
        )}
        <CostLine have={game.gold} delta={total} />
        <Button variant="primary" full disabled={total === 0 || busy} onClick={() => onSell(soldUids)}>
          판매하기 (+{fmtGold(total)})
        </Button>
      </>}>
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
                    <span className="text-text-dim cursor-default" title="가방 탭에서 잠금 해제">
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
                  {on > 0 && !locked ? fmtGold(selectedSubtotal) : '—'}
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

// R2: 낚싯대 강화 패널 (상한 없음)
function RodPanel({ game, onUpgrade, onClose, busy }: {
  game: GameState; onUpgrade: () => void; onClose: () => void; busy: boolean;
}) {
  const { cost, current: cur, next, canUpgrade } = selectRodUpgradePreview(game);
  // 존은 이제 수역 파워 게이트 소관(stats.powerZones) — 강화 프리뷰는 시간축만 보여준다
  const fmt = (s: { biteMin: number; biteMax: number; sweep: number }) =>
    ({ bite: `${s.biteMin.toFixed(1)}~${s.biteMax.toFixed(1)}s`, sweep: `${s.sweep.toFixed(2)}s` });
  const c = fmt(cur), n = fmt(next);

  return (
    <ModalCard title={`낚싯대 강화 — Lv.${game.rod} → Lv.${game.rod + 1}`} onClose={onClose}
      footer={<>
        <CostLine have={game.gold} delta={-cost} />
        {!canUpgrade.ok && <Note tone="warn" className="my-0">{REJECT_TEXT[canUpgrade.reason]}</Note>}
        <Button variant="primary" full disabled={!canUpgrade.ok || busy} onClick={onUpgrade}>
          강화하기 (-{fmtGold(cost)})
        </Button>
      </>}>
      <StatCompare rows={[
        { label: '입질 대기', value: c.bite, next: n.bite },
        { label: '바 시간', value: c.sweep, next: n.sweep },
      ]} />
      <Note className="my-0">상한 없음 — 레벨이 오를수록 체감은 줄어든다.</Note>
    </ModalCard>
  );
}

// R2b: 배 구매 패널 (골드 차감 + 명성 하한 검증)
function BoatPanel({ game, onBuy, onClose, busy }: {
  game: GameState; onBuy: () => void; onClose: () => void; busy: boolean;
}) {
  const preview = selectBoatPurchasePreview(game);
  if (preview.kind === 'max') {
    return (
      <ModalCard title="조선소" onClose={onClose}>
        <Note>이미 최고의 배({preview.boatName})다. 온 바다가 네 것.</Note>
      </ModalCard>
    );
  }
  const { next, openedSpot, currentSpeed, currentBagCap, check } = preview;

  return (
    <ModalCard title={`배 구매 — ${next.name} (${next.tier}단계)`} onClose={onClose}
      footer={<>
        <CostLine have={game.gold} delta={-next.price}
                  requirement={{ label: '명성', need: next.fameReq, have: game.fame }} />
        {!check.ok && <Note tone="warn" className="my-0">{REJECT_TEXT[check.reason]}</Note>}
        <Button variant="primary" full disabled={!check.ok || busy} onClick={onBuy}>
          구매하기 (-{fmtGold(next.price)})
        </Button>
      </>}>
      <StatCompare rows={[
        { label: '항해 속도', value: currentSpeed ?? '도보', next: fmtNum(next.speed) },
        { label: '가방 상한', value: `${fmtNum(currentBagCap)}마리`, next: `${fmtNum(next.bagCap)}마리` },
        { label: '새 해역', value: '—', next: next.tier === 1 ? '대양 진입 · 태평양' : openedSpot ? openedSpot.name : '없음' },
      ]} />
    </ModalCard>
  );
}

// 미끼 상점 — 콜롬보 항 전용. 등급별 미끼를 골드로 사고, 보유 개수는 가방 아이템 섹션에서 본다.
// 활성 토글은 가방 탭 소관 — 상점은 "파는 곳"만 담당한다. 담백체 유지.
function ShopPanel({ game, onBuy, onClose, busy }: {
  game: GameState;
  onBuy: (baitId: string, count: number) => void;
  onClose: () => void; busy: boolean;
}) {
  const [qty, setQty] = useState<Record<string, number>>(createBaitQuantities);
  const rows = useMemo(() => selectBaitShopRows(game, qty, busy), [game, qty, busy]);

  return (
    <ModalCard title="미끼 상점" onClose={onClose}>
      <Note className="my-0">
        같은 등급이 조금 더 잘 낚인다. 수동으로 낚아올릴 때마다 하나씩 사라지고, 방치 낚시에는 쓰이지 않는다.
      </Note>
      <div className="pf-frame divide-y divide-line">
        {rows.map(({ bait: b, owned, count, total, canAfford }) => (
          <div key={b.id} className="flex gap-3 px-2 py-2">
            <span className="size-2.5 shrink-0 rounded-full border border-line mt-1.5"
                  style={{ backgroundColor: b.color }} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-sm">
                <span>{b.name}</span>
                <span className="text-xs"><RarityText rarity={b.targetRarity} /></span>
                {owned > 0 && <span className="text-xs text-text-dim">보유 <span className="pf-accent">{owned}</span></span>}
              </div>
              <div className="text-xs leading-relaxed text-text-dim">{b.desc}</div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <span className="text-xs pf-accent whitespace-nowrap">
                {fmtGold(b.price)}
                {count > 1 && <span className="text-text-dim"> ×{count} = {fmtGold(total)}</span>}
              </span>
              <div className="flex items-center gap-1.5">
                <NumberStepper value={count} min={1} max={BAIT_BUY_MAX} disabled={busy} variant="inline"
                               ariaLabel={b.name}
                               onChange={v => setQty(prev => ({ ...prev, [b.id]: normalizeBaitQuantity(v) }))} />
                <Button size="sm" disabled={!canAfford} aria-label={`${b.name} 구입`}
                        className="min-w-[56px]" onClick={() => onBuy(b.id, count)}>
                  구입
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <Note className="my-0">보유 {fmtGold(game.gold)} · 산 미끼는 가방 탭의 아이템에서 켠다. 한 번에 하나만 켜진다.</Note>
    </ModalCard>
  );
}
