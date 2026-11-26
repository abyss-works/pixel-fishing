import type { ItemRow, PotionRow } from '../../../../../features/kitchen/model/bagItems';
import type { RecipeTitle } from '../../../../../features/kitchen/model/recipes';
import { cx } from '../../../../ui/cx';
import Badge from '../../../../ui/Badge';
import Button from '../../../../ui/Button';
import Inset from '../../../../ui/Inset';
import ItemSprite from '../../../../ui/ItemSprite';
import KeyValueRow from '../../../../ui/KeyValueRow';
import Locked from '../../../../ui/Locked';
import LoreParagraph from '../../../../ui/LoreParagraph';
import Modal from '../../../../ui/Modal';
import Note from '../../../../ui/Note';
import PageTitle from '../../../../ui/PageTitle';
import { GradeName, HighlightRarityText } from '../../../../ui/fish/RarityTag';
import { fmtEffectDuration } from '../../../../../shared/lib/effectDuration';
import { fmtNum } from '../../../../ui/format';

export type ItemDetailTarget =
  | { kind: 'recipe'; row: ItemRow; lockLines: readonly string[] | null; onUse: (row: ItemRow) => void }
  | { kind: 'potion'; row: PotionRow; lockLines: readonly string[] | null; onUse: (row: PotionRow) => void };

// 아이템 상세 창 — 가방 아이템 탭에서 도시락·미끼·비약 카드를 누르면 열린다.
// 유물 상세 창(ArtifactDetail)과 같은 48px 그림·제목 머리, 로어(설명), 효과·상태 표, 주의사항, 하단 실행 버튼 구성을 쓰며 우상단 X로만 닫는다.
export default function ItemDetail({ target, busy, onClose }: {
  target: ItemDetailTarget;
  busy: boolean;
  onClose: () => void;
}) {
  const isPotion = target.kind === 'potion';
  const spriteKind = isPotion ? 'potion' : target.row.slot;
  const id = isPotion ? target.row.potion.id : target.row.recipe.id;
  const title: RecipeTitle = isPotion
    ? { name: target.row.potion.name, grade: target.row.potion.grade }
    : target.row.title;
  const label = isPotion ? target.row.potion.name : target.row.label;
  const categoryLabel = isPotion ? '비약' : target.row.slot === 'lunch' ? '도시락' : '미끼';
  const description = isPotion ? target.row.potion.description : target.row.recipe.description;
  const { effects, count, active } = target.row;
  const note = target.kind === 'potion' ? target.row.note : null;
  const durationText = isPotion ? '하루 동안' : fmtEffectDuration(target.row.durationMinutes);
  const remainingMinutes = isPotion ? null : target.row.remainingMinutes;
  const usable = target.lockLines === null && (isPotion ? target.row.usable : target.row.count > 0);
  const actionLabel = isPotion ? (active ? '사용 중' : '사용') : target.row.verb;
  const handleUse = () => {
    if (isPotion) target.onUse(target.row);
    else target.onUse(target.row);
  };

  return (
    <Modal
      layer="app"
      onClose={onClose}
      header={
        <header className="mb-3 flex items-center gap-3 border-b border-line pb-2 pr-8">
          <ItemSprite kind={spriteKind} id={id} preset="hero" className="shrink-0" />
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 min-w-0">
            <PageTitle><GradeName name={title.name} grade={title.grade} /></PageTitle>
            <Badge>{categoryLabel}</Badge>
          </div>
        </header>
      }
      footer={
        <ItemDetailFooter
          title={title}
          label={label}
          lockLines={target.lockLines}
          busy={busy}
          usable={usable}
          actionLabel={actionLabel}
          onUse={handleUse}
        />
      }
    >
      <div className="flex flex-col gap-3">
        {description && (
          <LoreParagraph className="text-xs leading-[1.8] text-text-dim">{description}</LoreParagraph>
        )}

        {effects.length > 0 && (
          <Inset divided>
            {effects.map(e => (
              'text' in e ? (
                <div key={e.text} className="px-2 py-1.5 text-sm text-accent">
                  {e.text}
                </div>
              ) : (
                <KeyValueRow
                  key={`${e.label}-${e.value}`}
                  label={<HighlightRarityText text={e.label} />}
                  value={e.value}
                  valueEnd
                  valueClassName={/\d/.test(e.value) ? 'pf-accent text-accent' : 'font-bold text-accent'}
                />
              )
            ))}
          </Inset>
        )}

        <Inset divided>
          <KeyValueRow
            label="지속 시간"
            value={durationText}
            valueEnd
            valueClassName={isPotion ? 'font-bold text-text' : 'pf-accent text-text'}
          />
          <KeyValueRow
            label="보유 수량"
            value={`${fmtNum(count)}개`}
            valueEnd
            valueClassName="pf-accent text-text"
          />
          <KeyValueRow
            label="현재 상태"
            valueEnd
            value={active ? (
              <span className="inline-flex items-center justify-end gap-1.5">
                <Badge tone="accent" size="2xs">사용 중</Badge>
                {remainingMinutes !== null && (
                  <span className="pf-accent text-accent">남음 {fmtEffectDuration(remainingMinutes)}</span>
                )}
              </span>
            ) : (
              <span className="text-text-dim">{count > 0 ? '미적용' : '미보유'}</span>
            )}
          />
        </Inset>

        {note && (
          <Inset tone="deep" className="px-3 py-2">
            {note.includes('\n') ? (
              <Note size="xs" className="my-0">
                {note.split('\n').map((line, i) => (
                  <span key={line} className={cx('flex items-baseline gap-1.5', i > 0 && 'mt-0.5')}>
                    <span aria-hidden="true">-</span>
                    <span><HighlightRarityText text={line} /></span>
                  </span>
                ))}
              </Note>
            ) : (
              <Note size="xs" className="my-0"><HighlightRarityText text={note} /></Note>
            )}
          </Inset>
        )}
      </div>
    </Modal>
  );
}

/** 하단 실행 버튼 — 잠금이면 공용 Locked로 감싸고, 우상단 X만 두는 닫기 규칙에 따라 닫기 버튼은 두지 않는다 */
function ItemDetailFooter({ title, label, lockLines, busy, usable, actionLabel, onUse }: {
  title: RecipeTitle;
  label: string;
  lockLines: readonly string[] | null;
  busy: boolean;
  usable: boolean;
  actionLabel: string;
  onUse: () => void;
}) {
  return (
    <div className="mt-3 border-t border-line pt-2">
      {lockLines ? (
        <Locked badge={false} lines={lockLines} title={<GradeName name={title.name} grade={title.grade} />} label={`${label} 사용 잠김`} className="block">
          <Button variant="primary" full disabled>{actionLabel}</Button>
        </Locked>
      ) : (
        <Button variant="primary" full disabled={busy || !usable} onClick={onUse}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
