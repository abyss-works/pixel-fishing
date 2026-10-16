import { useState } from 'react';
import type { GameAction } from '../../../game/rules/actions';
import { REJECT_TEXT } from '../../../game/rules/rules';
import type { DispatchResult, MaybePromise } from '../../gameplay/service/types';
import { armForceEncounter } from '../../bounty/service/forceEncounter';
import type { DebugCommandId } from '../../../game/rules/debug';
import { DEV_COMMANDS } from '../model/commands';
import type { DevPreset, PresetContext, PresetStep } from '../model/presets';

export interface DevLogEntry { id: number; ok: boolean; text: string }

const LOG_MAX = 8;

/** 개발 도구 실행기 — 명령과 프리셋 단계를 게임 dispatch로 보내고 결과를 짧은 기록으로 남긴다.
 *  프리셋은 순서대로 보내고, 한 단계라도 거부되면 거기서 멈춘다 */
export function useDevTools(dispatch: (action: GameAction) => MaybePromise<DispatchResult>) {
  const [log, setLog] = useState<DevLogEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const push = (ok: boolean, text: string) =>
    setLog(prev => [{ id: Date.now() + Math.random(), ok, text }, ...prev].slice(0, LOG_MAX));

  const labelOf = (command: DebugCommandId) => DEV_COMMANDS.find(c => c.id === command)?.label ?? command;

  const send = async (action: GameAction, label: string): Promise<boolean> => {
    const r = await Promise.resolve(dispatch(action));
    if (r.status === 'ok') { push(true, label); return true; }
    push(false, `${label} — ${REJECT_TEXT[r.error]}`);
    return false;
  };

  const runStep = (step: PresetStep): Promise<boolean> => {
    switch (step.kind) {
      case 'debug':
        return send({ type: 'debug', command: step.command, args: step.args }, labelOf(step.command));
      case 'action':
        return send(step.action, step.action.type === 'acceptQuest' ? `수주 ${step.action.questId}` : step.action.type);
      case 'armEncounter':
        armForceEncounter();
        push(true, '강제 조우 대기');
        return Promise.resolve(true);
    }
  };

  const guard = async (job: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await job(); } finally { setBusy(false); }
  };

  return {
    log,
    busy,
    runCommand: (command: DebugCommandId, args: Record<string, unknown>) =>
      guard(async () => { await runStep({ kind: 'debug', command, args }); }),
    runPreset: (preset: DevPreset, ctx: PresetContext) =>
      guard(async () => {
        const plan = preset.plan(ctx);
        if (!plan.ok) { push(false, `${preset.label} — ${plan.blocked}`); return; }
        for (const step of plan.steps) {
          if (!await runStep(step)) { push(false, `${preset.label} — 중단`); return; }
        }
        push(true, `${preset.label} 완료`);
      }),
  };
}
