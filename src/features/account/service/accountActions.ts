import { api } from '../../../platform/api';
import type { GameState } from '../../../game/rules/logic';

export const isAccountConfigured = (): boolean => api.auth.isConfigured;

export const signUpAccount = (email: string, password: string) =>
  api.auth.signUp(email, password);

export const signInAccount = (email: string, password: string) =>
  api.auth.signIn(email, password);

export const requestAccountPasswordReset = (email: string) =>
  api.auth.requestPasswordReset(email);

export const signOutAccount = () => api.auth.signOut();

export const deleteAccount = () => api.auth.deleteAccount();

export const saveGameCode = (game: GameState): string => api.storage.saveCode(game);
