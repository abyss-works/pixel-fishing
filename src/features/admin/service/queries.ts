import { api } from '../../../platform/api';
import type { AdminMailRequest } from '../../../platform/api';
import { lastNDays } from '../model/metrics';

/** 관리자 로그인이 필요한 클라우드 구현인가. 로컬 모드는 판정 없이 골격을 보인다 */
export const adminSignInRequired = api.admin.isConfigured;
export const readAdminAccess = () => api.admin.access();
export const signInAdmin = () => api.admin.signIn();
export const takeAdminSignInReturn = () => api.admin.takeSignInReturn();
export const signOutAdmin = () => api.admin.signOut();
export const readAdminUsers = () => api.admin.users();
export const readAdminSpamFlags = () => api.admin.spamFlags();
export const readAdminRecentEvents = () => api.admin.recentEvents();
export const readAdminDeployHost = () => api.admin.deployHost();

/** 개요 탭 통합 조회 */
export const readAdminOverview = (days = 30) => api.admin.overview(days);

export const readAdminLive = () => api.admin.live();

/** 오늘(KST)까지 최근 days일의 일별 집계 */
export const readAdminDailyStats = (days: number) => {
  const axis = lastNDays(days);
  return api.admin.dailyStats(axis[0], axis[axis.length - 1]);
};

export const readAdminRetention = () => api.admin.retention();

/** 끝난 접속 세션(최근 순). userId를 주면 그 사람의 기록만 */
export const readAdminSessions = (userId: string | undefined, limit: number) => api.admin.sessions(userId, limit);

/** 골드 유입·유출 원장 (최근 7일 이벤트 보관 한도 기준) */
export const readAdminEconomy = (days: number) => api.admin.economy(days);

export const readAdminLetters = () => api.admin.letters();

/** 변경 기록(최신 버전부터, 철회된 항목 포함) */
export const readAdminChangelog = () => api.admin.changelog();

export const readAdminChatReports = () => api.admin.chatReports();

export const readAdminMails = () => api.admin.sentMails();

/** 우편 미리보기(쓰지 않음) 또는 보내기 */
export const writeAdminMail = (op: 'preview' | 'send', request: AdminMailRequest) => api.admin.mail(op, request);

/** 계정 제재(true) 또는 해제(false) */
export const writeAdminRestrict = (userId: string, restricted: boolean) => api.admin.restrict(userId, restricted);

/** 가입 계정의 비밀번호 재설정 링크 발급 */
export const writeAdminResetLink = (userId: string) => api.admin.resetLink(userId);

/** 편지 처리 표시 또는 취소 */
export const writeAdminLetterHandled = (letterId: number, handled: boolean) => api.admin.letterHandled(letterId, handled);

/** 대상 계정의 활성 인증 세션 강제 종료 */
export const writeAdminRevokeSessions = (userId: string) => api.admin.revokeSessions(userId);

export const readAdminUserEvents = (uid: string) => api.admin.userEvents(uid, 300);

export const readAdminUserState = (uid: string) => api.admin.userState(uid);

/** 바운티 퍼널 일계 — events 보관(7일) 안의 범위만 의미가 있다 */
export const readAdminBountyFunnel = (days: number) => api.admin.bountyFunnel(days);

/** 밸런스 라이브 지표. 이벤트 지표는 보관 기간(7일) 안의 범위만 의미가 있다 */
export const readAdminBalanceLive = (days?: number) => api.admin.balanceLive(days);
