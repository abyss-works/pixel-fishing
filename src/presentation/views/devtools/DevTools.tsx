import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { GameState } from '../../../game/rules/logic';
import type { GameAction } from '../../../game/rules/actions';
import type { BaseId } from '../../../game/content/places';
import type { SpotId } from '../../../game/content/spots';
import type { DispatchResult, MaybePromise } from '../../../features/gameplay/service/types';
import {
  DEV_COMMANDS, baseGateNote, devBaseTargets, devNamedLocations, devSpotTargets, devZoneFilterOptions,
} from '../../../features/devtools/model/commands';
import type { DevCommand, DevGroup } from '../../../features/devtools/model/commands';
import { DEV_PRESETS, filterPresets } from '../../../features/devtools/model/presets';
import { useDevTools } from '../../../features/devtools/service/useDevTools';
import {
  armForceEncounter, disarmForceEncounter, useForceEncounterArmed,
} from '../../../features/bounty/service/forceEncounter';
import { setCanvasCover, useCanvasCover } from '../../layouts/game-stage/canvasCover';
import { useKeyScope } from '../../ui/hotkeys';
import { cx } from '../../ui/cx';
import Button from '../../ui/Button';
import IconButton from '../../ui/IconButton';
import PillButton from '../../ui/PillButton';
import PixelIcon from '../../ui/PixelIcon';
import Frame from '../../ui/Frame';
import Tip from '../../ui/Tip';
import Gated from '../../ui/Gated';
import LinkButton from '../../ui/LinkButton';
import Note from '../../ui/Note';
import Panel from '../../ui/Panel';
import Select from '../../ui/Select';
import SubTabs from '../../ui/SubTabs';
import TextInput from '../../ui/TextInput';
import { canSeeDevTools } from '../admin/gate';
import { useDevEnv } from './devEnv';
import CommandForm from './CommandForm';
import TimeControl from './TimeControl';
import MigrationCode from './MigrationCode';
import SnapshotPanel from './SnapshotPanel';
import { clampPanel, defaultPanelPosition, loadPanelPosition, savePanelPosition } from './panelPosition';
import type { Point2, Size2 } from './panelPosition';
import type { Notify } from '../../ui/hud/messageFeed';

type Section = 'presets' | 'move' | 'dex' | 'gear' | 'bounty' | 'account';

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'presets', label: '빠른 프리셋' },
  { key: 'move', label: '이동·시간' },
  { key: 'dex', label: '도감·네임드' },
  { key: 'gear', label: '장비·아이템·업적' },
  { key: 'bounty', label: '수배' },
  { key: 'account', label: '계정·스냅샷' },
];

/** 패널 크기는 고정이다 — 묶음을 바꿔도 틀이 변하지 않고 본문만 스크롤한다 */
const PANEL_W = 420;
const PANEL_H_MAX = 860;
const panelSize = (): Size2 => ({
  width: Math.min(PANEL_W, window.innerWidth - 16),
  height: Math.min(PANEL_H_MAX, window.innerHeight - 32),
});
const viewport = (): Size2 => ({ width: window.innerWidth, height: window.innerHeight });

// 개발 도구 — 게임 화면 위 플로팅 패널. 화면 구석 버튼이나 F9로 연다. 게임은 멈추지 않는다.
// 머리줄을 끌어 옮기고, 옮긴 자리는 브라우저 설정으로 남는다.
// 노출은 ?admin + (로컬 또는 서버가 내려 준 사용 판정)일 때만이고, 서버 명령의 허용 판정은 서버가 따로 한다
// (운영 서버는 개발 명령을 모두 거부한다).
// 운영 빌드(앱 최상위가 공급한 개발 환경이 restricted)에서는 조작을 모두 흐리게 막고
// 정보 조회용 대시보드 이동만 남긴다.
const RESTRICTED_NOTE = '운영 서버다 — 여기서는 대시보드 조회만 열 수 있다. 개발 도구는 스테이징·로컬에서 쓴다.';

