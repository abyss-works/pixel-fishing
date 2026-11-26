import { fmtPct } from './metrics';
import type {
  AdminConversionTimeBucketId,
  AdminOnboardingFunnel,
  AdminOnboardingStepBasis,
  AdminOnboardingStepId,
  AdminTutorialStageId,
} from './types';

export const CONVERSION_BUCKET_LABELS: Record<AdminConversionTimeBucketId, string> = {
  under_10m: '10분 미만',
  '10m_to_1h': '10분~1시간',
  '1h_to_24h': '1~24시간',
  '1d_to_7d': '1~7일',
  over_7d: '7일 초과',
};

export const TUTORIAL_STAGE_LABELS: Record<AdminTutorialStageId, string> = {
  village: '마을',
  sea: '바다',
  'bounty-quests': '일반 의뢰',
  'bounty-named': '네임드 토벌',
};

export const ONBOARDING_STEP_LABELS: Record<AdminOnboardingStepId, string> = {
  first_visit: '첫 접속',
  tutorial_complete: '튜토리얼 완료',
  first_catch: '첫 낚시',
  first_sell: '첫 판매',
  first_harbor: '첫 항구 이동',
  first_upgrade: '첫 장비 강화',
};

export const ONBOARDING_BASIS_LABELS: Record<AdminOnboardingStepBasis, string> = {
  lifetime: '누적 상태 정본',
  hybrid_7d: '누적 + 최근 7일 이벤트',
};

/** 0~1 비율을 소수 첫째 자리 퍼센트 문자열로 포맷한다 */
export function formatRatioPct(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return '—';
  return fmtPct(rate * 100);
}

/** 분 단위 소요 시간을 읽기 쉬운 한국어 단위(분·시간·일)로 포맷한다 */
export function formatDurationMinutes(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) return '—';
  if (minutes < 60) return `${Math.round(minutes)}분`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(1).replace(/\.0$/, '')}시간`;
  return `${(minutes / 1440).toFixed(1).replace(/\.0$/, '')}일`;
}

export interface OnboardingFunnelView {
  eventsWindowDays: number;
  conversion: {
    totalUsers: number | null;
    guestUsers: number | null;
    googleLinkedUsers: number | null;
    conversionRateText: string;
    medianText: string;
    p90Text: string;
    buckets: { bucket: AdminConversionTimeBucketId; label: string; count: number; pct: number }[];
  };
  tutorials: {
    totalUsers: number | null;
    totalWithSave: number | null;
    stages: {
      id: AdminTutorialStageId;
      label: string;
      completed: number;
      ratePct: number;
      rateText: string;
      dropOffFromPrev: number;
      stepRateText: string;
    }[];
  };
  steps: {
    id: AdminOnboardingStepId;
    label: string;
    users: number;
    ratePct: number;
    rateText: string;
    stepRateText: string;
    basis: AdminOnboardingStepBasis;
    basisLabel: string;
  }[];
  hasHybridSteps: boolean;
}

/** 온보딩 퍼널 응답을 진행 구역 표시용 구조로 변환한다 */
export function selectOnboardingFunnelView(data: AdminOnboardingFunnel | null): OnboardingFunnelView {
  if (!data) {
    return {
      eventsWindowDays: 7,
      conversion: {
        totalUsers: null,
        guestUsers: null,
        googleLinkedUsers: null,
        conversionRateText: '—',
        medianText: '—',
        p90Text: '—',
        buckets: [],
      },
      tutorials: {
        totalUsers: null,
        totalWithSave: null,
        stages: [],
      },
      steps: [],
      hasHybridSteps: false,
    };
  }
  const { conversion, tutorials, steps } = data;
  return {
    eventsWindowDays: data.eventsWindowDays,
    conversion: {
      totalUsers: conversion.totalUsers,
      guestUsers: conversion.guestUsers,
      googleLinkedUsers: conversion.googleLinkedUsers,
      conversionRateText: formatRatioPct(conversion.conversionRate),
      medianText: formatDurationMinutes(conversion.medianMinutes),
      p90Text: formatDurationMinutes(conversion.p90Minutes),
      buckets: conversion.buckets.map(b => ({
        bucket: b.bucket,
        label: CONVERSION_BUCKET_LABELS[b.bucket] ?? b.bucket,
        count: b.count,
        pct: b.pct,
      })),
    },
    tutorials: {
      totalUsers: tutorials.totalUsers,
      totalWithSave: tutorials.totalWithSave,
      stages: tutorials.stages.map(s => ({
        id: s.id,
        label: TUTORIAL_STAGE_LABELS[s.id] ?? s.id,
        completed: s.completed,
        ratePct: s.rate * 100,
        rateText: formatRatioPct(s.rate),
        dropOffFromPrev: s.dropOffFromPrev,
        stepRateText: formatRatioPct(s.stepRate),
      })),
    },
    steps: steps.map(s => ({
      id: s.id,
      label: ONBOARDING_STEP_LABELS[s.id] ?? s.id,
      users: s.users,
      ratePct: s.rate * 100,
      rateText: formatRatioPct(s.rate),
      stepRateText: formatRatioPct(s.stepRate),
      basis: s.basis,
      basisLabel: ONBOARDING_BASIS_LABELS[s.basis],
    })),
    hasHybridSteps: steps.some(s => s.basis === 'hybrid_7d'),
  };
}
