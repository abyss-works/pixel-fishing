import { useState } from 'react';
import type { GameState } from '../game/logic';
import type { GameAction } from '../game/actions';
import { when } from '../api';
import type { DispatchResult, MaybePromise } from '../api';
import { api } from '../api';
import { REJECT_TEXT } from '../game/logic';
import type { RejectReason } from '../game/rules';
import { APP_VERSION } from '../version';
import { BUILD_LABEL } from '../buildId';
import { cx } from '../ui/cx';
import Button from '../ui/Button';
import SectionTitle from '../ui/SectionTitle';
import PatchNotesPanel from './PatchNotesPanel';
import AccountModal from './AccountModal';
import { isAdminUrl } from './shared';
import LetterModal from './LetterModal';
import PixelIcon from '../ui/PixelIcon';
import type { GlyphId } from '../ui/PixelIcon';

// 설정 탭 버튼은 전부 **아이콘 + 가운데 정렬**이다. 목록형이라 왼쪽 정렬이었는데, 글자 길이가
// 제각각(3~9자)이라 줄마다 시작점은 같고 끝점이 달라 들쭉날쭉했다. 아이콘이 붙으면서
// 가운데로 모으는 편이 덩어리로 읽힌다.
function IconButton({ glyph, label, ...rest }: {
  glyph: GlyphId; label: string;
} & React.ComponentProps<typeof Button>) {
  return (
    <Button {...rest} className="text-sm flex items-center justify-center gap-1.5">
      <PixelIcon glyph={glyph} size={12} />{label}
    </Button>
  );
}

