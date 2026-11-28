// 시스템 로그 기반 +α 플로팅 토스트 미러링 정책(순수 모델).
// 모든 시스템 이벤트는 예외 없이 먼저 MessageLog에 기록되고, 이 정책이 플로팅 토스트 미러링 여부·우선순위·중복 억제를 결정한다.

export type ToastTone = 'gold' | 'accent' | 'danger' | 'guild' | 'epic' | 'named' | 'mutation' | 'neutral';
export type LogTone = 'info' | 'gold' | 'warn';
export type ToastPriority = 0 | 1 | 2 | 3;
export type ToastTier = 'A' | 'B' | 'C';

export type SystemEventKind =
  // Tier A (기본 동시 노출)
  | 'catch.legendaryOrFirstVariant'
  | 'catch.encounterTicket'
  | 'catch.rejected'
  | 'dex.spotCompleted'
  | 'achievement.unlockable'
  | 'away.summary'
  | 'bounty.challengeResolved'
  | 'bounty.questCompletable'
  | 'artifact.exchanged'
  | 'facility.boatBought'
  | 'travel.firstVisit'
  | 'guild.realtimeAlert'
  | 'guild.levelOrBonusUp'
  | 'friend.realtimeAlert'
  | 'mail.unreadOnLogin'
  | 'system.criticalError'
  | 'account.authMilestone'
  // Tier B (조건부·묶음 노출)
  | 'catch.epicOrRecord'
  | 'catch.lineCut'
  | 'catch.bagOverflow'
  | 'catch.castDenied'
  | 'travel.blocked'
  | 'achievement.claimed'
  | 'bounty.questDelivered'
  | 'bounty.questAccepted'
  | 'bounty.questAbandoned'
  | 'artifact.levelUp'
  | 'facility.rodUpgraded'
  | 'facility.energyExtracted'
  | 'kitchen.cookAndBuff'
  | 'wardrobe.hatBought'
  | 'guild.modalAction'
  | 'social.modalAction'
  | 'system.modalRejected'
  | 'system.modalConfirmUtility'
  // Tier C (시스템 로그 전용)
  | 'catch.routine'
  | 'catch.variant'
  | 'catch.cast'
  | 'catch.movementCancelled'
  | 'facility.fishSold'
  | 'wardrobe.lookChanged'
  | 'bag.exhibitMoved'
  | 'bag.lockChanged'
  | 'travel.routineMove'
  | 'boot.greeting'
  | 'boot.cloudLoaded'
  // 비정형 호출 하위 호환
  | 'legacy.untyped';

export type FxIntensity = 'none' | 'confirm' | 'emphasis' | 'spectacle';

/** 사건별 효과 강도. 규칙이 없는 사건은 효과 없음이다 */
export interface FxRule {
  /** 사용자가 직접 한 행동일 때 */
  direct: FxIntensity;
  /** 방치 루프, 다른 플레이어, 시스템이 일으켰을 때 */
  indirect: FxIntensity;
}

export interface ToastRule {
  tier: ToastTier;
  defaultTone: ToastTone;
  priority: ToastPriority;
  ttlMs: number;
  cooldownMs?: number;
  requireOpenWindow?: boolean;
  requireOpenWindowOrFolded?: boolean;
  replaceKey?: string;
  batchKey?: string;
  batchWindowMs?: number;
  fx?: FxRule;
}

export const TTL_BY_PRIORITY: Record<ToastPriority, number> = {
  0: 6000,
  1: 4500,
  2: 3500,
  3: 2800,
};

export const DUPLICATE_SUPPRESS_MS = 2000;
export const MAX_TOAST_DESKTOP = 3;
export const MAX_TOAST_MOBILE = 2;

