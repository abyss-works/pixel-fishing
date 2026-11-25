import { useState } from 'react';
import { api } from '../../../platform/api';
import type { DebugStepInput, GameAction } from '../../../game/rules/actions';
import type { GameState } from '../../../game/rules/logic';
import type { BaseId } from '../../../game/content/places';
import type { SpotId } from '../../../game/content/spots';
import { REJECT_TEXT } from '../../../game/rules/rules';
import type { DispatchResult, MaybePromise } from '../../gameplay/service/types';
import { armForceEncounter } from '../../bounty/service/forceEncounter';
import type { DebugCommandId, DevBountySnapshot } from '../../../game/rules/debug';
import { DEV_COMMANDS } from '../model/commands';
import type { DevPreset, PresetContext, PresetStep } from '../model/presets';

export interface DevLogEntry { id: number; ok: boolean; text: string }

const LOG_MAX = 8;

export interface DevTeleportHandlers {
  onTeleportBase?: (base: BaseId) => MaybePromise<boolean>;
  onTeleportSpot?: (spot: SpotId) => MaybePromise<boolean>;
}

export interface DevToolHandlers extends DevTeleportHandlers {
  onAccountPromoted?: (email: string) => MaybePromise<void>;
  onAccountReset?: (state: GameState) => MaybePromise<void>;
  onReload?: () => void;
}

type BatchedPresetStep =
  | { kind: 'debugBatch'; steps: DebugStepInput[] }
  | PresetStep;

/** 연속된 debug 스텝 2개 이상은 단일 debugBatch 액션으로 묶어 429와 왕복을 줄인다 */
export function groupPresetSteps(steps: readonly PresetStep[]): BatchedPresetStep[] {
  const out: BatchedPresetStep[] = [];
  let batch: DebugStepInput[] = [];
  const flush = () => {
    if (batch.length === 1) {
      out.push({ kind: 'debug', command: batch[0].command as DebugCommandId, args: batch[0].args ?? {} });
    } else if (batch.length >= 2) {
      out.push({ kind: 'debugBatch', steps: batch });
    }
    batch = [];
  };
  for (const step of steps) {
    if (step.kind === 'debug') {
      batch.push({ command: step.command, args: step.args });
    } else {
      flush();
      out.push(step);
    }
  }
  flush();
  return out;
}

function formatDispatchError(e: unknown): string {
  if (e && typeof e === 'object' && 'kind' in e && typeof (e as { kind?: unknown }).kind === 'string') {
    const kind = (e as { kind: string }).kind;
    const msg = e instanceof Error && e.message ? e.message : '';
    return msg ? `${kind}: ${msg}` : kind;
  }
  return e instanceof Error ? e.message : String(e);
}

/** 개발 도구 실행기 — 명령·프리셋·순간이동을 게임 dispatch로 보내고 결과를 짧은 기록으로 남긴다.
 *  프리셋은 연속 debug 명령을 debugBatch로 묶어 보내고, 한 단계라도 거부·실패하면 거기서 멈춘다.
 *  프리셋 스텝은 느림 창 대상이 아니라 따로 간격을 두지 않는다 */
