import { useMemo, useState } from 'react';
import type { GameAction } from '../../../../game/rules/actions';
import { REJECT_TEXT } from '../../../../game/rules/logic';
import type { DispatchResult, MaybePromise } from '../../../../features/gameplay/service/types';
import { useNow } from '../../../../features/gameplay/service/useGameTime';
import { sendNotice } from '../../../../features/display/model/toastPolicy';
import {
  ENERGY_NAME, buildEnergyExtractNotice, defaultQuickEnergyGrades, selectQuickEnergyView,
} from '../../../../features/kitchen/model/energy';
import type { EnergyGrade, QuickEnergyGame } from '../../../../features/kitchen/model/energy';
import { when } from '../../../../shared/lib/when';
import Button from '../../../ui/Button';
import { cx } from '../../../ui/cx';
import { fmtFishCount, fmtNum } from '../../../ui/format';
import type { Notify } from '../../../ui/hud/messageFeed';
import Inset from '../../../ui/Inset';
import ItemSprite from '../../../ui/ItemSprite';
import Modal from '../../../ui/Modal';
import Note from '../../../ui/Note';
import Tip from '../../../ui/Tip';
import ToggleChip from '../../../ui/ToggleChip';
import { GradeName, RarityText } from '../../../ui/fish/RarityTag';

// 가방 하단 기운 얻기 단열 앱 창 — 사이드바 가방 탭에서 여는 화면 전체 덮개(layer="app")다.
// 미잠금 물고기를 등급 칩으로만 켜고 끄고 한 번에 기운으로 바꾼 뒤 성공 시 창을 닫는다.
// 해역별 대상 설정과 어종 표는 거점 궤짝/어시장(SaleWindow)에 둔다.
export default function EnergyPanel({ game, dispatch, setToast, onClose }: {
  game: QuickEnergyGame;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: Notify;
  onClose: () => void;
}) {
  const now = useNow();
  const [selected, setSelected] = useState<Set<EnergyGrade>>(defaultQuickEnergyGrades);
  const [busy, setBusy] = useState(false);
  const view = useMemo(() => selectQuickEnergyView(game, selected, now), [game, selected, now]);

  const toggleGrade = (grade: EnergyGrade) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(grade)) next.delete(grade);
      else next.add(grade);
      return next;
    });
  };

  const extract = () => {
    if (busy) return;
    setBusy(true);
    when(dispatch({ type: 'extractEnergy', uids: view.uids }), r => {
      setBusy(false);
      if (r.status === 'ok') {
        onClose();
        if (r.result.type === 'extract') sendNotice(setToast, buildEnergyExtractNotice(r.result.energy));
      } else if (r.status === 'rejected') {
        sendNotice(setToast, { kind: 'system.modalRejected', text: REJECT_TEXT[r.error] });
      }
    });
  };

  const confirm = (
    <Button variant="primary" full disabled={!view.allowed.ok || view.count === 0 || busy} onClick={extract}>
      기운 얻기 ({fmtFishCount(view.count)})
    </Button>
  );

  return (
    <Modal
      layer="app"
      title="기운 얻기"
      onClose={onClose}
      footer={(
        <div className="mt-3 border-t border-line pt-2 flex flex-col gap-2">
          <Note className="my-0">기운으로 바꾼 물고기는 되돌릴 수 없어요.</Note>
          {view.reason ? <Tip wraps text={view.reason} className="block">{confirm}</Tip> : confirm}
        </div>
      )}
    >
      <div className="flex flex-col gap-2">
        <div role="group" aria-label="등급 선택" className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-text-dim">등급 선택</span>
          {view.chips.map(chip => (
            <ToggleChip
              key={chip.grade}
              pressed={chip.on}
              disabled={chip.fishCount === 0}
              aria-label={`${chip.name} 등급 (${fmtNum(chip.fishCount)}마리) ${chip.on ? '해제' : '선택'}`}
              onClick={() => toggleGrade(chip.grade)}
            >
              <span>{chip.on ? <RarityText rarity={chip.grade} /> : chip.name} ({fmtNum(chip.fishCount)})</span>
            </ToggleChip>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 mobile:grid-cols-1">
          {view.tiles.map(tile => (
            <Inset key={tile.grade} tone={tile.on ? 'base' : 'deep'} className="flex items-center gap-2 p-2 min-w-0">
              <ItemSprite kind="energy" id={tile.itemId} preset="list" className="shrink-0" />
              <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-1 text-xs">
                  <span className={tile.on ? 'text-text' : 'text-text-dim'}>
                    <GradeName name={ENERGY_NAME} grade={tile.grade} />
                  </span>
                  <span className={cx('pf-accent shrink-0', tile.gain > 0 ? 'text-accent' : 'text-text-dim')}>
                    {tile.gainText}
                  </span>
                </div>
                <div className="pf-accent text-2xs text-text-dim flex flex-wrap items-baseline gap-x-1">
                  <span className="whitespace-nowrap">{tile.currentText}</span>
                  <span className="whitespace-nowrap">→ {tile.afterText}</span>
                </div>
              </div>
            </Inset>
          ))}
        </div>

        <Note size="xs" className="my-0 leading-relaxed">
          {view.unlockedCount === 0 ? (
            view.lockedCount > 0
              ? <>바꿀 수 있는 물고기가 없어요. 잠근 물고기 <span className="pf-accent text-text">{fmtNum(view.lockedCount)}</span>마리는 빠져요.</>
              : '바꿀 수 있는 물고기가 없어요.'
          ) : view.count === 0 ? (
            '기운으로 바꿀 등급을 하나 이상 골라 주세요.'
          ) : (
            <>
              선택한 물고기 <b className="pf-accent text-gold">{fmtNum(view.count)}</b>마리를 바꿔요.{' '}
              {view.lockedCount > 0
                ? `(잠근 물고기 ${fmtNum(view.lockedCount)}마리는 빠져요)`
                : '(잠근 물고기는 빠져요)'}
            </>
          )}
        </Note>
      </div>
    </Modal>
  );
}
