import { api } from '../../../platform/api';
import type { GameState } from '../../../game/rules/logic';

export const isAccountConfigured = (): boolean => api.auth.isConfigured;

/** 게스트 잠금을 적용할 상태인가. 계정을 연결하지 않았고 게임 서버가 있을 때만이다. 로컬 모드(게임 서버 없음)는 계정을 연결할 곳이 없어 잠그지 않는다 */
export const isGuest = (account: string | null): boolean => account === null && api.auth.isConfigured;

export const signUpAccount = (email: string, password: string) =>
  api.auth.signUp(email, password);

export const signInAccount = (email: string, password: string) =>
  api.auth.signIn(email, password);

export const requestAccountPasswordReset = (email: string) =>
  api.auth.requestPasswordReset(email);

export const signOutAccount = () => api.auth.signOut();

export const deleteAccount = () => api.auth.deleteAccount();

export const saveGameCode = (game: GameState): string => api.storage.saveCode(game);
