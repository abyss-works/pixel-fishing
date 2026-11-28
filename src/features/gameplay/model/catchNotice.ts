import type { ReleasedFish } from '../../../game/rules/actions';
import { catalogValueOf, RARITY, formName, priceOf } from '../../../game/rules/logic';
import type { CatchInfo, Fish, FormId, FormRecord, Judgment } from '../../../game/rules/logic';

/** 포획 카드 표시용 가치 라벨과 수치 — 일반 어종은 판매가(골드), 이벤트 어종은 점수 */
export function catchValueDisplay(fish: Fish, form: FormId): { kind: 'gold' | 'score'; label: string; amount: number } {
  const val = catalogValueOf(fish.id, form) ?? { kind: 'gold' as const, amount: priceOf(fish, form) };
  return val.kind === 'score'
    ? { kind: 'score', label: '점수', amount: val.amount }
    : { kind: 'gold', label: '판매가', amount: val.amount };
}
import { josa } from '../../../shared/lib/josa';
import type { CatchFxKind } from '../../display/model/fxPolicy';
import type { SystemNoticeInput } from '../../display/model/toastPolicy';

/** 포획 안내. 종류는 효과 요청으로 이어지는 포획 사건 종류 넷 중 하나다 */
export type CatchNotice = SystemNoticeInput & { kind: CatchFxKind };

/** 가방이 차서 캐치 결과와 함께 내보낸 개체. extracted는 가공 플랜트선이 기운으로 바꾼 개체다 */
export interface BagOverflow {
  released: readonly ReleasedFish[];
  extracted?: readonly ReleasedFish[];
}

/** 가방 초과 안내 문구. 내보낸 개체가 없으면 null */
export function bagOverflowNotice({ released, extracted = [] }: BagOverflow): string | null {
  if (extracted.length === 0) {
    if (released.length === 0) return null;
    const names = released.map(fish => fish.name).join(', ');
    return `가방이 가득 차 ${names}${josa(names, '을/를')} 놓아줬어요. 명성은 그대로 남아요.`;
  }
  const converted = `가방이 차서 ${extracted.length}마리를 생명의 기운으로`;
  return released.length === 0
    ? `${converted} 바꿨어요.`
    : `${converted} 바꾸고 ${released.length}마리를 놓아줬어요.`;
}

/** 가방 초과 1줄 토스트 요약 + 구조화 알림 */
export function bagOverflowNoticeInput(overflow: BagOverflow): SystemNoticeInput | null {
  const text = bagOverflowNotice(overflow);
  if (!text) return null;
  const total = overflow.released.length + (overflow.extracted?.length ?? 0);
  return {
    kind: 'catch.bagOverflow',
    text,
    toastText: `가방 가득 참 ${total}마리 정리`,
    tone: 'danger',
    replaceKey: 'bag-overflow',
  };
}

/** 포획 이벤트를 등급·최초 변이·신규 도감·개인 최대 크기 기록에 따라 Tier A/B/C로 분류한다 */
export function classifyCatchNotice(
  fish: Fish,
  info: CatchInfo,
  judgment: Judgment,
  prevDexEntry: FormRecord | undefined,
  isPersonalBest?: boolean,
): CatchNotice {
  const name = formName(fish, info.form);
  // 판정은 대괄호 꼬리표로 앞에 붙인다(화면 문구에 가운뎃점을 쓰지 않는다)
  const prefix = judgment === 'perfect' ? '[PERFECT] '
    : judgment === 'good' ? '[GOOD] '
    : judgment === 'auto' ? '[방치] ' : '';
  const text = `${prefix}${RARITY[fish.rarity].name} 등급 [${name}] 획득!`;

  if (fish.rarity === 'legendary') {
    return {
      kind: 'catch.legendaryOrFirstVariant',
      text,
      toastText: `전설 [${name}] 획득!`,
      tone: 'gold',
    };
  }
  if (info.form === 'variant' && info.isNew) {
    return {
      kind: 'catch.legendaryOrFirstVariant',
      text,
      toastText: `첫 돌연변이 [${name}] 발견!`,
      tone: 'mutation',
    };
  }
  const manual = judgment !== 'auto';
  if (fish.rarity === 'epic') {
    return {
      kind: 'catch.epicOrRecord',
      text,
      toastText: `영웅 [${name}] 획득!`,
      tone: 'epic',
      bypassCooldown: manual,
    };
  }
  if (info.isNew) {
    return {
      kind: 'catch.epicOrRecord',
      text,
      toastText: `신규 도감 [${name}]!`,
      tone: 'gold',
      bypassCooldown: manual,
    };
  }
  if (isPersonalBest === true || (prevDexEntry?.maxSize != null && info.size > prevDexEntry.maxSize)) {
    return {
      kind: 'catch.epicOrRecord',
      text,
      toastText: `최대 크기 [${name}]!`,
      tone: 'gold',
      bypassCooldown: manual,
    };
  }
  if (info.form === 'variant') {
    return { kind: 'catch.variant', text, tone: 'neutral', logTone: 'info' };
  }
  return {
    kind: 'catch.routine',
    text,
    tone: 'neutral',
    logTone: 'info',
  };
}
