import { useState } from 'react';
import { REJECT_TEXT } from '../../../../../game/rules/logic';
import type { GameState } from '../../../../../game/rules/logic';
import type { GameAction } from '../../../../../game/rules/actions';
import type { DispatchResult, MaybePromise } from '../../../../../features/gameplay/service/types';
import { useNow } from '../../../../../features/gameplay/service/useGameTime';
import { ITEM_GROUPS, ITEM_GROUP_HINT, NO_ITEMS_TEXT, planEat, selectItemSection } from '../../../../../features/kitchen/model/bagItems';
import type { ItemRow, SwapConfirm } from '../../../../../features/kitchen/model/bagItems';
import { formatEnergy } from '../../../../../game/content/cooking';
import { when } from '../../../../../shared/lib/when';
import ConfirmDialog from '../../../../ui/ConfirmDialog';
import { GradeName, RarityText } from '../../../../ui/fish/RarityTag';
import Frame from '../../../../ui/Frame';
import { fmtMinutes } from '../../../../ui/format';
import Inset from '../../../../ui/Inset';
import ItemSprite from '../../../../ui/ItemSprite';
import Locked from '../../../../ui/Locked';
import Note from '../../../../ui/Note';
import PageTitle from '../../../../ui/PageTitle';
import PillButton from '../../../../ui/PillButton';
import RecipeEffectTip from '../../../../ui/RecipeEffectTip';
import Subheading from '../../../../ui/Subheading';
import Tip from '../../../../ui/Tip';
import type { Notify } from '../../../../ui/hud/messageFeed';

/** 교체 확인을 기다리는 먹기(쓰기) - 확인 내용과 먹을 아이템 */
interface PendingEat { item: string; confirm: SwapConfirm }

/** 교체 확인 창 - 지금 들어 있는 것과 새로 넣을 것의 남은 시간을 나란히 보이고, 지금 효과의 남은 시간이 사라진다고 알린다 */
function SwapDialog({ confirm, onConfirm, onCancel }: { confirm: SwapConfirm; onConfirm: () => void; onCancel: () => void }) {
  const rows = [
    { key: 'current', head: '지금', ...confirm.current, tone: 'text-danger' },
    { key: 'next', head: '새로', ...confirm.next, tone: 'text-accent' },
  ];
  return (
    <ConfirmDialog title={confirm.title} confirmLabel={confirm.confirmLabel} onConfirm={onConfirm} onCancel={onCancel}>
      <Inset divided className="px-3">
        {rows.map(r => (
          <div key={r.key} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-2 py-2 text-sm">
            <span className="text-text-dim">{r.head}</span>
            <b className="truncate">{r.label}</b>
            <span className={`pf-accent text-xs ${r.tone}`}>{fmtMinutes(r.minutes)}</span>
          </div>
        ))}
      </Inset>
      <Note tone="warn" className="my-0">{confirm.warning}</Note>
    </ConfirmDialog>
  );
}

/** 도시락 또는 미끼 행 묶음 - 이름 툴팁이 효과를 보이고, 행 끝 버튼이 먹기(쓰기)를 한다 */
function ItemRows({ title, hint, rows, busy, onEat }: {
  title: string; hint: string; rows: readonly ItemRow[]; busy: boolean; onEat: (row: ItemRow) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="mb-2">
      <Subheading><Tip text={hint}>{title}</Tip></Subheading>
      <Frame divided>
        {rows.map(row => (
          <div key={row.recipe.id} className="grid grid-cols-[16px_minmax(0,1fr)_auto_auto] items-center gap-2 px-2 py-1.5 text-sm">
            <ItemSprite kind={row.slot} id={row.recipe.id} preset="row" />
            <Tip text={<RecipeEffectTip label={row.label} effects={row.effects} note={row.note} />} className="block justify-self-start truncate max-w-full">
              <GradeName name={row.title.name} grade={row.title.grade} />
            </Tip>
            <span className="pf-accent text-text-dim whitespace-nowrap">×{row.count}</span>
            <PillButton aria-label={`${row.label} ${row.verb}`} disabled={busy} onClick={() => onEat(row)}>{row.verb}</PillButton>
          </div>
        ))}
      </Frame>
    </div>
  );
}

/**
 * 아이템 섹션 - 생명의 기운 4칸 격자, 도시락과 미끼 행. 먹기(쓰기)는 어디서나 한다.
 * 이미 효과가 든 슬롯에 넣으려면(같은 것도 같다) 교체 확인 창을 거친다. 요리를 쓸 수 없는 동안(해금 전, 게스트)은
 * 세 묶음 자리를 잠금으로 보이고 빈 상태 안내를 둔다. 판정과 문안은 기능 모델이 정한다.
 */
export default function ItemSection({ game, guest, dispatch, setToast }: {
  game: GameState;
  guest: boolean;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: Notify;
}) {
  const now = useNow();
  const view = selectItemSection(game, now, guest);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingEat | null>(null);

  const eat = (item: string) => {
    if (busy) return;
    setBusy(true);
    when(dispatch({ type: 'eat', item }), r => {
      setBusy(false);
      if (r.status === 'rejected') setToast(REJECT_TEXT[r.error], 'warn');
    });
  };
  const press = (row: ItemRow) => {
    const plan = planEat(game, row.recipe.id, now);
    if (plan.confirm) setPending({ item: row.recipe.id, confirm: plan.confirm });
    else eat(row.recipe.id);
  };

  if (view.state === 'locked') {
    return (
      <div className="flex flex-col gap-1">
        <PageTitle>아이템</PageTitle>
        <Note>{view.empty.map(line => <span key={line} className="block">{line}</span>)}</Note>
        <Locked lines={view.lines} label={ITEM_GROUPS.map(g => g.title).join(', ')}>
          {ITEM_GROUPS.map(g => (
            <div key={g.key} className="mb-2">
              <Subheading>{g.title}</Subheading>
              <Frame className="h-9" />
            </div>
          ))}
        </Locked>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <PageTitle>아이템</PageTitle>
      {view.empty ? <Note>{NO_ITEMS_TEXT}</Note> : (
        <>
          <ItemRows title={ITEM_GROUPS[0].title} hint={ITEM_GROUP_HINT.lunch} rows={view.lunch} busy={busy} onEat={press} />
          <ItemRows title={ITEM_GROUPS[1].title} hint={ITEM_GROUP_HINT.bait} rows={view.bait} busy={busy} onEat={press} />
          <div className="mb-2">
            <Subheading>
              <Tip text={ITEM_GROUP_HINT.energy}>{ITEM_GROUPS[2].title}</Tip>
            </Subheading>
            <Inset className="grid grid-cols-4 py-2">
              {view.energy.map((cell, i) => (
                <div key={cell.grade} role="group" aria-label={`${cell.label} ${formatEnergy(cell.stored)}개`}
                     className={`flex flex-col items-center gap-0.5 ${i > 0 ? 'border-l border-line' : ''}`}>
                  <span className="text-xs" aria-hidden="true"><RarityText rarity={cell.grade} /></span>
                  <span className="pf-accent text-base" aria-hidden="true">{formatEnergy(cell.stored)}</span>
                </div>
              ))}
            </Inset>
          </div>
        </>
      )}
      {pending && (
        <SwapDialog confirm={pending.confirm} onCancel={() => setPending(null)}
                    onConfirm={() => { const { item } = pending; setPending(null); eat(item); }} />
      )}
    </div>
  );
}
