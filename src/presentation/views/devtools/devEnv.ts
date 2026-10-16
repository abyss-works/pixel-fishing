// 개발 환경 — 이 빌드가 운영인지. 앱 최상위가 한 번 공급하고, 환경 배지와 개발 도구 패널이 읽는다.
// 운영 가드: 운영이거나 알 수 없는 환경이면 배지를 띄우지 않고 개발 도구를 대시보드 이동만 남기고 막는다.
import { createContext, useContext } from 'react';

const LABELS: Record<string, string> = {
  preview: 'PREVIEW',
  development: 'DEV BUILD',
  local: 'LOCAL DEV',
};

export interface DevEnv {
  /** 배포 환경(VERCEL_ENV, 로컬은 local, 미상은 빈 값) */
  env: string;
  /** 환경 배지 문구 — 운영·미상은 null */
  label: string | null;
  /** 운영이거나 미상이면 true — 개발 도구의 조작을 막는다 */
  restricted: boolean;
}

export function devEnvOf(env: string): DevEnv {
  const label = LABELS[env] ?? null;
  return { env, label, restricted: label === null };
}

/** 공급자가 없으면 가장 안전한 쪽(운영 취급)으로 읽힌다 */
export const DevEnvContext = createContext<DevEnv>(devEnvOf(''));

export const useDevEnv = (): DevEnv => useContext(DevEnvContext);