export default function DevTools({
  game, dispatch, setToast, granted, onTeleportBase, onTeleportSpot,
}: {
  game: GameState;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: Notify;
  /** 서버가 내려 준 개발 도구 사용 판정 */
  granted: boolean;
  onTeleportBase?: (base: BaseId) => MaybePromise<boolean>;
  onTeleportSpot?: (spot: SpotId) => MaybePromise<boolean>;
}) {
  const visible = canSeeDevTools(granted);
  const { restricted } = useDevEnv();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<Section>(restricted ? 'account' : 'presets');
  const [query, setQuery] = useState('');
  const [zoneFilter, setZoneFilter] = useState('all');
  const [size, setSize] = useState<Size2>(panelSize);
  const [pos, setPos] = useState<Point2>(() =>
    clampPanel(loadPanelPosition() ?? defaultPanelPosition(viewport(), panelSize()), viewport(), panelSize()));
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const tools = useDevTools(dispatch, { onTeleportBase, onTeleportSpot });
  const forceArmed = useForceEncounterArmed();
  const canvasCover = useCanvasCover();

  const zoneOptions = useMemo(() => devZoneFilterOptions(), []);
  const bases = useMemo(() => devBaseTargets(), []);
  const spots = useMemo(() => devSpotTargets(), []);
  const namedLocs = useMemo(() => devNamedLocations(), []);

  useKeyScope(e => {
    if (!visible || e.key !== 'F9') return;
    e.preventDefault();
    setOpen(o => !o);
    return true;
  });

  // 창 크기가 바뀌면 패널 크기와 위치를 다시 가둔다
  useEffect(() => {
    const onResize = () => {
      const next = panelSize();
      setSize(next);
      setPos(p => clampPanel(p, viewport(), next));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!visible) return null;

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return; // 닫기 버튼은 끌기가 아니다
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const moveDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setPos(clampPanel({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy }, viewport(), size));
  };
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    savePanelPosition(pos);
  };

  const q = query.trim().toLowerCase();
  const matchQuery = (text: string) => !q || text.toLowerCase().includes(q);
  const commandsOf = (group: DevGroup): DevCommand[] =>
    DEV_COMMANDS.filter(c => c.group === group && !c.hiddenInForm && matchQuery(`${c.label} ${c.hint} ${c.id}`));
  const visiblePresets = filterPresets(DEV_PRESETS, query, zoneFilter);
  const visibleBases = bases.filter(b =>
    (zoneFilter === 'all' || b.zone === zoneFilter)
    && matchQuery(`${b.label} ${b.zoneLabel} ${b.id}`));
  const visibleSpots = spots.filter(s =>
    (zoneFilter === 'all' || s.zone === zoneFilter)
    && matchQuery(`${s.label} ${s.zoneLabel} ${s.id}`));
  const visibleNamedLocs = namedLocs.filter(n =>
    (zoneFilter === 'all' || n.zone === zoneFilter)
    && matchQuery(`${n.name} ${n.place}`));

  const statPlaceholders = {
    gold: String(game.gold), fame: String(game.fame), rod: String(game.rod), boat: `현재 ${game.boat}`,
  };

  return (
    <>
      <Tip wraps text="개발 도구 (F9)">
        <Frame as="button" type="button" aria-label="개발 도구" aria-pressed={open}
               onClick={() => setOpen(o => !o)}
               className={cx('fixed right-3 bottom-3 z-(--z-devtools) p-2 cursor-pointer',
                 open ? 'text-gold' : 'text-text-dim hover:text-gold')}>
          <PixelIcon glyph="key" size={20} />
        </Frame>
      </Tip>

      {open && (
        <Frame role="dialog" aria-label="개발 도구"
               className="fixed z-(--z-devtools) bg-bg flex flex-col text-sm"
               style={{ left: pos.x, top: pos.y, width: size.width, height: size.height }}>
          {/* 머리줄 — 끌어서 옮긴다 */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-line cursor-move select-none touch-none"
               onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
            <span className="pf-accent text-lg text-gold flex-1">개발 도구</span>
            <span className="text-xs text-text-dim">F9 · 끌어서 이동</span>
            <IconButton glyph="close" size={14} tone="dim" aria-label="닫기" className="p-1"
                        onClick={() => setOpen(false)} />
          </div>

          <div className="px-3 pt-2 flex flex-col gap-1.5">
            <SubTabs items={SECTIONS} activeKey={section} onSelect={setSection} />
            {section !== 'account' && (
              <div className="grid grid-cols-[1fr_auto] gap-1.5 pb-1">
                <TextInput value={query}
                           placeholder="키워드 검색 (프리셋·명령·지역)"
                           aria-label="개발 도구 검색"
                           onChange={e => setQuery(e.target.value)} />
                <Select value={zoneFilter} aria-label="구역 필터"
                        onChange={e => setZoneFilter(e.target.value)}>
                  {zoneOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </div>
            )}
          </div>

          {/* 본문 — 남는 높이를 모두 쓰고 안에서만 스크롤한다 */}
          <div className="flex-1 min-h-0 pf-scroll-panel pf-vscroll px-3 py-3 flex flex-col gap-3">
            {restricted && <Note tone="warn" className="my-0">{RESTRICTED_NOTE}</Note>}
            {section !== 'account' && (
              <Gated open={!restricted} overlay={RESTRICTED_NOTE}>
                <div className="flex flex-col gap-3">
                  {section === 'presets' && (
                    visiblePresets.length === 0 ? (
                      <Note className="my-0">조건에 맞는 프리셋이 없다.</Note>
                    ) : visiblePresets.map(preset => (
                      <div key={preset.id} className="flex flex-col gap-1">
                        <Button full disabled={tools.busy}
                                onClick={() => void tools.runPreset(preset, { game })}>
                          {preset.label}
                        </Button>
                        <span className="text-xs text-text-dim">{preset.hint}</span>
                      </div>
                    ))
                  )}

                  {section === 'move' && (
                    <>
                      <TimeControl />

                      <Panel title="거점 순간이동 (7곳)" className="gap-1.5">
                        <div className="grid grid-cols-2 gap-1.5">
                          {visibleBases.map(b => {
                            const locked = game.boat < b.requiredBoat;
                            return (
                              <Button key={b.id} size="sm" disabled={tools.busy}
                                      variant={game.location.kind === 'base' && game.location.id === b.id ? 'primary' : 'default'}
                                      onClick={() => void tools.teleportBase(b.id, b.label)}>
                                {b.label} ({b.zoneLabel}){locked ? ` · 배${b.requiredBoat}` : ''}
                              </Button>
                            );
                          })}
                        </div>
                        {visibleBases.some(b => game.boat < b.requiredBoat) && (
                          <Note size="2xs" className="my-0">
                            배 단계가 부족한 항구는 먼저 장비 탭에서 배를 맞추거나 필요 배({bases.filter(b => b.requiredBoat > 0).map(b => `${b.label} ${baseGateNote(b.requiredBoat)}`).slice(0, 2).join(', ')} 등)를 충족해야 한다.
                          </Note>
                        )}
                      </Panel>

                      <Panel title="해역 순간이동 (15곳)" className="gap-1.5">
                        <div className="grid grid-cols-2 gap-1.5">
                          {visibleSpots.map(s => {
                            const locked = game.boat < s.requiredBoat;
                            return (
                              <Button key={s.id} size="sm" disabled={tools.busy}
                                      onClick={() => void tools.teleportSpot(s.id, s.label)}>
                                {s.label} ({s.zoneLabel}){locked ? ` · 배${s.requiredBoat}` : ` · Lv${s.requiredRod}`}
                              </Button>
                            );
                          })}
                        </div>
                      </Panel>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-text-dim">캔버스만 가린다. 게임은 계속 돈다.</span>
                        <PillButton type="button" active={canvasCover} aria-pressed={canvasCover}
                                    aria-label="게임 화면 덮개" className="text-sm px-3 py-1.5"
                                    onClick={() => setCanvasCover(!canvasCover)}>
                          {canvasCover ? '덮음' : '열림'}
                        </PillButton>
                      </div>
                    </>
                  )}

                  {section === 'dex' && commandsOf('dex').map(command => (
                    <CommandForm key={command.id} command={command} busy={tools.busy}
                                 onRun={args => void tools.runCommand(command.id, args)} />
                  ))}

                  {section === 'gear' && commandsOf('gear').map(command => (
                    <CommandForm key={command.id} command={command} busy={tools.busy}
                                 placeholders={command.id === 'stats.set' ? statPlaceholders : undefined}
                                 onRun={args => void tools.runCommand(command.id, args)} />
                  ))}

                  {section === 'bounty' && (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className={forceArmed ? 'text-gold' : 'text-text-dim'}>
                          {forceArmed ? '강제 조우 대기 — 다음 낚시에서 조우한다.' : '강제 조우 꺼짐'}
                        </span>
                        <Button variant={forceArmed ? 'primary' : 'default'} aria-pressed={forceArmed}
                                aria-label="다음 낚시 조우 강제"
                                onClick={() => (forceArmed ? disarmForceEncounter() : armForceEncounter())}>
                          {forceArmed ? '취소' : '다음 낚시 조우 강제'}
                        </Button>
                      </div>
                      <Note className="my-0">
                        네임드를 수주한 구역·해역에서 낚시해야 조우한다. 조우하면 저절로 꺼진다.
                        <br />
                        출현 해역: {visibleNamedLocs.map(n => `${n.name}(${n.place})`).join(' · ')}
                      </Note>
                      {commandsOf('bounty').map(command => (
                        <CommandForm key={command.id} command={command} busy={tools.busy}
                                     onRun={args => void tools.runCommand(command.id, args)} />
                      ))}
                    </>
                  )}
                </div>
              </Gated>
            )}

            {section === 'account' && (
              <>
                {/* 대시보드는 조회 전용이라 운영에서도 연다 */}
                <LinkButton href="/admin/#/admin/overview" aria-label="대시보드 열기" variant="ghost"
                            className="text-sm text-center">
                  대시보드 열기 →
                </LinkButton>
                <Gated open={!restricted} overlay={RESTRICTED_NOTE}>
                  <div className="flex flex-col gap-3">
                    <SnapshotPanel game={game}
                                   busy={tools.busy}
                                   onCaptureBounty={tools.captureBounty}
                                   onSaved={entry => tools.pushLog(true, `스냅샷 저장 (${entry.label})`)}
                                   onRestore={entry => void tools.runCommand(
                                     'snapshot.restore',
                                     entry.bounty ? { snapshot: entry.state, bounty: entry.bounty } : { snapshot: entry.state },
                                     `스냅샷 복원 (${entry.label})`,
                                   )} />
                    <MigrationCode game={game} dispatch={dispatch} setToast={setToast} />
                  </div>
                </Gated>
              </>
            )}
          </div>

          {/* 실행 기록 — 높이 고정. 비어 있어도 자리를 지켜 틀이 흔들리지 않는다 */}
          <div className="h-36 shrink-0 border-t border-line px-3 py-2 flex flex-col gap-1">
            <span className="text-xs text-text-dim">실행 기록 · 서버 명령은 스테이징·로컬 서버에서만 동작한다</span>
            <ul className="flex-1 min-h-0 pf-scroll-panel pf-vscroll flex flex-col gap-0.5" aria-label="실행 기록">
              {tools.log.map(entry => (
                <li key={entry.id} className={cx('flex items-start gap-1.5', entry.ok ? 'text-text' : 'text-danger')}>
                  <PixelIcon glyph={entry.ok ? 'checkOn' : 'checkOff'} size={12} className="mt-1 shrink-0" />
                  {entry.text}
                </li>
              ))}
            </ul>
          </div>
        </Frame>
      )}
    </>
  );
}
