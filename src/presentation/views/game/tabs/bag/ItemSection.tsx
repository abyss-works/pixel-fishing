import { useState } from 'react';
import { REJECT_TEXT } from '../../../../../game/rules/logic';
import type { GameState } from '../../../../../game/rules/logic';
import type { GameAction } from '../../../../../game/rules/actions';
import type { DispatchResult, MaybePromise } from '../../../../../features/gameplay/service/types';
import { useNow } from '../../../../../features/gameplay/service/useGameTime';
import type { AccountLockState } from '../../../../../features/display/model/menuLock';
import { sendNotice } from '../../../../../features/display/model/toastPolicy';
import {
  filterItemSection,
  ITEM_GROUPS,
  ITEM_GROUP_HINT,
  NO_ITEMS_TEXT,
  planEat,
  potionUseNoticeText,
  selectItemSection,
} from '../../../../../features/kitchen/model/bagItems';
import type { EnergyCell, ItemRow, PotionRow, SwapConfirm } from '../../../../../features/kitchen/model/bagItems';
import { formatEnergy } from '../../../../../game/content/cooking';
import { when } from '../../../../../shared/lib/when';
import ConfirmDialog from '../../../../ui/ConfirmDialog';
import Badge from '../../../../ui/Badge';
import Button from '../../../../ui/Button';
import { cx } from '../../../../ui/cx';
import { GradeName, RarityText } from '../../../../ui/fish/RarityTag';
import { fmtMinutes, josa } from '../../../../ui/format';
import Inset from '../../../../ui/Inset';
import ItemSprite from '../../../../ui/ItemSprite';
import Locked from '../../../../ui/Locked';
import Note from '../../../../ui/Note';
import PageTitle from '../../../../ui/PageTitle';
import PixelIcon from '../../../../ui/PixelIcon';
import PressRow from '../../../../ui/PressRow';
import SlotCell from '../../../../ui/SlotCell';
import Subheading from '../../../../ui/Subheading';
import Tip from '../../../../ui/Tip';
import ToggleChip from '../../../../ui/ToggleChip';
import type { Notify } from '../../../../ui/hud/messageFeed';
import ItemDetail from './ItemDetail';
import type { ItemDetailTarget } from './ItemDetail';

/** 교체 확인을 기다리는 먹기(쓰기) - 확인 내용과 먹을 아이템 */
interface PendingEat { row: ItemRow; confirm: SwapConfirm }

/** 교체 확인 창 - 지금 들어 있는 것과 새로 넣을 것의 남은 시간을 나란히 보이고, 지금 효과의 남은 시간이 사라진다고 알린다 */
function SwapDialog({ confirm, onConfirm, onCancel }: {
  confirm: SwapConfirm;
  onConfirm: (replaceSlot?: 'bait' | 'bait2') => void;
  onCancel: () => void;
}) {
  const [replaceSlot, setReplaceSlot] = useState<'bait' | 'bait2' | undefined>(confirm.defaultChoice);
  const rows = [
    { key: 'current', head: '지금', ...confirm.current, tone: 'text-danger' },
    { key: 'next', head: '새로', ...confirm.next, tone: 'text-accent' },
  ];
  return (
    <ConfirmDialog layer="app" title={confirm.title} confirmLabel={confirm.confirmLabel}
                   onConfirm={() => onConfirm(confirm.choices ? replaceSlot : undefined)} onCancel={onCancel}>
      {confirm.choices ? (
        <>
          <div role="radiogroup" aria-label="바꿀 미끼 고르기" className="grid grid-cols-2 gap-2">
            {confirm.choices.map(c => {
              const selected = replaceSlot === c.slotKey;
              return (
                <SlotCell
                  key={c.slotKey}
                  role="radio"
                  form={selected ? 'pressed' : 'raised'}
                  onSelect={() => setReplaceSlot(c.slotKey)}
                  ariaLabel={`${c.label}, 남은 시간 ${fmtMinutes(c.minutes)}`}
                  className="flex flex-col items-start gap-1 px-2.5 py-2 text-left"
                >
                  <span className="flex items-center gap-1.5 w-full min-w-0">
                    <PixelIcon glyph={selected ? 'checkOn' : 'checkOff'} size={11}
                               className={selected ? 'text-gold shrink-0' : 'text-text-dim shrink-0'} />
                    <span className={cx('truncate text-xs', !selected && 'text-text')}>
                      <GradeName name={c.title.name} grade={c.title.grade} emphasized={selected} />
                    </span>
                  </span>
                  <span className="pf-accent text-xs text-danger pl-4">{fmtMinutes(c.minutes)}</span>
                </SlotCell>
              );
            })}
          </div>
          <Inset divided className="px-3">
            <div className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-2 py-2 text-sm">
              <span className="text-text-dim">새로</span>
              <span className="truncate"><GradeName name={confirm.next.title.name} grade={confirm.next.title.grade} /></span>
              <span className="pf-accent text-xs text-accent">{fmtMinutes(confirm.next.minutes)}</span>
            </div>
          </Inset>
        </>
      ) : (
        <Inset divided className="px-3">
          {rows.map(r => (
            <div key={r.key} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-2 py-2 text-sm">
              <span className="text-text-dim">{r.head}</span>
              <span className="truncate"><GradeName name={r.title.name} grade={r.title.grade} /></span>
              <span className={`pf-accent text-xs ${r.tone}`}>{fmtMinutes(r.minutes)}</span>
            </div>
          ))}
        </Inset>
      )}
      <Note tone="warn" className="my-0">{confirm.warning}</Note>
    </ConfirmDialog>
  );
}

