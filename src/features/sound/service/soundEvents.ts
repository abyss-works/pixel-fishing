import type { Judgment, RarityId } from '../../../game/rules/logic';
import { playSfx } from '../../../platform/api/sound';
import type { SfxKey } from '../../../platform/api/sound';
import {
  clampNamedHitStep,
  resolveBiteSfx,
  resolveCastSfx,
  resolveCatchSfx,
  resolveHitSfx,
  resolveLineSnapSfx,
} from '../model/sound';

function emitIf(key: SfxKey | null, arg?: number): boolean {
  return key ? playSfx(key, arg) : false;
}

export function emitCastSound(manual: boolean): boolean {
  return emitIf(resolveCastSfx(manual));
}

export function emitBiteSound(manual: boolean): boolean {
  return emitIf(resolveBiteSfx(manual));
}

export function emitHitSound(judgment: Judgment): boolean {
  return emitIf(resolveHitSfx(judgment));
}

export function emitLineSnapSound(opts: { manual: boolean; underpowered: boolean }): boolean {
  return emitIf(resolveLineSnapSfx(opts));
}

export function emitCatchSound(opts: {
  manual: boolean;
  rarity: RarityId;
  isMutation: boolean;
  isNamedClear?: boolean;
}): boolean {
  return emitIf(resolveCatchSfx(opts));
}

export function emitNamedSpawnSound(): boolean {
  return playSfx('namedSpawn');
}

export function emitNamedHitSound(step: number): boolean {
  return playSfx('namedHit', clampNamedHitStep(step));
}

export function emitNamedMissSound(): boolean {
  return playSfx('namedMiss');
}

export function emitNamedClearSound(): boolean {
  return playSfx('namedClear');
}

export function emitNamedEscapeSound(): boolean {
  return playSfx('namedEscape');
}

export function emitShopSellSound(): boolean {
  return playSfx('shopSell');
}

export function emitGearUpgradeSound(): boolean {
  return playSfx('gearUpgrade');
}

export function emitRewardClaimSound(): boolean {
  return playSfx('rewardClaim');
}

export function emitEventSettleSound(): boolean {
  return playSfx('eventSettle');
}

export function emitButtonClickSound(): boolean {
  return playSfx('buttonClick');
}