export const TOAST_POLICY: Record<SystemEventKind, ToastRule> = {
  // Tier A
  'catch.legendaryOrFirstVariant': {
    tier: 'A', defaultTone: 'gold', priority: 1, ttlMs: TTL_BY_PRIORITY[1],
    fx: { direct: 'spectacle', indirect: 'spectacle' },
  },
  'catch.encounterTicket': { tier: 'A', defaultTone: 'named', priority: 1, ttlMs: TTL_BY_PRIORITY[1] },
  'catch.rejected': { tier: 'A', defaultTone: 'danger', priority: 0, ttlMs: TTL_BY_PRIORITY[0] },
  'dex.spotCompleted': { tier: 'A', defaultTone: 'gold', priority: 1, ttlMs: TTL_BY_PRIORITY[1] },
  'achievement.unlockable': {
    tier: 'A', defaultTone: 'gold', priority: 1, ttlMs: TTL_BY_PRIORITY[1],
    batchKey: 'achievement.unlockable', batchWindowMs: 150,
  },
  'away.summary': { tier: 'A', defaultTone: 'gold', priority: 1, ttlMs: TTL_BY_PRIORITY[1] },
  'bounty.challengeResolved': { tier: 'A', defaultTone: 'gold', priority: 1, ttlMs: TTL_BY_PRIORITY[1] },
  'bounty.questCompletable': { tier: 'A', defaultTone: 'gold', priority: 1, ttlMs: TTL_BY_PRIORITY[1] },
  'artifact.exchanged': { tier: 'A', defaultTone: 'gold', priority: 1, ttlMs: TTL_BY_PRIORITY[1] },
  'facility.boatBought': { tier: 'A', defaultTone: 'gold', priority: 1, ttlMs: TTL_BY_PRIORITY[1] },
  'travel.firstVisit': { tier: 'A', defaultTone: 'accent', priority: 1, ttlMs: TTL_BY_PRIORITY[1] },
  'guild.realtimeAlert': { tier: 'A', defaultTone: 'guild', priority: 1, ttlMs: TTL_BY_PRIORITY[1] },
  'guild.levelOrBonusUp': { tier: 'A', defaultTone: 'guild', priority: 1, ttlMs: TTL_BY_PRIORITY[1] },
  'friend.realtimeAlert': { tier: 'A', defaultTone: 'accent', priority: 1, ttlMs: TTL_BY_PRIORITY[1] },
  'mail.unreadOnLogin': { tier: 'A', defaultTone: 'gold', priority: 1, ttlMs: TTL_BY_PRIORITY[1] },
  'system.criticalError': { tier: 'A', defaultTone: 'danger', priority: 0, ttlMs: TTL_BY_PRIORITY[0] },
  'account.authMilestone': { tier: 'A', defaultTone: 'accent', priority: 1, ttlMs: TTL_BY_PRIORITY[1] },

  // Tier B
  'catch.epicOrRecord': {
    tier: 'B', defaultTone: 'epic', priority: 2, ttlMs: TTL_BY_PRIORITY[2], cooldownMs: 15_000,
    fx: { direct: 'emphasis', indirect: 'emphasis' },
  },
  'catch.lineCut': { tier: 'B', defaultTone: 'danger', priority: 0, ttlMs: TTL_BY_PRIORITY[0], cooldownMs: 60_000 },
  'catch.bagOverflow': {
    tier: 'B', defaultTone: 'danger', priority: 0, ttlMs: TTL_BY_PRIORITY[0],
    cooldownMs: 30_000, replaceKey: 'bag-overflow',
  },
  'catch.castDenied': {
    tier: 'B', defaultTone: 'danger', priority: 0, ttlMs: TTL_BY_PRIORITY[0],
    cooldownMs: 5_000, requireOpenWindowOrFolded: true,
  },
  'travel.blocked': { tier: 'B', defaultTone: 'danger', priority: 0, ttlMs: TTL_BY_PRIORITY[0], cooldownMs: 5_000 },
  'achievement.claimed': {
    tier: 'B', defaultTone: 'gold', priority: 2, ttlMs: TTL_BY_PRIORITY[2],
    requireOpenWindow: true, batchKey: 'achievement.claimed', batchWindowMs: 300,
  },
  'bounty.questDelivered': { tier: 'B', defaultTone: 'gold', priority: 2, ttlMs: TTL_BY_PRIORITY[2], requireOpenWindow: true },
  'bounty.questAccepted': { tier: 'B', defaultTone: 'neutral', priority: 3, ttlMs: TTL_BY_PRIORITY[3], requireOpenWindow: true },
  'bounty.questAbandoned': { tier: 'B', defaultTone: 'neutral', priority: 3, ttlMs: TTL_BY_PRIORITY[3], requireOpenWindow: true },
  'artifact.levelUp': { tier: 'B', defaultTone: 'gold', priority: 2, ttlMs: TTL_BY_PRIORITY[2], requireOpenWindow: true },
  'facility.rodUpgraded': {
    tier: 'B', defaultTone: 'gold', priority: 2, ttlMs: TTL_BY_PRIORITY[2],
    requireOpenWindow: true, replaceKey: 'rod-upgrade',
  },
  'facility.energyExtracted': {
    tier: 'B', defaultTone: 'gold', priority: 2, ttlMs: TTL_BY_PRIORITY[2],
    requireOpenWindow: true, replaceKey: 'energy-extract',
  },
  'kitchen.cookAndBuff': { tier: 'B', defaultTone: 'accent', priority: 2, ttlMs: TTL_BY_PRIORITY[2] },
  'wardrobe.hatBought': { tier: 'B', defaultTone: 'gold', priority: 2, ttlMs: TTL_BY_PRIORITY[2], requireOpenWindow: true },
  'guild.modalAction': { tier: 'B', defaultTone: 'guild', priority: 2, ttlMs: TTL_BY_PRIORITY[2], requireOpenWindow: true },
  'social.modalAction': { tier: 'B', defaultTone: 'accent', priority: 2, ttlMs: TTL_BY_PRIORITY[2], requireOpenWindow: true },
  'system.modalRejected': {
    tier: 'B', defaultTone: 'danger', priority: 0, ttlMs: TTL_BY_PRIORITY[0],
    requireOpenWindowOrFolded: true,
  },
  'system.modalConfirmUtility': {
    tier: 'B', defaultTone: 'neutral', priority: 3, ttlMs: TTL_BY_PRIORITY[3],
    requireOpenWindow: true,
  },

  // Tier C (시스템 로그 전용)
  'catch.routine': {
    tier: 'C', defaultTone: 'neutral', priority: 3, ttlMs: 0,
    fx: { direct: 'confirm', indirect: 'confirm' },
  },
  'catch.variant': {
    tier: 'C', defaultTone: 'neutral', priority: 3, ttlMs: 0,
    fx: { direct: 'emphasis', indirect: 'emphasis' },
  },
  'catch.cast': { tier: 'C', defaultTone: 'neutral', priority: 3, ttlMs: 0 },
  'catch.movementCancelled': { tier: 'C', defaultTone: 'neutral', priority: 3, ttlMs: 0 },
  'facility.fishSold': { tier: 'C', defaultTone: 'neutral', priority: 3, ttlMs: 0 },
  'wardrobe.lookChanged': { tier: 'C', defaultTone: 'neutral', priority: 3, ttlMs: 0 },
  'bag.exhibitMoved': { tier: 'C', defaultTone: 'neutral', priority: 3, ttlMs: 0 },
  'bag.lockChanged': { tier: 'C', defaultTone: 'neutral', priority: 3, ttlMs: 0 },
  'travel.routineMove': { tier: 'C', defaultTone: 'neutral', priority: 3, ttlMs: 0 },
  'boot.greeting': { tier: 'C', defaultTone: 'neutral', priority: 3, ttlMs: 0 },
  'boot.cloudLoaded': { tier: 'C', defaultTone: 'neutral', priority: 3, ttlMs: 0 },

  // 하위 호환
  'legacy.untyped': { tier: 'B', defaultTone: 'accent', priority: 2, ttlMs: TTL_BY_PRIORITY[1], requireOpenWindow: true },
};