/** 도시락 또는 미끼 카드 격자 - 카드 본문을 누르면 상세 창이 열리고, 공통 주의사항은 소제목 툴팁 한 곳에 모은다 */
function ItemCards({ title, hint, rows, lockLines, busy, selectedId, onSelect, onEat }: {
  title: string; hint: string; rows: readonly ItemRow[]; lockLines?: readonly string[] | null;
  busy: boolean; selectedId: string | null; onSelect: (id: string) => void; onEat: (row: ItemRow) => void;
}) {
  if (rows.length === 0) return null;
  const locked = Boolean(lockLines);
  return (
    <div className="mb-2">
      <Subheading><Tip text={hint}>{title}</Tip></Subheading>
      <div className="grid grid-cols-2 gap-2">
        {rows.map(row => {
          const usable = !locked && row.count > 0;
          const dimmed = locked || (!usable && !row.active);
          const selected = selectedId === row.recipe.id;
          const button = (
            <Button size="sm" aria-label={`${row.label} ${row.verb}`} disabled={busy || !usable} onClick={() => onEat(row)}>
              {row.verb}
            </Button>
          );
          return (
            <Inset key={row.recipe.id} tone={dimmed ? 'deep' : 'base'}
                   border={selected ? 'gold' : row.active ? 'accent' : 'line'}
                   className={cx('p-2 flex flex-col gap-1.5 min-w-0', dimmed && 'text-text-dim')}>
              <PressRow
                ariaLabel={`${row.label} 상세 보기`}
                onPress={() => onSelect(row.recipe.id)}
                className="flex items-start gap-2 min-w-0 -m-1 p-1"
              >
                <ItemSprite kind={row.slot} id={row.recipe.id} preset="list" className="shrink-0" />
                <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                  <div className="text-xs leading-snug break-keep">
                    <GradeName name={row.title.name} grade={row.title.grade} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-2xs text-text-dim">
                    <span>지속 <span className={cx('pf-accent', !dimmed && 'text-text')}>{fmtMinutes(row.durationMinutes)}</span></span>
                    {row.active && <Badge tone="accent" size="2xs">사용 중</Badge>}
                  </div>
                  {row.active && row.remainingMinutes !== null && (
                    <div className="text-2xs text-accent pf-accent">남음 {fmtMinutes(row.remainingMinutes)}</div>
                  )}
                </div>
              </PressRow>
              <div className="mt-auto pt-1.5 border-t border-line-dim flex items-center justify-between gap-2">
                <span className="pf-accent text-xs text-text-dim whitespace-nowrap">×{row.count}</span>
                {lockLines ? (
                  <Locked badge={false} lines={lockLines} title={<GradeName name={row.title.name} grade={row.title.grade} />} label={`${row.label} 잠김`} className="inline-block">
                    {button}
                  </Locked>
                ) : button}
              </div>
            </Inset>
          );
        })}
      </div>
    </div>
  );
}

