// 로컬 API 구현 — 클라우드 미설정(dev·테스트) 전용
// 게임은 LocalGameGateway(메모리 + localStorage), 인증은 가짜 계정으로 동작한다
import { LocalGameGateway } from './localGameGateway';
import type {
  AcceptConsentResult, AccountLookup, GameGateway, AuthApi, AuthResult, ConsentStatus, DevApi, PromoteTestResult, ResetDevAccountResult,
} from '../api/types';
import type { AdminApi } from '../api/types';
import { newState } from '../../game/rules/logic';
import type { GameState } from '../../game/rules/logic';

const DEV_ACCOUNT = 'dev@localhost';
const DEV_UID = '00000000-0000-4000-8000-000000000000';
const LOCAL_SAVE_KEY = 'pixel-fishing-save';
const LOCAL_CONSENT: ConsentStatus = {
  required: false,
  version: '2026-11-25',
  effectiveAt: '2026-11-25T00:00:00.000Z',
};

class LocalAuth implements AuthApi {
  isConfigured = false;

  async ensureSession(): Promise<string | null> {
    return DEV_UID;
  }
  async currentAccount(): Promise<AccountLookup> {
    return { status: 'account', email: DEV_ACCOUNT };
  }
  async getSession(): Promise<{ uid: string | null; email: string | null }> {
    return { uid: DEV_UID, email: DEV_ACCOUNT };
  }
  async getAccountConsent(): Promise<ConsentStatus> {
    return { ...LOCAL_CONSENT };
  }
  async acceptConsent(_version: string): Promise<AcceptConsentResult> {
    return { ok: true, consent: { ...LOCAL_CONSENT } };
  }
  async startGoogle(): Promise<AuthResult> {
    return { ok: false, msg: '클라우드가 설정되지 않았어요.' };
  }
  takeGoogleLanding(): { tag: string; error: string | null } | null {
    return null;
  }
  async signOut(): Promise<void> {}
  async deleteAccount(): Promise<AuthResult> {
    return { ok: false, msg: '클라우드가 설정되지 않았어요.' };
  }
  accountNudgedDay(): string | null {
    const v = localStorage.getItem('pf-account-nudged');
    // 하루 한 번 규칙 이전의 값('1')은 날짜가 아니므로 띄운 적 없는 것으로 본다
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  }
  markAccountNudged(day: string): void {
    localStorage.setItem('pf-account-nudged', day);
  }
}

// ---------- 관리자 읽기 (로컬 = 클라우드 미설정) ----------
// events·saves_current 같은 운영 원장이 로컬에는 존재하지 않는다. 그래서 접근 판정은
// 'local'을 주고 데이터 getter는 **reject**한다 — 조용한 빈 배열 반환은 "데이터가 없다"라는
// 거짓말이 되고, 게이트를 우회한 오용을 숨긴다. 정상 경로에서는 RequireAdmin이 local을
// 걸러주므로 여기가 불리는 일 자체가 없어야 한다.
// reject는 Promise로 돌려야 한다 — 동기 throw면 호출부의 await/rejects 계약이 깨진다.

const noCloudAdminData = (): Error =>
  new Error('관리자 데이터는 클라우드 연결(운영/스테이징 서버) 환경에서만 읽힌다');

const rejected = <T>(): Promise<T> => Promise.reject(noCloudAdminData());

class LocalAdmin implements AdminApi {
  isConfigured = false;
  async access(): Promise<{ kind: 'local'; uid: null }> {
    return { kind: 'local', uid: null };
  }
  signIn(): Promise<never> { return rejected(); }
  takeSignInReturn(): null { return null; }
  signOut(): Promise<never> { return rejected(); }
  overview(_days?: number): Promise<never> { return rejected(); }
  users(): Promise<never[]> { return rejected(); }
  live(): Promise<never> { return rejected(); }
  dailyStats(_from: string, _to: string): Promise<never[]> { return rejected(); }
  retention(): Promise<never[]> { return rejected(); }
  sessions(_userId?: string, _limit?: number): Promise<never[]> { return rejected(); }
  economy(_days: number): Promise<never[]> { return rejected(); }
  bountyFunnel(_days: number): Promise<never[]> { return rejected(); }
  spamFlags(): Promise<never[]> { return rejected(); }
  recentEvents(): Promise<never[]> { return rejected(); }
  letters(): Promise<never[]> { return rejected(); }
  changelog(): Promise<never[]> { return rejected(); }
  chatReports(): Promise<never[]> { return rejected(); }
  sentMails(): Promise<never[]> { return rejected(); }
  mail(_op: 'preview' | 'send', _request: unknown): Promise<never> { return rejected(); }
  restrict(_userId: string, _restricted: boolean): Promise<never> { return rejected(); }
  letterHandled(_letterId: number, _handled: boolean): Promise<never> { return rejected(); }
  revokeSessions(_userId: string): Promise<never> { return rejected(); }
  userEvents(_userId: string, _limit?: number): Promise<never[]> { return rejected(); }
  userState(_uid: string): Promise<never> { return rejected(); }
  balanceLive(_days?: number): Promise<never> { return rejected(); }
  deployHost(): string | null {
    return null;
  }
}

class LocalDev implements DevApi {
  async promoteTestAccount(): Promise<PromoteTestResult> {
    return { ok: true, email: DEV_ACCOUNT, isAnonymous: false };
  }

  async resetDevAccount(): Promise<ResetDevAccountResult> {
    const initial = newState();
    try {
      localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(initial));
    } catch {
      /* 저장소 쓰기 실패는 무시 — 초기 상태 반환은 유지한다 */
    }
    return { state: initial, version: 1 };
  }
}

export function createLocalApi():
{ createGameGateway(initial: GameState): GameGateway; auth: AuthApi; admin: AdminApi; dev: DevApi } {
  return {
    createGameGateway: initial => new LocalGameGateway(initial),
    auth: new LocalAuth(),
    admin: new LocalAdmin(),
    dev: new LocalDev(),
  };
}