/** 알림(시스템 로그)이 없는 효과 사건. 모든 사건은 로그에 먼저 기록한다는 원칙 때문에 사건 종류 표 밖에 둔다 */
export type FxOnlyKind = 'live.peerCatch';
export const FX_ONLY_RULES: Record<FxOnlyKind, FxRule> = {
  'live.peerCatch': { direct: 'emphasis', indirect: 'emphasis' },
};
export type FxEventKind = SystemEventKind | FxOnlyKind;

export interface NoticeTipRow {
  label: string;
  value: string;
}

export interface NoticeTip {
  target: string;
  rows: NoticeTipRow[];
}

export interface SystemNoticeInput {
  kind: SystemEventKind;
  /** MessageLog에 기록될 완전한 정본 문장 */
  text: string;
  /** 360px 1줄 토스트용 축약 문장(생략 시 text를 1줄 정규화해 사용) */
  toastText?: string;
  /** 명시적 토스트 톤 오버라이드 */
  tone?: ToastTone;
  /** 명시적 MessageLog 톤 오버라이드 */
  logTone?: LogTone;
  /** 동일 대상 교체 병합 키 */
  replaceKey?: string;
  /** 카테고리 쿨다운 구분 키 */
  cooldownKey?: string;
  /** 수동 포획 등 카테고리 쿨다운을 건너뛸 때 */
  bypassCooldown?: boolean;
  /** AwayCard가 스테이지에 가려지지 않고 보이는 중이면 토스트를 억제한다 */
  suppressIfAwayCardVisible?: boolean;
  /** MessageLog 단어 툴팁(토스트에는 복사하지 않는다) */
  tip?: NoticeTip;
}