/** 생명의 기운 1×4 컴팩트 한 줄 격자 — 부엌 잠금 상태에서도 플레이스홀더를 보이고 묶음에 잠금 툴팁을 건다 */
function EnergyCards({ energy, lockLines }: {
  energy: readonly EnergyCell[];
  lockLines?: readonly string[] | null;
}) {
  if (energy.length === 0) return null;
  const locked = Boolean(lockLines);
  const grid = (
    <div className="grid grid-cols-4 gap-1.5">
      {energy.map(cell => {
        const unowned = locked || cell.stored === 0;
        return (
          <Inset key={cell.grade} tone={unowned ? 'deep' : 'base'}
                 role="group" aria-label={`${cell.label} ${formatEnergy(cell.stored)}개`}
                 className={cx('flex flex-col items-center justify-center gap-0.5 px-1.5 py-1.5 min-w-0 text-center', unowned && 'text-text-dim')}>
            <div className="flex items-center justify-center gap-1 min-w-0" aria-hidden="true">
              <ItemSprite kind="energy" id={cell.id} preset="row" className="shrink-0" />
              <span className="text-2xs leading-none"><RarityText rarity={cell.grade} /></span>
            </div>
            <span className="pf-accent text-xs leading-tight truncate max-w-full" aria-hidden="true">{formatEnergy(cell.stored)}</span>
          </Inset>
        );
      })}
    </div>
  );
  return (
    <div className="mb-2">
      <Subheading>
        <Tip text={ITEM_GROUP_HINT.energy}>{ITEM_GROUPS[0].title}</Tip>
      </Subheading>
      {lockLines ? (
        <Locked badge={false} lines={lockLines} title={ITEM_GROUPS[0].title} label="생명의 기운 잠김">
          {grid}
        </Locked>
      ) : grid}
    </div>
  );
}

