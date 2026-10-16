import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { GameState } from '../../../game/rules/logic';
import type { GameAction } from '../../../game/rules/actions';
import type { DispatchResult, MaybePromise } from '../../../features/gameplay/service/types';
import { DEV_COMMANDS } from '../../../features/devtools/model/commands';
import type { DevGroup } from '../../../features/devtools/model/commands';
import { DEV_PRESETS } from '../../../features/devtools/model/presets';
import { useDevTools } from '../../../features/devtools/service/useDevTools';
import {
  armForceEncounter, disarmForceEncounter, useForceEncounterArmed,
} from '../../../features/bounty/service/forceEncounter';
import { kstDay } from '../../../features/bounty/service/queryKeys';
import { setCanvasCover, useCanvasCover } from '../../layouts/game-stage/canvasCover';
import { useKeyScope } from '../../ui/hotkeys';
import { cx } from '../../ui/cx';
import Button from '../../ui/Button';
import IconButton from '../../ui/IconButton';
import PillButton from '../../ui/PillButton';
import PixelIcon from '../../ui/PixelIcon';
import Gated from '../../ui/Gated';
import Note from '../../ui/Note';
import SubTabs from '../../ui/SubTabs';
import { canSeeDevTools } from '../admin/gate';
import { useDevEnv } from './devEnv';
import CommandForm from './CommandForm';
import TimeControl from './TimeControl';
import MigrationCode from './MigrationCode';
import { clampPanel, defaultPanelPosition, loadPanelPosition, savePanelPosition } from './panelPosition';
import type { Point2, Size2 } from './panelPosition';

type Section = 'presets' | DevGroup | 'view' | 'ops';

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'presets', label: '프리셋' },
  { key: 'state', label: '상태' },
  { key: 'bounty', label: '수배' },
  { key: 'view', label: '시간·화면' },
  { key: 'ops', label: '운영' },
];

/** 패널 크기는 고정이다 — 묶음을 바꿔도 틀이 변하지 않고 본문만 스크롤한다 */
const PANEL_W = 390;
const PANEL_H_MAX = 860;
const panelSize = (): Size2 => ({
  width: Math.min(PANEL_W, window.innerWidth - 16),
  height: Math.min(PANEL_H_MAX, window.innerHeight - 32),
});
const viewport = (): Size2 => ({ width: window.innerWidth, height: window.innerHeight });

// 개발 도구 — 게임 화면 위 플로팅 패널. 화면 구석 버튼이나 F9로 연다. 게임은 멈추지 않는다.
// 머리줄을 끌어 옮기고, 옮긴 자리는 브라우저 설정으로 남는다.
// 노출은 ?admin + (로컬 또는 소유자 계정)일 때만이고, 서버 명령의 허용 판정은 서버가 따로 한다
// (운영 서버는 개발 명령을 모두 거부한다). 명령·프리셋은 기능 계층의 목록을 그대로 그린다.
// 운영 빌드(앱 최상위가 공급한 개발 환경이 restricted)에서는 조작을 모두 흐리게 막고
// 정보 조회용 대시보드 이동만 남긴다.
const RESTRICTED_NOTE = '운영 서버다 — 여기서는 대시보드 조회만 열 수 있다. 개발 도구는 스테이징·로컬에서 쓴다.';

