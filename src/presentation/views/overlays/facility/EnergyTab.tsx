import { useMemo, useRef, useState } from 'react';
import { REJECT_TEXT } from '../../../../game/rules/logic';
import type { GameState } from '../../../../game/rules/logic';
import {
  ENERGY_NAME, clearSpotPicks, energyResultRows, pickEnergyUids, selectEnergyView,
} from '../../../../features/kitchen/model/energy';
import type { EnergyPicks } from '../../../../features/kitchen/model/energy';
import { toggleSellRow, useSellView } from '../../game/tabs/bag/bagView';
import Button from '../../../ui/Button';
import type { Notify } from '../../../ui/hud/messageFeed';
import Note from '../../../ui/Note';
import PixelIcon from '../../../ui/PixelIcon';
import Popover from '../../../ui/Popover';
import ToggleChip from '../../../ui/ToggleChip';
import Tip, { TipList } from '../../../ui/Tip';
import { cx } from '../../../ui/cx';
import { gradeName } from '../../../ui/gradeName';
import { SCROLL_Y_ROWS } from '../../../ui/scrollArea';
import FishPickTable from './FishPickTable';
import { FacilityTabBody } from './facilityParts';
import type { KitchenAct } from './kitchenParts';

const POPOVER_TIP = [
  '켜진 해역의 물고기를 미리 골라 둬요.',
  '처음에는 지금 배로 갈 수 있는 가장 먼 해역과 그 바로 앞 해역만 꺼져 있어요.',
  '켜거나 끈 해역은 배 단계가 올라도 고른 대로 남아요.',
  '잠근 개체는 켜진 해역이어도 고르지 않아요.',
].join('\n');

/** 얻는 기운을 등급마다 한 줄로 — 합계 툴팁과 결과 메시지 툴팁이 같은 목록을 쓴다 */
const energyRows = (byGrade: Parameters<typeof energyResultRows>[0]) =>
  energyResultRows(byGrade).map(({ grade, count }) => ({ label: gradeName(ENERGY_NAME, grade), value: `+${count}` }));

