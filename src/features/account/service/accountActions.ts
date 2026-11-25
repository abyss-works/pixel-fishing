import { api } from '../../../platform/api';
import type { GameState } from '../../../game/rules/logic';
import type { AccountLockState } from '../../display/model/menuLock';
import { GOOGLE_TAG } from '../model/googleFlow';

export const isAccountConfigured = (): boolean => api.auth.isConfigured;

/** 게스트 잠금을 적용할 상태인가. 계정을 연결하지 않았고 게임 서버가 있을 때만이다. 로컬 모드(게임 서버 없음)는 계정을 연결할 곳이 없어 잠그지 않는다 */
export const isGuest = (account: string | null): boolean => account === null && api.auth.isConfigured;

/** 메뉴·기능 잠금 판정에 쓰는 계정 상태. 확인 실패는 게스트가 아니므로 unverified로 구분한다 */
export const accountLockState = (account: string | null, accountFailed: boolean): AccountLockState =>
  accountFailed ? 'unverified' : isGuest(account) ? 'guest' : 'account';

/** 계정 확인이 끝나 게스트로 확정됐는가. 확인 전이나 확인에 실패한 로그인 계정도 계정이 없어 보이므로, 되밀기처럼 오판이 해로운 곳은 이 판정을 쓴다 */
export const isConfirmedGuest = (account: string | null, accountChecked: boolean): boolean => accountChecked && isGuest(account);

/** 구글 인증 화면으로 이동해 지금 게스트 계정에 구글을 붙인다 */
export const connectGoogle = () => api.auth.startGoogle('link', GOOGLE_TAG.linkGuest);

export const signOutAccount = () => api.auth.signOut();

export const deleteAccount = () => api.auth.deleteAccount();

export const saveGameCode = (game: GameState): string => api.storage.saveCode(game);
