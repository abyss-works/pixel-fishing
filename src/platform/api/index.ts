// 앱의 데이터 접근 API와 런타임 조립점. 외부 시스템별 구현은 플랫폼 계층에 둔다.
import { isCloud } from '../adapters/auth';
import { clearLegacySave, loadLegacy, saveCode } from '../adapters/storage';
import { createHttpApi } from '../adapters/httpApi';
import { createLocalApi } from '../adapters/localApi';
import { connectLive } from '../adapters/live';
import type { LiveConnection } from '../adapters/live';
import type { ServerMessage } from '../../game/rules/live';
import type { ApiClient, StorageApi } from './types';

// 저장 어댑터는 런타임 API 구현과 독립된 공통 브라우저 기능이다.
const storage: StorageApi = { loadLegacy, clearLegacySave, saveCode };

export function createApi(): ApiClient {
  const impl = isCloud ? createHttpApi() : createLocalApi();
  return { ...impl, storage };
}

// 편의를 위한 싱글톤 (테스트는 createApi()로 격리 생성)
export const api = createApi();

/** 실시간 채널을 쓸 수 있는가. 로컬 모드에는 게임 서버가 없다 */
export const liveAvailable = isCloud;

/** 실시간 채널에 연결한다. 로컬 모드에는 게임 서버가 없어 연결하지 않고 null을 돌려준다 */
export function openLive(onMessage: (msg: ServerMessage) => void): LiveConnection | null {
  return isCloud ? connectLive(onMessage) : null;
}
export type { LiveConnection };

export { when } from '../../shared/lib/when';
export { readBounty, kstDay, gameDay } from '../adapters/bounty';
export { readRanking } from '../adapters/ranking';
export { readMails, markMailRead } from '../adapters/mailbox';
export { readBlocks, changeBlock, reportChat } from '../adapters/chat';
export type { BlockedUser, ChatActionError } from '../adapters/chat';
export { readFriends, friendAction } from '../adapters/friends';
export type {
  ApiClient, AuthApi, StorageApi, AdminApi, AdminAccessResult,
  AuthResult, GameGateway, MaybePromise, DispatchResult,
  BountySnapshot, BountyProgressRow, BountyTicketRow,
  RankingBoardId, RankingRow, RankingBoard, MailItem, FriendItem, FriendOp, FriendOpResult,
  AdminUserRow, AdminDailyActiveRow, AdminRetentionRow, AdminEconomyRow, AdminBountyFunnelRow,
  AdminCatchQualityRow, AdminSpamFlagRow, AdminEventRow, AdminLetterRow, AdminChatReportRow, BalanceLive,
  AdminSentMailRow, AdminMailRequest, AdminMailPlan, AdminResetLink,
} from './types';