// 기운 얻기 탭 — 판매 창과 같은 어종 표(FishPickTable)로 물고기를 골라 생명의 기운으로 바꾼다. 확정한 뒤에도 창은 열려 있고
// 결과는 메시지 창에 한 줄로 남는다. 체크 기본값은 해역 기준이고 게임 규칙이 정한다. 해역별 켜짐과 꺼짐은 확정 버튼 왼쪽
// 정사각형 톱니바퀴 버튼에 붙은 팝오버에서 고른다(서버 액션). 확정 영역은 오른쪽 열 맨 아래에 고정한다.
export default function EnergyTab({ game, busy, act, setToast }: {
  game: GameState;
  busy: boolean;
  act: KitchenAct;
  setToast: Notify;
}) {
  const [picks, setPicks] = useState<EnergyPicks>({});
  const [popOpen, setPopOpen] = useState(false);
  const gearRef = useRef<HTMLButtonElement>(null);
  const { collapsed } = useSellView(); // 어종 행 펼침 — 판매 창과 같은 표라 같은 저장소를 쓴다
  // 가방이 수천 마리여도 조리 시계가 다시 그릴 때마다 행을 새로 묶지 않는다
  const view = useMemo(() => selectEnergyView(game, picks), [game, picks]);
  const reason = view.allowed.ok ? null : REJECT_TEXT[view.allowed.reason];

  const toggleRow = (uids: string[], allOn: boolean) => setPicks(p => pickEnergyUids(p, uids, !allOn));
  const toggleOne = (uid: string) => {
    const on = view.rows.some(row => row.selected.some(inst => inst.uid === uid));
    setPicks(p => pickEnergyUids(p, [uid], !on));
  };

  const extract = () => act({ type: 'extractEnergy', uids: view.uids }, r => {
    if (r.result.type !== 'extract') return;
    const total = Object.values(r.result.energy).reduce((sum, n) => sum + n, 0);
    setToast(`${ENERGY_NAME} ${total}개를 얻었어요!`, 'gold', { target: String(total), rows: energyRows(r.result.energy) });
  });
  const setTarget = (spot: (typeof view.spots)[number]) =>
    act({ type: 'setEnergyTarget', spot: spot.id, on: !spot.on }, () => setPicks(p => clearSpotPicks(p, game.bag, spot.id)));
  const resetTargets = () => act({ type: 'resetEnergyTargets' }, () =>
    setPicks(p => view.spots.filter(s => s.overridden).reduce((acc, s) => clearSpotPicks(acc, game.bag, s.id), p)));

  const list = view.rows.length === 0 ? (
    <Note>가방이 비어 있어요.<br />어군을 찾아 낚시해 보세요.</Note>
  ) : (
    <FishPickTable rows={view.rows} expanded={collapsed} onToggleExpand={toggleSellRow}
                   onToggleRow={toggleRow} onToggleOne={toggleOne}
                   action="기운 얻기" heads={{ check: '선택', value: ENERGY_NAME }}
                   valueOf={row => `+${row.selectedCount}`} emptyValue="0" />
  );

  const confirm = (
    <Button variant="primary" full className="h-10 py-0" disabled={!view.allowed.ok || view.total === 0 || busy} onClick={extract}>
      기운 얻기 ({view.total}마리)
    </Button>
  );

  return (
    <FacilityTabBody list={list} detail={null}
      foot={(
        <>
          {/* 안내는 자리를 늘 확보한다 — 잠근 개체가 없을 때는 보이지 않는 채로 같은 높이를 둔다 */}
          <Note className={cx('my-0', view.lockedCount === 0 && 'invisible')}>
            잠근 개체 {view.lockedCount}마리는 기운 얻기에서 빠져요.<br />잠금은 가방 탭에서 풀 수 있어요.
          </Note>
          <Note className="my-0">기운을 얻은 물고기는 가방에서 사라져요.<br />도감과 명성은 그대로 남아요.</Note>
          <div className={cx('flex items-center justify-between text-sm', view.total === 0 && 'opacity-50')}>
            <span className="text-text-dim">{ENERGY_NAME}</span>
            <Tip text={<TipList rows={energyRows(view.byGrade)} />} className="pf-accent text-xs">+{view.total}</Tip>
          </div>
          <div className="relative flex gap-2">
            <Tip wraps className="flex shrink-0"
                 text={view.hasOverride ? '해역별 기운 대상 고르기\n기본값과 다르게 고른 해역이 있어요.' : '해역별 기운 대상 고르기'}>
              <Button ref={gearRef} pressed={popOpen} aria-expanded={popOpen} aria-label="해역별 기운 대상 고르기"
                      className="relative size-10 p-0 flex items-center justify-center" onClick={() => setPopOpen(o => !o)}>
                <PixelIcon glyph="gear" size={14} />
                {view.hasOverride && <span aria-hidden className="absolute top-[3px] right-[3px] size-1.5 bg-gold" />}
              </Button>
            </Tip>
            <Popover open={popOpen} onClose={() => setPopOpen(false)} anchorRef={gearRef} label="해역별 기운 대상">
              <Tip text={POPOVER_TIP} className="self-start text-sm">해역별 기운 대상</Tip>
              <div className={`${SCROLL_Y_ROWS} max-h-[216px] flex flex-col`}>
                {view.spots.map(s => (
                  <div key={s.id} className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-2 py-1.5 text-sm">
                    <span className="flex">
                      {s.overridden && (
                        <Tip plain text={s.defaultOn ? '기본값은 켜짐이에요.' : '기본값은 꺼짐이에요.'}>
                          <span className="block size-1.5 bg-gold" />
                        </Tip>
                      )}
                    </span>
                    <span className="truncate">{s.name}</span>
                    <ToggleChip pressed={s.on} disabled={busy} aria-label={`${s.name} 기운 대상`} onClick={() => setTarget(s)}>
                      {s.on ? '켜짐' : '꺼짐'}
                    </ToggleChip>
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <Button size="sm" disabled={!view.hasOverride || busy} onClick={resetTargets}>기본값으로 되돌리기</Button>
              </div>
            </Popover>
            <div className="flex-1 min-w-0">
              {reason ? <Tip wraps text={reason} className="block">{confirm}</Tip> : confirm}
            </div>
          </div>
        </>
      )} />
  );
}