export function useDevTools(
  dispatch: (action: GameAction) => MaybePromise<DispatchResult>,
  teleports: DevToolHandlers = {},
) {
  const [log, setLog] = useState<DevLogEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const push = (ok: boolean, text: string) =>
    setLog(prev => [{ id: Date.now() + Math.random(), ok, text }, ...prev].slice(0, LOG_MAX));

  const labelOf = (command: DebugCommandId) => DEV_COMMANDS.find(c => c.id === command)?.label ?? command;

  const send = async (action: GameAction, label: string): Promise<boolean> => {
    try {
      const r = await Promise.resolve(dispatch(action));
      if (r.status === 'ok') { push(true, label); return true; }
      push(false, `${label} — ${REJECT_TEXT[r.error]}`);
      return false;
    } catch (e) {
      push(false, `${label} — ${formatDispatchError(e)}`);
      return false;
    }
  };

  const runStep = async (step: BatchedPresetStep, presetLabel: string): Promise<boolean> => {
    switch (step.kind) {
      case 'debug':
        return send({ type: 'debug', command: step.command, args: step.args }, labelOf(step.command));
      case 'debugBatch':
        return send({ type: 'debugBatch', steps: step.steps }, `${presetLabel} 일괄 적용 (${step.steps.length}건)`);
      case 'action':
        return send(step.action, step.action.type === 'acceptQuest' ? `수주 ${step.action.questId}` : step.action.type);
      case 'teleportBase':
        if (teleports.onTeleportBase) {
          try {
            const ok = await Promise.resolve(teleports.onTeleportBase(step.base));
            push(ok, ok ? `거점 이동 (${step.base})` : `거점 이동 실패 (${step.base})`);
            return ok;
          } catch (e) {
            push(false, `거점 이동 (${step.base}) — ${formatDispatchError(e)}`);
            return false;
          }
        }
        return send({ type: 'travel', to: { kind: 'base', id: step.base } }, `거점 이동 (${step.base})`);
      case 'armEncounter':
        armForceEncounter();
        push(true, '강제 조우 대기');
        return true;
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
    pushLog: push,
    captureBounty: async (): Promise<DevBountySnapshot | undefined> => {
      try {
        const r = await Promise.resolve(dispatch({ type: 'debugSnapshot' }));
        if (r.status === 'ok' && r.result.type === 'debugSnapshot') {
          return r.result.bounty;
        }
      } catch (e) {
        push(false, `스냅샷 수배 기록 조회 — ${formatDispatchError(e)}`);
      }
      return undefined;
    },
    runCommand: (command: DebugCommandId, args: Record<string, unknown>, customLabel?: string) =>
      guard(async () => {
        await send({ type: 'debug', command, args }, customLabel ?? labelOf(command));
      }),
    runPreset: (preset: DevPreset, ctx: PresetContext) =>
      guard(async () => {
        const plan = preset.plan(ctx);
        if (!plan.ok) { push(false, `${preset.label} — ${plan.blocked}`); return; }
        for (const step of groupPresetSteps(plan.steps)) {
          if (!await runStep(step, preset.label)) { push(false, `${preset.label} — 중단`); return; }
        }
        push(true, `${preset.label} 완료`);
      }),
    teleportBase: (base: BaseId, label: string) =>
      guard(async () => {
        if (!teleports.onTeleportBase) {
          await send({ type: 'travel', to: { kind: 'base', id: base } }, `${label} 이동`);
          return;
        }
        try {
          const ok = await Promise.resolve(teleports.onTeleportBase(base));
          push(ok, ok ? `${label} 이동` : `${label} 이동 불가`);
        } catch (e) {
          push(false, `${label} 이동 — ${formatDispatchError(e)}`);
        }
      }),
    teleportSpot: (spot: SpotId, label: string) =>
      guard(async () => {
        if (!teleports.onTeleportSpot) { push(false, `${label} — 이동 콜백 없음`); return; }
        try {
          const ok = await Promise.resolve(teleports.onTeleportSpot(spot));
          push(ok, ok ? `${label} 이동` : `${label} 이동 불가`);
        } catch (e) {
          push(false, `${label} 이동 — ${formatDispatchError(e)}`);
        }
      }),
    promoteTestAccount: () =>
      guard(async () => {
        try {
          const r = await api.dev.promoteTestAccount();
          if (!r.ok) {
            push(false, `테스트 정식 계정 승격 실패: ${r.msg}`);
            return;
          }
          await Promise.resolve(teleports.onAccountPromoted?.(r.email));
          push(true, `테스트 정식 계정 승격 (${r.email})`);
        } catch (e) {
          push(false, `테스트 정식 계정 승격 실패: ${formatDispatchError(e)}`);
        }
      }),
    resetDevAccount: () =>
      guard(async () => {
        try {
          const r = await api.dev.resetDevAccount();
          await Promise.resolve(teleports.onAccountReset?.(r.state));
          push(true, `현재 계정 초기화 (v${r.version})`);
        } catch (e) {
          push(false, `현재 계정 초기화 실패: ${formatDispatchError(e)}`);
        }
      }),
    startNewGuest: () =>
      guard(async () => {
        try {
          await api.auth.signOut();
          push(true, '새 게스트 시작');
          (teleports.onReload ?? (() => window.location.reload()))();
        } catch (e) {
          push(false, `새 게스트 시작 실패: ${formatDispatchError(e)}`);
        }
      }),
  };
}