export default function DevTools({ game, dispatch, setToast, account, uid }: {
  game: GameState;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: (m: string) => void;
  account: string | null;
  uid: string | null;
}) {
  const visible = canSeeDevTools(account);
  const { restricted } = useDevEnv();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<Section>(restricted ? 'ops' : 'presets');
  const [size, setSize] = useState<Size2>(panelSize);
  const [pos, setPos] = useState<Point2>(() =>
    clampPanel(loadPanelPosition() ?? defaultPanelPosition(viewport(), panelSize()), viewport(), panelSize()));
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const tools = useDevTools(dispatch);
  const forceArmed = useForceEncounterArmed();
  const canvasCover = useCanvasCover();

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

  const commandsOf = (group: DevGroup) => DEV_COMMANDS.filter(c => c.group === group);
  const statPlaceholders = {
    gold: String(game.gold), fame: String(game.fame), rod: String(game.rod), boat: `현재 ${game.boat}`,
  };

  return (
    <>
      <button type="button" aria-label="개발 도구" aria-pressed={open} title="개발 도구 (F9)"
              onClick={() => setOpen(o => !o)}
              className={cx('fixed right-3 bottom-3 z-[60] pf-frame p-2 cursor-pointer',
                open ? 'text-gold' : 'text-text-dim hover:text-gold')}>
        <PixelIcon glyph="key" size={20} />
      </button>

      {open && (
        <div role="dialog" aria-label="개발 도구"
             className="fixed z-[60] pf-frame bg-bg flex flex-col text-sm"
             style={{ left: pos.x, top: pos.y, width: size.width, height: size.height }}>
          {/* 머리줄 — 끌어서 옮긴다 */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-line cursor-move select-none touch-none"
               onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
            <h3 className="pf-accent text-lg text-gold flex-1">개발 도구</h3>
            <span className="text-xs text-text-dim">F9 · 끌어서 이동</span>
            <IconButton glyph="close" size={14} tone="dim" aria-label="닫기" className="p-1"
                        onClick={() => setOpen(false)} />
          </div>

          <div className="px-3 pt-2">
            <SubTabs items={SECTIONS} activeKey={section} onSelect={setSection} />
          </div>

          {/* 본문 — 남는 높이를 모두 쓰고 안에서만 스크롤한다 */}
          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 flex flex-col gap-3">
            {restricted && <Note tone="warn" className="my-0">{RESTRICTED_NOTE}</Note>}
            {section !== 'ops' && (
            <Gated open={!restricted} overlay={RESTRICTED_NOTE}>
              <div className="flex flex-col gap-3">
                {section === 'presets' && DEV_PRESETS.map(preset => (
                  <div key={preset.id} className="flex flex-col gap-1">
                    <Button full disabled={tools.busy}
                            onClick={() => void tools.runPreset(preset, { game, uid: uid ?? 'local', day: kstDay() })}>
                      {preset.label}
                    </Button>
                    <span className="text-xs text-text-dim">{preset.hint}</span>
                  </div>
                ))}

                {section === 'state' && commandsOf('state').map(command => (
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
                      네임드를 수주한 구역(둔클레오스는 코모로 심해)에서 낚시해야 조우한다. 조우하면 저절로 꺼진다.
                    </Note>
                    {commandsOf('bounty').map(command => (
                      <CommandForm key={command.id} command={command} busy={tools.busy}
                                   onRun={args => void tools.runCommand(command.id, args)} />
                    ))}
                  </>
                )}

                {section === 'view' && (
                  <>
                    <TimeControl />
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
              </div>
            </Gated>
            )}

            {section === 'ops' && (
              <>
                {/* 대시보드는 조회 전용이라 운영에서도 연다 */}
                <a href="?admin=1#/admin/overview" aria-label="대시보드 열기"
                   className="pf-btn ghost text-sm text-center">
                  대시보드 열기 →
                </a>
                <Gated open={!restricted} overlay={RESTRICTED_NOTE}>
                  <MigrationCode game={game} dispatch={dispatch} setToast={setToast} />
                </Gated>
              </>
            )}
          </div>

          {/* 실행 기록 — 높이 고정. 비어 있어도 자리를 지켜 틀이 흔들리지 않는다 */}
          <div className="h-36 shrink-0 border-t border-line px-3 py-2 flex flex-col gap-1">
            <span className="text-xs text-text-dim">실행 기록 · 서버 명령은 스테이징·로컬 서버에서만 동작한다</span>
            <ul className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-0.5" aria-label="실행 기록">
              {tools.log.map(entry => (
                <li key={entry.id} className={cx('flex items-start gap-1.5', entry.ok ? 'text-text' : 'text-danger')}>
                  <PixelIcon glyph={entry.ok ? 'checkOn' : 'checkOff'} size={12} className="mt-1 shrink-0" />
                  {entry.text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
