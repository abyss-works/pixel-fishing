import { useState } from 'react';
import type { GameAction } from '../../../../../game/rules/actions';
import type { DispatchResult, MaybePromise } from '../../../../../features/gameplay/service/types';
import type { RejectReason } from '../../../../../game/rules/rules';
import { isGuest } from '../../../../../features/account/service/accountActions';
import { accountLabel, type GuestProgress } from '../../../../../features/account/model/accountRules';
import { APP_VERSION } from '../../../../../version';
import { BUILD_LABEL } from '../../../../../buildId';
import Button from '../../../../ui/Button';
import Divider from '../../../../ui/Divider';
import Inset from '../../../../ui/Inset';
import KeyValueRow from '../../../../ui/KeyValueRow';
import PixelIcon from '../../../../ui/PixelIcon';
import RowButton from '../../../../ui/RowButton';
import AccountModal from '../../../overlays/account/AccountModal';
import MyInfoModal from '../../../overlays/account/MyInfoModal';
import CodeModal from '../../../overlays/codes/CodeModal';
import LetterModal from '../../../overlays/letter/LetterModal';
import PatchNotesModal from '../../../overlays/patchnotes/PatchNotesModal';
import Tip from '../../../../ui/Tip';
import SettingsModal from '../../../overlays/settings/SettingsModal';
import type { Notify } from '../../../../ui/hud/messageFeed';

type OpenWindow = 'account' | 'myInfo' | 'settings' | 'codes' | 'letter' | 'patch';

// 설정 탭 - 맨 위 계정 묶음(계정, 닉네임, 계정 관리, 내 정보), 옅은 가로선, 창을 여는 줄 버튼 넷
// (설정, 코드 입력, 개발자에게, 패치노트), 맨 아래 버전 줄. 세부 값은 각 버튼이 여는 창에서 다룬다.
// 연 창이 떠 있는 동안 그 창을 연 버튼은 눌린 모양이다. 이사 코드는 소유자 전용이라 개발 도구 패널에 있다.
export default function SettingsTab({ dispatch, setToast, syncLabel, syncState, guestProgress, recheckGuestProgress, account, accountFailed, uid, onAuthChanged, nickname, onRename }: {
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: Notify;
  syncLabel: string | null; syncState: string;
  guestProgress: GuestProgress;
  recheckGuestProgress: () => Promise<GuestProgress>;
  account: string | null; accountFailed: boolean; uid: string | null; onAuthChanged: () => Promise<void>;
  nickname: string | null; onRename: (name: string) => Promise<null | RejectReason>;
  }) {
  const [open, setOpen] = useState<OpenWindow | null>(null);
  const close = () => setOpen(null);

  return (
    <div className="flex flex-col flex-1">
      <Inset divided className="mb-2">
        <KeyValueRow label="계정" value={accountLabel(account, accountFailed)} />
        <KeyValueRow label="닉네임" value={nickname ?? '불러오는 중'} />
      </Inset>
      <Button variant="primary" full pressed={open === 'account'} onClick={() => setOpen('account')}
              className="text-sm flex items-center justify-center gap-1.5">
        <PixelIcon glyph="key" size={12} />계정 관리
      </Button>
      <div className="mt-2">
        <RowButton glyph="people" title="내 정보" pressed={open === 'myInfo'} onClick={() => setOpen('myInfo')} />
      </div>

      <Divider className="my-3 opacity-60" />

      <div className="flex flex-col gap-2">
        <RowButton glyph="gear" title="설정" pressed={open === 'settings'} onClick={() => setOpen('settings')} />
        <RowButton glyph="ticket" title="코드 입력" pressed={open === 'codes'} onClick={() => setOpen('codes')} />
        <RowButton glyph="letter" title="개발자에게" pressed={open === 'letter'} onClick={() => setOpen('letter')} />
        <RowButton glyph="book" title="패치노트" pressed={open === 'patch'} onClick={() => setOpen('patch')} />
      </div>

      {/* 관리자 대시보드는 별도 페이지(?admin#/admin)다 — 게임 셸에는 링크조차 두지 않는다
          (주소 입력이 곧 진입이고, 유저에게 노출할 이유가 없다). */}

      {open === 'account' && (
        <AccountModal setToast={setToast} onAuthChanged={onAuthChanged} account={account} accountFailed={accountFailed} guestProgress={guestProgress} recheckGuestProgress={recheckGuestProgress}
                      syncLabel={syncLabel} syncState={syncState} onClose={close} />
      )}
      {open === 'myInfo' && (
        <MyInfoModal setToast={setToast} account={account} uid={uid} nickname={nickname} onRename={onRename} onClose={close} />
      )}
      {open === 'settings' && <SettingsModal setToast={setToast} onClose={close} />}
      {open === 'codes' && <CodeModal dispatch={dispatch} setToast={setToast} onClose={close} />}
      {open === 'letter' && <LetterModal dispatch={dispatch} setToast={setToast} guest={isGuest(account)} onClose={close} />}
      {open === 'patch' && <PatchNotesModal onClose={close} />}

      {/* 버전(사람이 붙이는 이름)과 배포 식별자(커밋 SHA)를 같이 건다.
          업데이트가 나갔는지 확인할 때 봐야 하는 건 **뒤쪽**이다 — 버전은 릴리즈 때만 올라가서
          dev 배포 사이에서는 안 바뀐다. 두 탭의 이 값이 다르면 한쪽이 낡은 화면이다. */}
      <div className="flex items-center gap-1.5 text-2xs text-text-dim opacity-70 mt-auto pt-2">
        v{APP_VERSION}
        <Divider vertical />
        <Tip text="배포 식별자 (커밋 SHA)" className="pf-accent">{BUILD_LABEL}</Tip>
      </div>
    </div>
  );
}
