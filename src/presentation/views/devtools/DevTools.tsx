import { useState } from 'react';
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
import Panel from '../../ui/Panel';
import PillButton from '../../ui/PillButton';
import PixelIcon from '../../ui/PixelIcon';
import Note from '../../ui/Note';
import SubTabs from '../../ui/SubTabs';
import { canSeeDevTools } from '../admin/gate';
import CommandForm from './CommandForm';
import TimeControl from './TimeControl';
import MigrationCode from './MigrationCode';

type Section = 'presets' | DevGroup | 'view' | 'ops';

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'presets', label: '프리셋' },
  { key: 'state', label: '상태' },
  { key: 'bounty', label: '수배' },
  { key: 'view', label: '시간·화면' },
  { key: 'ops', label: '운영' },
];

// 개발 도구 — 게임 화면 위 플로팅 패널. 화면 구석 버튼이나 F9로 연다. 게임은 멈추지 않는다.
// 노출은 ?admin + (로컬 또는 소유자 계정)일 때만이고, 서버 명령의 허용 판정은 서버가 따로 한다
// (운영 서버는 개발 명령을 모두 거부한다). 명령·프리셋은 기능 계층의 목록을 그대로 그린다.
export default function DevTools({ game, dispatch, setToast, account, uid }: {
  game: GameState;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: (m: string) => void;
  account: string | null;
  uid: string | null;
}) {
  const visible = canSeeDevTools(account);
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<Section>('presets');
  const tools = useDevTools(dispatch);
  const forceArmed = useForceEncounterArmed();
  const canvasCover = useCanvasCover();

  useKeyScope(e => {
    if (!visible || e.key !== 'F9') return;
    e.preventDefault();
    setOpen(o => !o);
    return true;
  });

  if (!visible) return null;

  const commandsOf = (group: DevGroup) => DEV_COMMANDS.filter(c => c.group === group);
  const statPlaceholders = {
    gold: String(game.gold), fame: String(game.fame), rod: String(game.rod), boat: `현재 ${game.boat}`,
  };

  return (
    <>
      <button type="button" aria-label="개발 도구" aria-pressed={open} title="개발 도구 (F9)"
              onClick={() => setOpen(o => !o)}
              className={cx('fixed right-3 bottom-3 z-[60] pf-frame p-1.5 cursor-pointer',
                open ? 'text-gold' : 'text-text-dim hover:text-gold')}>
        <PixelIcon glyph="key" size={14} />
      </button>

      {open && (
        <div className="fixed right-3 bottom-12 z-[60] w-[340px] max-w-[calc(100vw-24px)] max-h-[75vh] overflow-y-auto bg-bg">
          <Panel title="개발 도구" onClose={() => setOpen(false)}>
            <SubTabs items={SECTIONS} activeKey={section} onSelect={setSection} />

            {section === 'presets' && DEV_PRESETS.map(preset => (
              <div key={preset.id} className="flex flex-col gap-0.5">
                <PillButton type="button" full disabled={tools.busy}
                            onClick={() => void tools.runPreset(preset, { game, uid: uid ?? 'local', day: kstDay() })}>
                  {preset.label}
                </PillButton>
                <span className="text-2xs text-text-dim">{preset.hint}</span>
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
                  <span className="text-xs text-text-dim">
                    {forceArmed ? '강제 조우 대기 — 다음 낚시에서 조우한다.' : '강제 조우 꺼짐'}
                  </span>
                  <PillButton type="button" active={forceArmed} aria-pressed={forceArmed}
                              aria-label="다음 낚시 조우 강제"
                              onClick={() => (forceArmed ? disarmForceEncounter() : armForceEncounter())}>
                    {forceArmed ? '취소' : '다음 낚시 조우 강제'}
                  </PillButton>
                </div>
                <Note size="2xs" className="my-0">
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
                  <span className="text-xs text-text-dim">캔버스만 가린다. 게임은 계속 돈다.</span>
                  <PillButton type="button" active={canvasCover} aria-pressed={canvasCover}
                              aria-label="게임 화면 덮개" onClick={() => setCanvasCover(!canvasCover)}>
                    {canvasCover ? '덮음' : '열림'}
                  </PillButton>
                </div>
              </>
            )}

            {section === 'ops' && (
              <>
                <MigrationCode game={game} dispatch={dispatch} setToast={setToast} />
                <a href="?admin=1#/admin/overview" aria-label="대시보드 열기"
                   className="pf-btn ghost text-sm text-center">
                  대시보드 열기 →
                </a>
              </>
            )}

            {tools.log.length > 0 && (
              <ul className="border-t border-line pt-1 flex flex-col gap-0.5 text-2xs" aria-label="실행 기록">
                {tools.log.map(entry => (
                  <li key={entry.id} className={cx('flex items-start gap-1', entry.ok ? 'text-text-dim' : 'text-danger')}>
                    <PixelIcon glyph={entry.ok ? 'checkOn' : 'checkOff'} size={10} className="mt-0.5 shrink-0" />
                    {entry.text}
                  </li>
                ))}
              </ul>
            )}
            <Note size="2xs" className="my-0">
              서버 명령은 스테이징·로컬 서버에서만 동작한다. 운영 서버는 모두 거부한다.
            </Note>
          </Panel>
        </div>
      )}
    </>
  );
}
