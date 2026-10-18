import { useState } from 'react';
import type { GameState } from '../../../../game/rules/logic';
import type { Movement, Stat } from '../../../../game/rules/stats';
import type { RegionId } from '../../../../game/content/places';
import { SPOTS } from '../../../../game/content/spots';
import { POWER_RULES, autoPenaltyHelpText, powerHelpText } from '../../../../game/rules/stats';
import { MANUAL_POWER_BONUS } from '../../../../game/rules/power';
import { selectInitialStatsSpotIndex, selectStatsModalData } from '../../../../features/gameplay/model/stats';
import ArrowButton from '../../../ui/ArrowButton';
import DataTable from '../../../ui/DataTable';
import HelpHint from '../../../ui/HelpHint';
import Modal from '../../../ui/Modal';
import Note from '../../../ui/Note';
import Panel from '../../../ui/Panel';
import Subheading from '../../../ui/Subheading';

// 스탯창 — 자원 바 클릭으로 여는 내 캐릭터 성능 화면.
// 값은 전부 스탯 서비스(스탯 계산)에서 온다 — 여기서 규칙을 재계산하지 않는다.
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
  /** 현재 위치 지역 — 캐루셀이 이 지역 수역부터 시작한다. 병합 바다(world)는 마을을 뺀 전체 */
  region: RegionId;
  onClose: () => void;
}

export default function StatsModal({ game, movement, region, onClose }: Props) {
  const [idx, setIdx] = useState(() => selectInitialStatsSpotIndex(region));
  const step = (d: 1 | -1) => setIdx(i => (i + d + SPOTS.length) % SPOTS.length);
  const {
    speed, axes, boatName, spot, requirement: req, requirementLevel: reqLv,
    effectiveBite: effBite, autoBoost: boost, manualBonus: bonus,
    powerZones: pz, currentPower, underpowered,
  } = selectStatsModalData(game, movement, idx);

  const pageBtn = (dir: 1 | -1) => (
    <ArrowButton dir={dir} aria-label={dir < 0 ? '이전 해역' : '다음 해역'}
            onClick={() => step(dir)} />
  );

  return (
    <Modal layer="stage" onClose={onClose}>
      <Panel title="스탯" onClose={onClose}>
        {/* table-fixed — 값 폭('요구 미달'↔'45%' 등)에 따라 열이 흔들리는 것을 막는다.
            충족/미달 경계에서 레이아웃이 점프하지 않게 열비를 고정한다(v0.6.4). */}
        <DataTable className="table-fixed w-full">
          <colgroup><col className="w-[42%]" /><col /></colgroup>
          <tbody>
            <tr>
              <th scope="row">이동 속도</th>
              <td>{Math.round(speed.value)} ({movement === 'walk' ? '도보' : `${boatName} 항해`})</td>
            </tr>
          </tbody>
        </DataTable>

        <Subheading>
          낚싯대
          <HelpHint text={powerHelpText()} />
        </Subheading>

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

        <DataTable className="table-fixed w-full">
          <colgroup><col className="w-[42%]" /><col /></colgroup>
          <tbody>
            <tr><th scope="row">현재 레벨</th><td>Lv.{game.rod}</td></tr>
            <tr><th scope="row">현재 파워</th><td>{currentPower}</td></tr>
            <tr><th scope="row">바 시간</th><td>{axes.sweep.value.toFixed(2)}초 <span className="text-2xs text-text-dim"></span></td></tr>
            <tr><th scope="row">입질 최소 대기</th><td><StatCell stat={effBite.min} unit="초" /></td></tr>
            <tr><th scope="row">입질 최대 대기</th><td><StatCell stat={effBite.max} unit="초" /></td></tr>
            <tr>
              <th scope="row">
                GOOD 영역
                <HelpHint text="노란 영역이 바 폭에서 차지하는 크기예요. 요구 파워를 넘친 만큼 넓어져요." />
              </th>
              <td>{pz.yellow > 0 ? `${Math.round(pz.yellow)}%` : '요구 미달'}</td>
            </tr>
            <tr>
              <th scope="row">
                PERFECT 영역
                <HelpHint text={`가운데에 열리는 빨간 영역이에요. 파워가 요구치보다 ${POWER_RULES.redMinExcess} 넘게 높으면 생겨요.`} />
              </th>
              <td>{pz.red > 0 ? `${Math.round(pz.red)}%` : pz.yellow > 0 ? '-' : '요구 미달'}</td>
            </tr>
            <tr>
              <th scope="row">
                수동 확률 보정
                <HelpHint text={`직접 낚을 때 희귀한 물고기가 더 잘 낚여요. 최대 ×${MANUAL_POWER_BONUS.max.toFixed(1)}까지 올라요.`} />
              </th>
              <td>×{bonus.value.toFixed(1)}</td>
            </tr>
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
            플레이어에게 하는 안내라 해요체로 쓴다 */}
        <Note>
          {underpowered
            ? '이 해역에서는 더 강한 낚싯대가 필요해요. 물고기가 미끼만 먹고 달아나요.'
            : '낚싯대가 충분히 강해서 이 해역의 물고기를 낚기 쉬워요.'}
        </Note>
      </Panel>
    </Modal>
  );
}
