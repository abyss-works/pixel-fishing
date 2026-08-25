import { useState } from 'react';
import { BOATS } from '../game/logic';
import type { GameState } from '../game/logic';
import type { Movement, Stat } from '../game/stats';
import {
  autoBoostForSpot, autoPenaltyHelpText, effectiveBite, moveSpeed,
  powerHelpText, rodAxes, rodPower, powerOfLevel,
} from '../game/stats';
import { SPOTS } from '../data/spots';
import type { SpotRegionId } from '../data/spots';
import CloseButton from '../ui/CloseButton';
import DataTable from '../ui/DataTable';
import HelpHint from '../ui/HelpHint';
import Modal from '../ui/Modal';
import Note from '../ui/Note';
import Panel from '../ui/Panel';

// 스탯창 — 자원 바 클릭으로 열리는 내 캐릭터 성능 열람 (next.md 2).
// 값은 전부 스탯 서비스(stats.ts)에서 온다 — 여기서 규칙을 재계산하지 않는다.
// 낚싯대 표는 **수역 캐루셀**: 좌우 화살표로 수역을 넘기면 그 수역 기준의 유효 스탯이
// 같은 행 구성으로 바뀐다(입질 대기·방치 페널티는 해역 대비 상대치, 호버로 ±내역).
// 바 시간(sweep)만 레벨/파워 무관 절대수치다.

function StatCell({ stat, unit }: { stat: Stat; unit: string }) {
  const hasMods = stat.mods.length > 0;
  const detail = hasMods
    ? `기본 ${stat.base.toFixed(1)}${unit}` +
      stat.mods.map(m => ` ${m.delta >= 0 ? '+' : ''}${m.delta.toFixed(1)}${unit} (${m.label})`).join('') +
      ` = ${stat.value.toFixed(1)}${unit}`
    : undefined;
  return (
    <span>
      {stat.value.toFixed(1)}{unit}
      {detail && <HelpHint text={detail} />}
    </span>
  );
}

interface Props {
  game: GameState;
  /** 현재 씬의 이동 방식 — 지역 팩의 movement(거점은 walk) */
  movement: Movement;
  /** 현재 위치 지역 — 캐루셀이 이 지역 수역부터 시작한다 */
  region: SpotRegionId;
  onClose: () => void;
}

export default function StatsModal({ game, movement, region, onClose }: Props) {
  const speed = moveSpeed(game, movement);
  const axes = rodAxes(game);
  const boatName = game.boat === 0 ? '없음' : BOATS[game.boat - 1].name;

  // 캐루셀 후보 = 전체 수역(SPOTS 순서). 초기값 = 현재 지역의 대표(요구량 최대) 수역.
  const startIdx = (() => {
    let best = 0;
    SPOTS.forEach((s, i) => {
      if (s.region === region && (s.powerReq ?? 0) >= (SPOTS[best].powerReq ?? 0)) best = i;
    });
    return best;
  })();
  const [idx, setIdx] = useState(startIdx);
  const step = (d: 1 | -1) => setIdx(i => (i + d + SPOTS.length) % SPOTS.length);

  const spot = SPOTS[idx];
  const req = spot.powerReq ?? 0;
  const reqLv = req <= powerOfLevel(1) ? 1 : Math.max(1, Math.ceil((req - 10) / 5) + 1);
  const effBite = effectiveBite(game, spot.id);
  const boost = autoBoostForSpot(game, spot.id);

  const pageBtn = (dir: 1 | -1) => (
    <button type="button" aria-label={dir < 0 ? '이전 수역' : '다음 수역'}
            onClick={() => step(dir)}
            className="px-2 py-0.5 border border-line rounded-sm text-text-dim hover:text-text cursor-pointer">
      {dir < 0 ? '‹' : '›'}
    </button>
  );

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

        {/* 수역 캐루셀 — 좌우로 수역을 넘기면 아래 표가 그 수역 기준으로 바뀐다 */}
        <div className="flex items-center justify-between gap-2 mb-1 text-xs">
          {pageBtn(-1)}
          <span className="text-center flex-1">
            <b className="text-gold">{spot.name}</b>
            <span className="text-text-dim">
              {' '}· 요구 {req === 0 ? '없음' : `Lv.${reqLv}(파워 ${req})`}
            </span>
          </span>
          {pageBtn(1)}
        </div>

        <DataTable>
          <tbody>
            <tr><th scope="row">현재 레벨</th><td>Lv.{game.rod}</td></tr>
            <tr><th scope="row">현재 파워</th><td>{rodPower(game)}</td></tr>
            <tr><th scope="row">바 시간</th><td>{axes.sweep.value.toFixed(2)}초 <span className="text-2xs text-text-dim"></span></td></tr>
            <tr><th scope="row">입질 최소 대기</th><td><StatCell stat={effBite.min} unit="초" /></td></tr>
            <tr><th scope="row">입질 최대 대기</th><td><StatCell stat={effBite.max} unit="초" /></td></tr>
            <tr>
              <th scope="row">
                방치 낚시 페널티
                <HelpHint text={autoPenaltyHelpText()} />
              </th>
              <td>
                ×{boost.value.toFixed(1)}
                {boost.mods.length > 0 && (
                  <HelpHint text={`기본 ×${boost.base.toFixed(1)} ${boost.mods.map(m => `${m.delta >= 0 ? '+' : ''}${m.delta.toFixed(1)} (${m.label})`).join(' ')} = ×${boost.value.toFixed(1)}`} />
                )}
              </td>
            </tr>
          </tbody>
        </DataTable>
        {/* 조건부 렌더 대신 항상 렌더 — 수역을 넘길 때 높이가 흔들리는 점프를 막는다.
            유저 노출 문장이라 writing-voice 규칙 적용(로어체 · 수치 금지) */}
        <Note>
          {rodPower(game) < req
            ? '더 좋은 낚싯대가 필요해보인다. 물고기가 미끼만 훔쳐먹고 간다.'
            : '낚싯대가 좋은만큼 물고기를 낚기 쉬워졌다.'}
        </Note>

        <CloseButton onClick={onClose} />
      </Panel>
    </Modal>
  );
}
