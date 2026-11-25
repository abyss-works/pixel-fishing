import { useState } from 'react';
import { REJECT_TEXT } from '../../../../../game/rules/logic';
import type { GameState } from '../../../../../game/rules/logic';
import type { GameAction } from '../../../../../game/rules/actions';
import type { DispatchResult, MaybePromise } from '../../../../../features/gameplay/service/types';
import { useNow } from '../../../../../features/gameplay/service/useGameTime';
import type { AccountLockState } from '../../../../../features/display/model/menuLock';
import { sendNotice } from '../../../../../features/display/model/toastPolicy';
import { filterItemSection, ITEM_GROUPS, ITEM_GROUP_HINT, NO_ITEMS_TEXT, planEat, selectItemSection } from '../../../../../features/kitchen/model/bagItems';
import type { ItemRow, SwapConfirm } from '../../../../../features/kitchen/model/bagItems';
import { formatEnergy } from '../../../../../game/content/cooking';
import { when } from '../../../../../shared/lib/when';
import ConfirmDialog from '../../../../ui/ConfirmDialog';
import Badge from '../../../../ui/Badge';
import Button from '../../../../ui/Button';
import { cx } from '../../../../ui/cx';
import { GradeName, RarityText } from '../../../../ui/fish/RarityTag';
import { fmtMinutes } from '../../../../ui/format';
import Inset from '../../../../ui/Inset';
import ItemSprite from '../../../../ui/ItemSprite';
import Locked from '../../../../ui/Locked';
import Note from '../../../../ui/Note';
import PageTitle from '../../../../ui/PageTitle';
import PixelIcon from '../../../../ui/PixelIcon';
import RecipeEffectTip from '../../../../ui/RecipeEffectTip';
import SlotCell from '../../../../ui/SlotCell';
import Subheading from '../../../../ui/Subheading';
import Tip from '../../../../ui/Tip';
import ToggleChip from '../../../../ui/ToggleChip';
import type { Notify } from '../../../../ui/hud/messageFeed';

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
                    <b className={cx('truncate text-xs', selected ? 'text-gold' : 'text-text')}>{c.label}</b>
                  </span>
                  <span className="pf-accent text-xs text-danger pl-4">{fmtMinutes(c.minutes)}</span>
                </SlotCell>
              );
            })}
          </div>
          <Inset divided className="px-3">
            <div className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-2 py-2 text-sm">
              <span className="text-text-dim">새로</span>
              <b className="truncate">{confirm.next.label}</b>
              <span className="pf-accent text-xs text-accent">{fmtMinutes(confirm.next.minutes)}</span>
            </div>
          </Inset>
        </>
      ) : (
        <Inset divided className="px-3">
          {rows.map(r => (
            <div key={r.key} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-2 py-2 text-sm">
              <span className="text-text-dim">{r.head}</span>
              <b className="truncate">{r.label}</b>
              <span className={`pf-accent text-xs ${r.tone}`}>{fmtMinutes(r.minutes)}</span>
            </div>
          ))}
        </Inset>
      )}
      <Note tone="warn" className="my-0">{confirm.warning}</Note>
    </ConfirmDialog>
  );
}

