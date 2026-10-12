import { api } from '../../../platform/api';

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
