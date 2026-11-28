// 시각 효과 강도 파생과 렌더러 배정(순수 모델). 강도 규칙의 정본은 사건 분류 표다.
import { FX_ONLY_RULES, TOAST_POLICY } from './toastPolicy';
import type { FxEventKind, FxIntensity, FxOnlyKind, FxRule, SystemEventKind } from './toastPolicy';

export type FxRenderer = 'catch-card' | 'field' | 'pip';

export function fxRuleOf(kind: FxEventKind): FxRule | undefined {
  return kind in FX_ONLY_RULES ? FX_ONLY_RULES[kind as FxOnlyKind] : TOAST_POLICY[kind as SystemEventKind].fx;
}

/** 사건 종류와 직접 행동 여부에서 강도를 파생한다. 규칙이 없으면 'none' */
export function fxIntensityOf(kind: FxEventKind, direct: boolean): FxIntensity {
  const rule = fxRuleOf(kind);
  if (!rule) return 'none';
  return direct ? rule.direct : rule.indirect;
}

const CATCH_RENDERERS: readonly FxRenderer[] = ['catch-card', 'field', 'pip'];

/** 사건 종류별로 그리는 렌더러 */
export const FX_RENDERERS: Partial<Record<FxEventKind, readonly FxRenderer[]>> = {
  'catch.legendaryOrFirstVariant': CATCH_RENDERERS,
  'catch.epicOrRecord': CATCH_RENDERERS,
  'catch.variant': CATCH_RENDERERS,
  'catch.routine': CATCH_RENDERERS,
  'live.peerCatch': ['field'],
};