/** 도시락 또는 미끼 카드 격자 - 이름 툴팁이 효과를 보이고, 총 지속 시간과 활성 상태(배지·남은 시간)를 카드 안에 둔다 */
function ItemCards({ title, hint, rows, busy, onEat }: {
  title: string; hint: string; rows: readonly ItemRow[]; busy: boolean; onEat: (row: ItemRow) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="mb-2">
      <Subheading><Tip text={hint}>{title}</Tip></Subheading>
      <div className="grid grid-cols-2 gap-2">
        {rows.map(row => {
          const usable = row.count > 0;
          const dimmed = !usable && !row.active;
          return (
            <Inset key={row.recipe.id} tone={dimmed ? 'deep' : 'base'} border={row.active ? 'accent' : 'line'}
                   className={cx('p-2 flex flex-col gap-1.5 min-w-0', dimmed && 'text-text-dim')}>
              <div className="flex items-start gap-2 min-w-0">
                <ItemSprite kind={row.slot} id={row.recipe.id} preset="list" className="shrink-0" />
                <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                  <Tip text={<RecipeEffectTip label={row.label} effects={row.effects} note={row.note} />}
                       className="inline-block text-xs leading-snug break-keep">
                    <GradeName name={row.title.name} grade={row.title.grade} />
                  </Tip>
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-2xs text-text-dim">
                    <span>지속 <span className={cx('pf-accent', !dimmed && 'text-text')}>{fmtMinutes(row.durationMinutes)}</span></span>
                    {row.active && <Badge tone="accent" size="2xs">사용 중</Badge>}
                  </div>
                  {row.active && row.remainingMinutes !== null && (
                    <div className="text-2xs text-accent pf-accent">남음 {fmtMinutes(row.remainingMinutes)}</div>
                  )}
                </div>
              </div>
              <div className="mt-auto pt-1.5 border-t border-line-dim flex items-center justify-between gap-2">
                <span className="pf-accent text-xs text-text-dim whitespace-nowrap">×{row.count}</span>
                <Button size="sm" aria-label={`${row.label} ${row.verb}`} disabled={busy || !usable} onClick={() => onEat(row)}>{row.verb}</Button>
              </div>
            </Inset>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 아이템 섹션 - 생명의 기운 4장 카드, 도시락과 미끼 카드 격자. 먹기(쓰기)는 어디서나 한다.
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

  const eat = (row: ItemRow, replaceSlot?: 'bait' | 'bait2') => {
    if (busy) return;
    setBusy(true);
    const action: GameAction = replaceSlot
      ? { type: 'eat', item: row.recipe.id, replaceSlot }
      : { type: 'eat', item: row.recipe.id };
    when(dispatch(action), r => {
      setBusy(false);
      if (r.status === 'ok') {
        sendNotice(setToast, {
          kind: 'kitchen.cookAndBuff',
          text: `${row.label} 효과를 적용했어요.`,
          toastText: `${row.label} 효과 적용`,
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

  if (view.state === 'locked') {
    return (
      <div className="flex flex-col gap-1">
        <PageTitle>아이템</PageTitle>
        <Note>{view.empty.map(line => <span key={line} className="block">{line}</span>)}</Note>
        <Locked lines={view.lines} title="아이템" label={ITEM_GROUPS.map(g => g.title).join(', ')}>
          {ITEM_GROUPS.map(g => (
            <div key={g.key} className="mb-2">
              <Subheading>{g.title}</Subheading>
              <Inset className="h-9" />
            </div>
          ))}
        </Locked>
      </div>
    );
  }

  const shown = filterItemSection(view, ownedOnly);

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
          <PixelIcon glyph="check" size={10} />
          보유 중만 보기
        </ToggleChip>
      </div>
      {shown.empty ? <Note>{NO_ITEMS_TEXT}</Note> : (
        <>
          <ItemCards title={ITEM_GROUPS[0].title} hint={ITEM_GROUP_HINT.lunch} rows={shown.lunch} busy={busy} onEat={press} />
          <ItemCards title={ITEM_GROUPS[1].title} hint={ITEM_GROUP_HINT.bait} rows={shown.bait} busy={busy} onEat={press} />
          {shown.energy.length > 0 && (
            <div className="mb-2">
              <Subheading>
                <Tip text={ITEM_GROUP_HINT.energy}>{ITEM_GROUPS[2].title}</Tip>
              </Subheading>
              <div className="grid grid-cols-2 gap-2">
                {shown.energy.map(cell => {
                  const unowned = cell.stored === 0;
                  return (
                    <Inset key={cell.grade} tone={unowned ? 'deep' : 'base'}
                           role="group" aria-label={`${cell.label} ${formatEnergy(cell.stored)}개`}
                           className={cx('flex items-center gap-2 p-2 min-w-0', unowned && 'text-text-dim')}>
                      <ItemSprite kind="energy" id={cell.id} preset="list" className="shrink-0" />
                      <div className="min-w-0 flex flex-col">
                        <span className="text-xs leading-tight" aria-hidden="true"><RarityText rarity={cell.grade} /></span>
                        <span className="pf-accent text-base leading-tight break-words" aria-hidden="true">{formatEnergy(cell.stored)}</span>
                      </div>
                    </Inset>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
      {pending && (
        <SwapDialog key={pending.row.recipe.id} confirm={pending.confirm} onCancel={() => setPending(null)}
                    onConfirm={replaceSlot => { const { row } = pending; setPending(null); eat(row, replaceSlot); }} />
      )}
    </div>
  );
}
