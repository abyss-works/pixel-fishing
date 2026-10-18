// 앱의 데이터 접근 API와 런타임 조립점. 외부 시스템별 구현은 플랫폼 계층에 둔다.
import { supabase } from '../adapters/auth';
import { clearLegacySave, loadLegacy, saveCode } from '../adapters/storage';
import { createHttpApi } from '../adapters/httpApi';
import { createLocalApi } from '../adapters/localApi';
import type { ApiClient, StorageApi } from './types';

// 저장 어댑터는 런타임 API 구현과 독립된 공통 브라우저 기능이다.
const storage: StorageApi = { loadLegacy, clearLegacySave, saveCode };

export function createApi(): ApiClient {
  const impl = supabase ? createHttpApi() : createLocalApi();
  return { ...impl, storage };
}

// 편의를 위한 싱글톤 (테스트는 createApi()로 격리 생성)
export const api = createApi();

export { when } from '../../shared/lib/when';
export { readBounty, kstDay, gameDay } from '../adapters/bounty';
export { readRanking } from '../adapters/ranking';
export type {
  ApiClient, AuthApi, StorageApi, AdminApi, AdminAccessResult,
  AuthResult, GameGateway, MaybePromise, DispatchResult,
  BountySnapshot, BountyProgressRow, BountyTicketRow,
  RankingBoardId, RankingRow, RankingBoard,
  AdminUserRow, AdminDailyActiveRow, AdminRetentionRow, AdminEconomyRow, AdminBountyFunnelRow,
  AdminCatchQualityRow, AdminSpamFlagRow, AdminImportLogRow,
  AdminDexMismatchRow, AdminEventRow, AdminLetterRow,
} from './types';