/** 물약 카드 격자 — 계정 회원은 배 단계와 무관하게 쓸 수 있고, 게스트·확인 실패는 잠금 상태다 */
function PotionCards({ rows, potionLock, busy, selectedId, onSelect, onUse }: {
  rows: readonly PotionRow[];
  potionLock: readonly string[] | null;
  busy: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onUse: (row: PotionRow) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="mb-2">
      <Subheading><Tip text={ITEM_GROUP_HINT.potion}>물약</Tip></Subheading>
      <div className="grid grid-cols-2 gap-2">
        {rows.map(row => {
          const locked = potionLock !== null;
          const dimmed = locked || (!row.usable && !row.active);
          const selected = selectedId === row.potion.id;
          const btnLabel = row.active ? '사용 중' : '사용';
          const button = (
            <Button
              size="sm"
              aria-label={`${row.potion.name} ${btnLabel}`}
              disabled={busy || locked || !row.usable}
              onClick={() => onUse(row)}
            >
              {btnLabel}
            </Button>
          );
          return (
            <Inset key={row.potion.id} tone={dimmed ? 'deep' : 'base'}
                   border={selected ? 'gold' : row.active ? 'accent' : 'line'}
                   className={cx('p-2 flex flex-col gap-1.5 min-w-0', dimmed && 'text-text-dim')}>
              <PressRow
                ariaLabel={`${row.potion.name} 상세 보기`}
                onPress={() => onSelect(row.potion.id)}
                className="flex items-start gap-2 min-w-0 -m-1 p-1"
              >
                <ItemSprite kind="potion" id={row.potion.id} preset="list" className="shrink-0" />
                <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                  <div className="text-xs leading-snug break-keep">
                    <GradeName name={row.potion.name} grade={row.potion.grade} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-2xs text-text-dim">
                    <span>하루 동안</span>
                  </div>
                </div>
              </PressRow>
              <div className="mt-auto pt-1.5 border-t border-line-dim flex items-center justify-between gap-2">
                <span className="pf-accent text-xs text-text-dim whitespace-nowrap">×{row.count}</span>
                {potionLock ? (
                  <Locked badge={false} lines={potionLock} title={<GradeName name={row.potion.name} grade={row.potion.grade} />} label={`${row.potion.name} 잠김`} className="inline-block">
                    {button}
                  </Locked>
                ) : button}
              </div>
            </Inset>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 아이템 섹션 - 생명의 기운 4장 카드, 도시락과 미끼 카드 격자, 물약 카드 격자. 먹기(쓰기)와 물약 사용은 어디서나 한다.
 * 이미 효과가 든 슬롯에 넣으려면(같은 것도 같다) 교체 확인 창을 거친다. 요리를 쓸 수 없는 동안(해금 전, 게스트)은
 * 세 묶음 자리를 잠금으로 보이고 빈 상태 안내를 둔다. 판정과 문안은 기능 모델이 정한다.
 */
export default function ItemSection({ game, accountState, dispatch, setToast }: {
  game: GameState;
  accountState: AccountLockState;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: Notify;
}) {
  const now = useNow();
  const view = selectItemSection(game, now, accountState);
  const [busy, setBusy] = useState(false);
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [pending, setPending] = useState<PendingEat | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const eat = (row: ItemRow, replaceSlot?: 'bait' | 'bait2') => {
    if (busy) return;
    setBusy(true);
    const action: GameAction = replaceSlot
      ? { type: 'eat', item: row.recipe.id, replaceSlot }
      : { type: 'eat', item: row.recipe.id };
    when(dispatch(action), r => {
      setBusy(false);
      if (r.status === 'ok') {
        const verbDone = row.slot === 'lunch' ? '먹었어요.' : '썼어요.';
        sendNotice(setToast, {
          kind: 'kitchen.cookAndBuff',
          text: `${josa(row.label, '을/를')} ${verbDone}`,
          toastText: `${row.label} 사용`,
        });
      } else if (r.status === 'rejected') {
        sendNotice(setToast, { kind: 'system.modalRejected', text: REJECT_TEXT[r.error] });
      }
    });
  };
  const press = (row: ItemRow) => {
    const plan = planEat(game, row.recipe.id, now);
    if (plan.confirm) setPending({ row, confirm: plan.confirm });
    else eat(row);
  };
  const usePotion = (row: PotionRow) => {
    if (busy) return;
    setBusy(true);
    when(dispatch({ type: 'usePotion', id: row.potion.id }), r => {
      setBusy(false);
      if (r.status === 'ok') {
        sendNotice(setToast, {
          kind: 'kitchen.cookAndBuff',
          text: potionUseNoticeText(row.potion.name),
          toastText: `${row.potion.name} 사용!`,
        });
      } else if (r.status === 'rejected') {
        sendNotice(setToast, { kind: 'system.modalRejected', text: REJECT_TEXT[r.error] });
      }
    });
  };

  const kitchenLock = view.state === 'locked' ? view.lines : null;
  const shown = filterItemSection(view, ownedOnly);
  const detailRecipe = detailId
    ? view.lunch.find(r => r.recipe.id === detailId) ?? view.bait.find(r => r.recipe.id === detailId) ?? null
    : null;
  const detailPotion = detailId && !detailRecipe
    ? view.potions.find(p => p.potion.id === detailId) ?? null
    : null;
  const detailTarget: ItemDetailTarget | null = detailRecipe
    ? { kind: 'recipe', row: detailRecipe, lockLines: kitchenLock, onUse: press }
    : detailPotion
      ? { kind: 'potion', row: detailPotion, lockLines: view.potionLock, onUse: usePotion }
      : null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 mb-1">
        <PageTitle>아이템</PageTitle>
        <ToggleChip
          size="sm"
          pressed={ownedOnly}
          emphasis={ownedOnly}
          onClick={() => setOwnedOnly(v => !v)}
        >
          보유 중만 보기
        </ToggleChip>
      </div>
      {view.state === 'locked' && !ownedOnly && view.unlockNotice && (
        <Note>{view.unlockNotice}</Note>
      )}
      {shown.empty && (
        <Note>
          {view.state === 'locked'
            ? view.empty.map(line => <span key={line} className="block">{line}</span>)
            : NO_ITEMS_TEXT}
        </Note>
      )}
      {!shown.empty && (
        <>
          <EnergyCards energy={shown.energy} lockLines={kitchenLock} />
          <ItemCards title={ITEM_GROUPS[1].title} hint={ITEM_GROUP_HINT.lunch} rows={shown.lunch} lockLines={kitchenLock}
                     busy={busy} selectedId={detailId} onSelect={setDetailId} onEat={press} />
          <ItemCards title={ITEM_GROUPS[2].title} hint={ITEM_GROUP_HINT.bait} rows={shown.bait} lockLines={kitchenLock}
                     busy={busy} selectedId={detailId} onSelect={setDetailId} onEat={press} />
          <PotionCards rows={shown.potions} potionLock={view.potionLock} busy={busy}
                       selectedId={detailId} onSelect={setDetailId} onUse={usePotion} />
        </>
      )}
      {detailTarget && (
        <ItemDetail target={detailTarget} busy={busy} onClose={() => setDetailId(null)} />
      )}
      {pending && (
        <SwapDialog key={pending.row.recipe.id} confirm={pending.confirm} onCancel={() => setPending(null)}
                    onConfirm={replaceSlot => { const { row } = pending; setPending(null); eat(row, replaceSlot); }} />
      )}
    </div>
  );
}
