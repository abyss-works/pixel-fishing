export type { DispatchResult } from '../../../platform/api';
export type { MaybePromise } from '../../../shared/lib/when';

/** 서버 저장 상태와의 연결 상태 */
export type SyncState = 'off' | 'connecting' | 'on' | 'error';