export type NoticeSink = (text: string, tone?: LogTone, tip?: NoticeTip) => void;

const STRUCTURED_SINKS = new WeakMap<NoticeSink, (input: SystemNoticeInput) => void>();

/** useMessageLog가 만든 싱크에 구조화 미러링 핸들러를 연결한다 */
export function registerNoticeSink(sink: NoticeSink, handler: (input: SystemNoticeInput) => void): NoticeSink {
  STRUCTURED_SINKS.set(sink, handler);
  return sink;
}

const TOAST_TO_LOG_TONE: Record<ToastTone, LogTone> = {
  gold: 'gold',
  epic: 'gold',
  named: 'gold',
  mutation: 'gold',
  accent: 'info',
  guild: 'info',
  neutral: 'info',
  danger: 'warn',
};

export function logToneOf(input: SystemNoticeInput): LogTone {
  if (input.logTone) return input.logTone;
  const tone = input.tone ?? TOAST_POLICY[input.kind].defaultTone;
  return TOAST_TO_LOG_TONE[tone];
}

export function toastToneFromLogTone(tone?: LogTone): ToastTone {
  if (tone === 'gold') return 'gold';
  if (tone === 'warn') return 'danger';
  return 'accent';
}

/** 단일 팬아웃 디스패치 — useMessageLog가 등록한 싱크면 구조화 경로로, 일반 mock이면 기존 (text, logTone, tip) 호출로 보낸다 */
export function sendNotice(sink: NoticeSink, input: SystemNoticeInput): void {
  const structured = STRUCTURED_SINKS.get(sink);
  if (structured) {
    structured(input);
    return;
  }
  if (input.tip !== undefined) sink(input.text, logToneOf(input), input.tip);
  else if (input.logTone !== undefined) sink(input.text, input.logTone);
  else {
    const tone = logToneOf(input);
    if (tone === 'info') sink(input.text);
    else sink(input.text, tone);
  }
}

