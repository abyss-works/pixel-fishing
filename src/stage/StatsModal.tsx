import { BOATS } from '../game/logic';
import type { GameState } from '../game/logic';
import type { Movement } from '../game/stats';
import { autoBoost, autoPenaltyHelpText, moveSpeed, powerHelpText, rodAxes, rodPower } from '../game/stats';
import CloseButton from '../ui/CloseButton';
import DataTable from '../ui/DataTable';
import HelpHint from '../ui/HelpHint';
import Modal from '../ui/Modal';
import Panel from '../ui/Panel';

// 스탯창 — 자원 바 클릭으로 열리는 내 캐릭터 성능 열람 (next.md 2).
// 값은 전부 스탯 서비스(stats.ts)에서 온다 — 여기서 규칙을 재계산하지 않는다.
// 낚싯대는 파워 한 축(roadmap 2.1)이고 레벨·파워를 각각 표시한다.
// PERFECT 존은 행에 없다 — 수역별 파워 비례 설계 대상이라 절대값을 보여주지 않는다
// (사용자 확정 2026-08-24). 도움말 문장 톤은 writing-voice.md(로어 서술체·수치 금지).

interface Props {
  game: GameState;
  /** 현재 씬의 이동 방식 — 지역 팩의 movement(거점은 walk) */
  movement: Movement;
  onClose: () => void;
}

export default function StatsModal({ game, movement, onClose }: Props) {
  const speed = moveSpeed(game, movement);
  const axes = rodAxes(game);
  const boost = autoBoost(game).value;
  const boatName = game.boat === 0 ? '없음' : BOATS[game.boat - 1].name;

  return (
    <Modal layer="stage" onClose={onClose}>
      <Panel title="스탯">
        <DataTable>
          <tbody>
            <tr>
              <th scope="row">이동 속도</th>
              <td>{Math.round(speed.value)} ({movement === 'walk' ? '도보' : `${boatName} 항해`})</td>
            </tr>
          </tbody>
        </DataTable>

        <h4 className="text-sm text-text-dim">
          낚싯대
          <HelpHint text={powerHelpText()} />
        </h4>
        <DataTable>
          <tbody>
            <tr><th scope="row">레벨</th><td>Lv.{game.rod}</td></tr>
            <tr><th scope="row">파워</th><td>{rodPower(game)}</td></tr>
            <tr><th scope="row">입질 최소 대기</th><td>{axes.biteMin.value.toFixed(1)}초</td></tr>
            <tr><th scope="row">입질 최대 대기</th><td>{axes.biteMax.value.toFixed(1)}초</td></tr>
            <tr><th scope="row">바 시간</th><td>{axes.sweep.value.toFixed(2)}초</td></tr>
            <tr>
              <th scope="row">
                방치 낚시 페널티
                <HelpHint text={autoPenaltyHelpText()} />
              </th>
              <td>×{Math.round(boost * 10) / 10}</td>
            </tr>
          </tbody>
        </DataTable>

        <CloseButton onClick={onClose} />
      </Panel>
    </Modal>
  );
}