// 설정 탭 — 세 묶음: 계정(요약 + 관리 모달) · 데이터 · 업데이트 소식.
// 계정의 편집(연동·닉네임·ID)은 전부 모달 안이다 — 설정 화면은 훑어보는 요약만 남긴다.
export default function SettingsTab({ game, dispatch, setToast, syncLabel, syncState, account, uid, onAuthChanged, nickname, onRename }: {
  game: GameState;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: (m: string) => void;
  syncLabel: string | null; syncState: string;
  account: string | null; uid: string | null; onAuthChanged: () => Promise<void>;
  nickname: string | null; onRename: (name: string) => Promise<null | RejectReason>;
  }) {
  const [letter, setLetter] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const exportSave = async () => {
    const code = api.storage.saveCode(game);
    try {
      await navigator.clipboard.writeText(code);
      setToast('이사 코드를 클립보드에 복사했다. 다른 브라우저에서 불러오기.');
    } catch {
      window.prompt('복사해서 보관하세요 (이사 코드):', code);
    }
  };

  // 불러오기 = import 액션 — 서버가 migrate 후 수입하고 events에 흔적을 남긴다 (v0.5.0)
  const importSave = () => {
    const code = window.prompt('이사 코드를 붙여넣으세요:');
    if (!code) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(decodeURIComponent(atob(code.trim())));
    } catch {
      setToast('이사 코드가 올바르지 않다.');
      return;
    }
    when(dispatch({ type: 'import', save: parsed }), r => {
      if (r.status === 'ok') setToast('세이브를 불러왔다!');
    });
  };

  // 쿠폰 판정·동적 쿠폰 조회는 서버 소관 (v0.5.0) — 클라는 코드만 보낸다
  const enterCoupon = () => {
    const code = window.prompt('쿠폰 코드를 입력하세요:');
    if (!code) return;
    when(dispatch({ type: 'redeemCoupon', code }), r => {
      if (r.status === 'ok' && r.result.type === 'coupon') {
        setToast(`쿠폰 사용! +${r.result.gold}G — ${r.result.desc}`);
      } else if (r.status === 'rejected') {
        setToast(REJECT_TEXT[r.error]);
      }
    });
  };

  // 지원 코드 — 제재 소프트 랜딩(incidents/2026-08-24). 운영자가 발급한 일회성 자산 패키지
  // (골드·명성·낚싯대·배·도감)를 새 계정에 얹는다. 검증·소비는 서버(reliefs 선차감) 소관.
  const enterRelief = () => {
    const code = window.prompt('지원 코드를 붙여넣으세요:');
    if (!code) return;
    when(dispatch({ type: 'claimRelief', code }), r => {
      if (r.status === 'ok') setToast('지원 코드를 적용했다!');
      else if (r.status === 'rejected') setToast(REJECT_TEXT[r.error]);
    });
  };

  return (
    <div className="flex flex-col flex-1">
      {syncLabel && (
        <div className={cx('text-xs mb-2', syncState === 'error' ? 'text-danger' : 'text-text-dim')}>
          {syncLabel}
        </div>
      )}

      <SectionTitle>계정</SectionTitle>
      <div className="pf-frame divide-y divide-line mb-2 text-sm">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <span className="text-text-dim shrink-0">계정</span>
          <span className="truncate">{account ?? '게스트 (이메일 없음)'}</span>
        </div>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <span className="text-text-dim shrink-0">닉네임</span>
          <span className="truncate">{nickname ?? '불러오는 중…'}</span>
        </div>
      </div>
      <div className="flex flex-col gap-2 mb-2">
        <IconButton glyph="key" label="계정 관리" variant="primary"
                    onClick={() => setAccountOpen(true)} />
      </div>

      <SectionTitle>데이터</SectionTitle>
      <div className="flex flex-col gap-2 mb-2">
        <IconButton glyph="ticket" label="쿠폰 입력" onClick={enterCoupon} />
        <IconButton glyph="star" label="지원 코드 입력" onClick={enterRelief} />
        {/* 이사 코드 — deprecate(incidents/2026-08-24): 무검증 import가 변조 반입 통로로 실제
            악용됐다. 임시방편으로 ?admin에서만 노출하고, 서버도 소유자 계정/로컬만 받는다
            (api/action.ts importOwnerEmail). 기기 이동은 계정 연동이 정답이다. */}
        {isAdminUrl() && (
          <>
            <IconButton glyph="download" label="이사 코드 내보내기" onClick={exportSave} />
            <IconButton glyph="upload" label="이사 코드 불러오기" onClick={importSave} />
          </>
        )}
      </div>

      {/* 개발자 창구 — **로그인한 계정만.** 게스트는 답장 받을 방법이 없다 */}
      {account && (
        <>
          <SectionTitle>개발자에게</SectionTitle>
          <div className="flex flex-col gap-2 mb-2">
            <IconButton glyph="letter" label="편지 쓰기" onClick={() => setLetter(true)} />
          </div>
        </>
      )}

      {/* 관리자 대시보드는 별도 페이지(?admin#/admin)다 — 게임 셸에는 링크조차 두지 않는다
          (주소 입력이 곧 진입이고, 유저에게 노출할 이유가 없다). */}

      <PatchNotesPanel />

      {letter && (
        <LetterModal dispatch={dispatch} setToast={setToast} onClose={() => setLetter(false)} />
      )}
      {accountOpen && (
        <AccountModal game={game} setToast={setToast} onAuthChanged={onAuthChanged}
                      account={account} uid={uid} nickname={nickname} onRename={onRename}
                      onClose={() => setAccountOpen(false)} />
      )}

      {/* 버전(사람이 붙이는 이름)과 배포 식별자(커밋 SHA)를 같이 건다.
          업데이트가 나갔는지 확인할 때 봐야 하는 건 **뒤쪽**이다 — 버전은 릴리즈 때만 올라가서
          dev 배포 사이에서는 안 바뀐다. 두 탭의 이 값이 다르면 한쪽이 낡은 화면이다. */}
      <div className="text-2xs text-text-dim opacity-70 mt-auto pt-2">
        v{APP_VERSION} · <span className="pf-accent" title="배포 식별자 (커밋 SHA)">{BUILD_LABEL}</span>
      </div>
    </div>
  );
}
