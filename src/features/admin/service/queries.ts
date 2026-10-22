import { api } from '../../../platform/api';
import type { AdminMailRequest } from '../../../platform/api';

export const readAdminAccess = () => api.admin.access();
export const readAdminUsers = () => api.admin.users();
export const readAdminProjectRef = () => api.admin.projectRef();

export const readAdminOverview = (days: number) => Promise.all([
  api.admin.users(),
  api.admin.dailyActive(days),
  api.admin.catchQuality(days),
  api.admin.recentEvents(),
  api.admin.spamFlags(),
  api.admin.imports(),
]);

export const readAdminAntiAbuse = () => Promise.all([
  api.admin.users(),
  api.admin.spamFlags(),
  api.admin.imports(),
  api.admin.dexMismatch(),
]);

export const readAdminEconomy = (days: number) => Promise.all([
  api.admin.economy(days),
  api.admin.users(),
]);

export const readAdminLetters = () => Promise.all([
  api.admin.letters(),
  api.admin.users(),
]);

export const readAdminMails = () => Promise.all([
  api.admin.sentMails(),
  api.admin.users(),
]);

/** 우편 미리보기(쓰지 않음) 또는 보내기 */
export const writeAdminMail = (op: 'preview' | 'send', request: AdminMailRequest) => api.admin.mail(op, request);

export const readAdminMetrics = (days: number) => Promise.all([
  api.admin.dailyActive(days),
  api.admin.retention(),
]);

export const readAdminUserDetails = (uid: string) => Promise.all([
  api.admin.userEvents(uid, 300),
  api.admin.dexMismatch(),
  api.admin.spamFlags(),
  api.admin.imports(),
]);

/** 바운티 퍼널 일계 — events 보관(7일) 안의 범위만 의미가 있다 */
export const readAdminBountyFunnel = (days: number) => api.admin.bountyFunnel(days);

/** 밸런스 라이브 지표. 이벤트 지표는 보관 기간(7일) 안의 범위만 의미가 있다 */
export const readAdminBalanceLive = (days?: number) => api.admin.balanceLive(days);
