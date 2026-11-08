import { useState } from 'react';
import type { Artifact } from '../../../../../game/content/artifacts';
import type { GameAction } from '../../../../../game/rules/actions';
import type { GameState } from '../../../../../game/rules/logic';
import type { DispatchResult, MaybePromise } from '../../../../../features/gameplay/service/types';
import { LEVEL_UP_TEXT, levelText, selectArtifactLevel } from '../../../../../features/inventory/model/artifactLevel';
import type { ArtifactLevelView } from '../../../../../features/inventory/model/artifactLevel';
import { levelUpArtifact } from '../../../../../features/inventory/service/levelUpArtifact';
import Button from '../../../../ui/Button';
import CostBox from '../../../../ui/CostBox';
import CostLine from '../../../../ui/CostLine';
import Inset from '../../../../ui/Inset';
import KeyValueRow from '../../../../ui/KeyValueRow';
import LoreParagraph from '../../../../ui/LoreParagraph';
import Modal from '../../../../ui/Modal';
import PageTitle from '../../../../ui/PageTitle';
import Tip from '../../../../ui/Tip';
import { RarityText } from '../../../../ui/fish/RarityTag';
import type { Notify } from '../../../../ui/hud/messageFeed';
import { fmtNum } from '../../../../ui/format';
import {
  artifactEffectKeys, artifactEffectLabel, artifactEffectValue, artifactSystemLines,
} from '../../../../ui/artifactEffects';
import { CompareTable, ConfirmButton } from '../../../overlays/facility/facilityParts';

// 유물 상세 창 - 가방 탭의 유물 보기에서 보유 유물 줄을 누르면 열린다. 강화 버튼은 이 창 안에만 있다.
// 위에서 아래로: 제목(이름과 등급), 지금 레벨과 강화 후 레벨의 비교 표, 로어, 그리고 아래 고정 영역의
// 잔액 칸(필요한 재료의 보유 → 강화 후)과 강화 버튼. 최고 레벨은 현재 열만 보이고 잔액 칸 없이 꺼진 버튼이 서며,
// 레벨이 없는 전설 유물은 보너스와 페널티 두 줄뿐이고 버튼이 없다.
export default function ArtifactDetail({ artifact, game, dispatch, setToast, onClose }: {
  artifact: Artifact;
  game: GameState;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: Notify;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const view = selectArtifactLevel(game, artifact);
  const { next } = view;

  const levelUp = async () => {
    setBusy(true);
    const outcome = await levelUpArtifact(dispatch, game, artifact.id);
    setBusy(false);
    if (outcome.ok) setToast(outcome.toast, 'gold');
    else if (outcome.notice) setToast(outcome.notice, 'warn');
  };

  return (
    <Modal onClose={onClose}
           header={
             <header className="mb-3 flex flex-wrap items-baseline gap-x-3 border-b border-line pb-2 pr-8">
               <PageTitle>{artifact.name}</PageTitle>
               <span className="text-sm"><RarityText rarity={artifact.grade} /> 유물</span>
             </header>
           }
           footer={<Footer view={view} busy={busy} onLevelUp={levelUp} />}>
      <div className="flex flex-col gap-3">
        {view.hasLevel ? (
          <CompareTable
            heads={next
              ? [`현재(${levelText(view.level)})`, `강화 후(${levelText(next.level)})`]
              : [`현재(${levelText(view.level)})`]}
            rows={artifactEffectKeys(artifact).map(effect => ({
              label: artifactEffectLabel(effect),
              value: artifactEffectValue(artifact, effect, view.level),
              next: next ? artifactEffectValue(artifact, effect, next.level) : undefined,
            }))} />
        ) : <SystemRows artifact={artifact} />}
        <LoreParagraph className="text-xs leading-[1.8] text-text-dim">{artifact.lore}</LoreParagraph>
      </div>
    </Modal>
  );
}

/** 전설 유물의 효과 - 레벨 줄 없이 보너스와 페널티 두 줄 */
function SystemRows({ artifact }: { artifact: Artifact }) {
  const { bonus, penalty } = artifactSystemLines(artifact);
  return (
    <Inset divided>
      {bonus && <KeyValueRow label="보너스" value={<span className="block text-right text-accent">{bonus}</span>} />}
      {penalty && <KeyValueRow label="페널티" value={<span className="block text-right text-danger">{penalty}</span>} />}
    </Inset>
  );
}

/** 아래 고정 영역 - 확정 직전에 읽을 잔액 칸과 강화 버튼. 윗선으로 본문과 가른다 */
function Footer({ view, busy, onLevelUp }: { view: ArtifactLevelView; busy: boolean; onLevelUp: () => void }) {
  const { status, material, next } = view;
  if (status === 'legendary' || status === 'unowned') return null;
  if (status === 'max') {
    return (
      <div className="mt-3 border-t border-line pt-2">
        <Button full disabled>{LEVEL_UP_TEXT.maxButton}</Button>
      </div>
    );
  }
  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-line pt-2">
      <div role="group" aria-label={LEVEL_UP_TEXT.materialLabel}>
        <CostBox>
          <CostLine have={material.have} delta={-next!.cost} format={fmtNum}
                    label={<Tip text={LEVEL_UP_TEXT.materialTip}>{material.name}</Tip>} />
        </CostBox>
      </div>
      <ConfirmButton reason={status === 'short' ? LEVEL_UP_TEXT.notice.short : null}
                     disabled={status !== 'ready' || busy} onClick={onLevelUp}>
        {LEVEL_UP_TEXT.button}
      </ConfirmButton>
    </div>
  );
}
