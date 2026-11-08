import { artifactById } from '../../../game/content/artifacts';
import type { GameAction } from '../../../game/rules/actions';
import { REJECT_TEXT } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import { settleAction } from '../../gameplay/service/useGame';
import type { DispatchResult, MaybePromise } from '../../gameplay/service/types';
import { LEVEL_UP_TEXT, levelUpToast, selectArtifactLevel } from '../model/artifactLevel';

export type LevelUpOutcome = { ok: true; toast: string } | { ok: false; notice: string | null };

/**
 * 유물 강화 - 보낼 수 없는 상태(갖지 않음, 전설, 최고 레벨, 재료 부족)는 서버에 보내지 않고 문안의 거부 문구를 돌려준다.
 * 상태 반영은 낙관적으로 하지 않는다: 서버가 받아들여 돌려준 상태를 dispatch가 게임 상태에 넣고, 이 함수는 성공 토스트만 만든다.
 * 서버가 재료 부족으로 거부하면(화면 상태가 어긋난 경우) 같은 문안을 쓴다. 던지지 않는다
 */
export async function levelUpArtifact(
  dispatch: (action: GameAction) => MaybePromise<DispatchResult>, game: GameState, artifactId: string,
): Promise<LevelUpOutcome> {
  const artifact = artifactById(artifactId);
  if (!artifact) return { ok: false, notice: REJECT_TEXT['bad-request'] };
  const view = selectArtifactLevel(game, artifact);
  if (view.status !== 'ready') return { ok: false, notice: LEVEL_UP_TEXT.notice[view.status] };
  const settled = await settleAction(
    () => dispatch({ type: 'levelUpArtifact', artifact: artifact.id }),
    { 'material-missing': LEVEL_UP_TEXT.notice.short },
  );
  if (!settled.ok) return settled;
  return { ok: true, toast: levelUpToast(artifact, view.next!.level) };
}