/** 개행과 연속 공백을 1줄 공백으로 정규화한다 */
export function formatCompactToast(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export interface MirrorEnv {
  toastEnabled: boolean;
  hasOpenWindows: boolean;
  folded: boolean;
  blocked: boolean;
  loading: boolean;
  awayCardVisible: boolean;
}

export interface MirrorHistory {
  lastSignatureAt: Map<string, number>;
  lastCooldownAt: Map<string, number>;
}

export function createMirrorHistory(): MirrorHistory {
  return {
    lastSignatureAt: new Map(),
    lastCooldownAt: new Map(),
  };
}

export interface PlannedToast {
  kind: SystemEventKind;
  text: string;
  tone: ToastTone;
  priority: ToastPriority;
  ttlMs: number;
  replaceKey?: string;
  batchKey?: string;
  batchWindowMs?: number;
}

export type MirrorDecision =
  | { action: 'emit'; toast: PlannedToast; signature: string; cooldownKey?: string }
  | { action: 'hold'; reason: 'loading' }
  | {
    action: 'skip';
    reason: 'tier-c' | 'blocked' | 'away-card-visible' | 'setting-disabled' | 'window-closed' | 'log-visible' | 'duplicate' | 'cooldown';
  };

export function decideToastMirror(
  input: SystemNoticeInput,
  env: MirrorEnv,
  nowMs: number,
  history: MirrorHistory,
): MirrorDecision {
  const rule = TOAST_POLICY[input.kind];
  if (rule.tier === 'C') return { action: 'skip', reason: 'tier-c' };
  if (env.blocked) return { action: 'skip', reason: 'blocked' };
  if (env.loading) return { action: 'hold', reason: 'loading' };
  if ((input.suppressIfAwayCardVisible || (input.kind === 'away.summary' && env.awayCardVisible)) && !env.hasOpenWindows) {
    return { action: 'skip', reason: 'away-card-visible' };
  }
  if (!env.toastEnabled) {
    const directModalFeedback = input.kind === 'system.modalRejected' && env.hasOpenWindows;
    if (!directModalFeedback) return { action: 'skip', reason: 'setting-disabled' };
  }
  if (rule.requireOpenWindow && !env.hasOpenWindows) {
    return { action: 'skip', reason: 'window-closed' };
  }
  if (rule.requireOpenWindowOrFolded && !env.hasOpenWindows && !env.folded) {
    return { action: 'skip', reason: 'log-visible' };
  }

  const tone = input.tone ?? rule.defaultTone;
  const text = formatCompactToast(input.toastText ?? input.text);
  const signature = `${input.kind}::${text}`;
  const lastDup = history.lastSignatureAt.get(signature);
  if (lastDup !== undefined && nowMs - lastDup < DUPLICATE_SUPPRESS_MS) {
    return { action: 'skip', reason: 'duplicate' };
  }

  const cooldownKey = rule.cooldownMs !== undefined ? (input.cooldownKey ?? input.kind) : undefined;
  if (cooldownKey && rule.cooldownMs !== undefined && !input.bypassCooldown) {
    const lastCd = history.lastCooldownAt.get(cooldownKey);
    if (lastCd !== undefined && nowMs - lastCd < rule.cooldownMs) {
      return { action: 'skip', reason: 'cooldown' };
    }
  }

  return {
    action: 'emit',
    signature,
    cooldownKey,
    toast: {
      kind: input.kind,
      text,
      tone,
      priority: rule.priority,
      ttlMs: rule.ttlMs,
      replaceKey: input.replaceKey ?? rule.replaceKey,
      batchKey: rule.batchKey,
      batchWindowMs: rule.batchWindowMs,
    },
  };
}

export function recordMirrorEmission(
  history: MirrorHistory,
  signature: string,
  cooldownKey: string | undefined,
  nowMs: number,
): void {
  history.lastSignatureAt.set(signature, nowMs);
  if (cooldownKey) history.lastCooldownAt.set(cooldownKey, nowMs);
}

export interface QueuedToast {
  id: number;
  text: string;
  tone: ToastTone;
  priority: ToastPriority;
  ttlMs: number;
  replaceKey?: string;
}

/** 우선순위(P0 -> P3) 및 최신순으로 정렬해 최대 개수만 남기고 밀려난 id를 돌려준다 */
export function enqueueToast(
  queue: readonly QueuedToast[],
  incoming: QueuedToast,
  maxItems: number = MAX_TOAST_DESKTOP,
): { next: QueuedToast[]; droppedIds: number[] } {
  const droppedIds: number[] = [];
  const base = queue.filter(item => {
    if (incoming.replaceKey && item.replaceKey === incoming.replaceKey) {
      droppedIds.push(item.id);
      return false;
    }
    return true;
  });
  const sorted = [incoming, ...base].sort((a, b) => a.priority - b.priority || b.id - a.id);
  const next = sorted.slice(0, maxItems);
  for (const item of sorted.slice(maxItems)) {
    droppedIds.push(item.id);
  }
  return { next, droppedIds };
}
