import { useState } from 'react';
import type { GameState } from '../../../../../game/rules/logic';
import type { GameAction } from '../../../../../game/rules/actions';
import type { DispatchResult, MaybePromise } from '../../../../../features/gameplay/service/types';
import type { RejectReason } from '../../../../../game/rules/rules';
import { SETTING_PROMPTS } from '../../../../../features/announcements/model/whatsNew';
import { useFishArtStyle } from '../../../../../features/display/service/fishArtStyle';
import { useEncounterAlertSetting } from '../../../../../features/bounty/service/encounterAlert';
import type { EncounterAlertSetting } from '../../../../../features/bounty/service/encounterAlert';
import { APP_VERSION } from '../../../../../version';
import { BUILD_LABEL } from '../../../../../buildId';
import Button from '../../../../ui/Button';
import Frame from '../../../../ui/Frame';
import KeyValueRow from '../../../../ui/KeyValueRow';
import SectionTitle from '../../../../ui/SectionTitle';
import PixelIcon from '../../../../ui/PixelIcon';
import type { GlyphId } from '../../../../ui/PixelIcon';
import PatchNotesPanel from './PatchNotesPanel';
import AccountModal from '../../../overlays/account/AccountModal';
import LetterModal from '../../../overlays/letter/LetterModal';
import DisplayModal from '../../../overlays/display/DisplayModal';
import CodeModal from '../../../overlays/codes/CodeModal';
import type { Notify } from '../../../../ui/hud/messageFeed';

// 설정 탭 버튼은 전부 **아이콘 + 가운데 정렬**이다. 목록형이라 왼쪽 정렬이었는데, 글자 길이가
// 제각각(3~9자)이라 줄마다 시작점은 같고 끝점이 달라 들쭉날쭉했다. 아이콘이 붙으면서
// 가운데로 모으는 편이 덩어리로 읽힌다.
function LabeledButton({ glyph, label, ...rest }: {
  glyph: GlyphId; label: string;
} & React.ComponentProps<typeof Button>) {
  return (
    <Button {...rest} className="text-sm flex items-center justify-center gap-1.5">
      <PixelIcon glyph={glyph} size={12} />{label}
    </Button>
  );
}

const FISH_ART_OPTIONS = SETTING_PROMPTS.find(p => p.id === 'fish-art')!.options;

/** 조우 알림 요약 — 차단·미지원은 여기서 켤 수 없으니 이유만 보인다 */
function alertSummary(setting: EncounterAlertSetting): string {
  if (setting.permission === 'unsupported') return '이 브라우저는 알림을 지원하지 않아요';
  if (setting.permission === 'denied') return '브라우저에서 막혀 있어요. 사이트 설정에서 허용할 수 있어요.';
  return setting.active ? '켜짐 · 다른 화면을 볼 때 알려 줘요' : '꺼짐';
}

// 설정 탭 — 여섯 묶음: 계정 · 화면 · 알림 · 데이터 · 개발자에게 · 패치노트.
// 화면은 지금 상태를 요약 줄로만 보이고, 항목이 여럿이거나 설명이 필요한 것은 창에서 고친다
// (계정 관리·화면·코드 입력·편지). 이사 코드는 소유자 전용이라 개발 도구 패널의 운영 묶음에 있다.
export default function SettingsTab({ game, dispatch, setToast, syncLabel, syncState, account, uid, onAuthChanged, nickname, onRename }: {
  game: GameState;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: Notify;
  syncLabel: string | null; syncState: string;
  account: string | null; uid: string | null; onAuthChanged: () => Promise<void>;
  nickname: string | null; onRename: (name: string) => Promise<null | RejectReason>;
  }) {
  const [open, setOpen] = useState<'account' | 'display' | 'codes' | 'letter' | null>(null);
  const close = () => setOpen(null);
  const fishArt = useFishArtStyle();
  const fishArtOption = FISH_ART_OPTIONS.find(o => o.value === fishArt);
  const alertSetting = useEncounterAlertSetting();
  const canToggleAlert = alertSetting.permission !== 'unsupported' && alertSetting.permission !== 'denied';

  return (
    <div className="flex flex-col flex-1">
      <SectionTitle>계정</SectionTitle>
      <Frame divided className="mb-2">
        <KeyValueRow label="계정" value={account ?? '게스트 (이메일 없음)'} />
        <KeyValueRow label="닉네임" value={nickname ?? '불러오는 중…'} />
      </Frame>
      <div className="flex flex-col gap-2 mb-2">
        <LabeledButton glyph="key" label="계정 관리" variant="primary" full onClick={() => setOpen('account')} />
      </div>

      <SectionTitle>화면</SectionTitle>
      <Frame className="mb-2">
        <KeyValueRow label="물고기 그래픽"
                    value={fishArtOption ? `${fishArtOption.label} · ${fishArtOption.sub}` : fishArt}
                    action={<Button size="sm" aria-label="화면 설정" onClick={() => setOpen('display')}>변경</Button>} />
      </Frame>

      <SectionTitle>알림</SectionTitle>
      <Frame className="mb-2">
        <KeyValueRow label="네임드 조우"
                    value={<span className="text-xs">{alertSummary(alertSetting)}</span>}
                    action={canToggleAlert && (alertSetting.active
                      ? <Button size="sm" aria-label="조우 알림 끄기" onClick={alertSetting.disable}>끄기</Button>
                      : <Button size="sm" aria-label="조우 알림 켜기" onClick={() => {
                          void alertSetting.enable().then(ok => {
                            if (!ok) setToast('브라우저가 알림을 막았어요. 주소창의 사이트 설정에서 허용할 수 있어요.', 'warn');
                          });
                        }}>켜기</Button>)} />
      </Frame>

      <SectionTitle>데이터</SectionTitle>
      <Frame className="mb-2">
        <KeyValueRow label="쿠폰 · 지원 코드"
                    value={<span className="text-xs text-text-dim">받은 코드를 넣으면 골드·자산이 들어와요</span>}
                    action={<Button size="sm" aria-label="코드 입력" onClick={() => setOpen('codes')}>입력</Button>} />
      </Frame>

      {/* 개발자 창구 — **로그인한 계정만.** 게스트는 답장 받을 방법이 없다 */}
      {account && (
        <>
          <SectionTitle>개발자에게</SectionTitle>
          <div className="flex flex-col gap-2 mb-2">
            <LabeledButton glyph="letter" label="편지 쓰기" onClick={() => setOpen('letter')} />
          </div>
        </>
      )}

      {/* 관리자 대시보드는 별도 페이지(?admin#/admin)다 — 게임 셸에는 링크조차 두지 않는다
          (주소 입력이 곧 진입이고, 유저에게 노출할 이유가 없다). */}

      <PatchNotesPanel />

      {open === 'account' && (
        <AccountModal game={game} setToast={setToast} onAuthChanged={onAuthChanged}
                      account={account} uid={uid} nickname={nickname} onRename={onRename}
                      syncLabel={syncLabel} syncState={syncState} onClose={close} />
      )}
      {open === 'display' && <DisplayModal onClose={close} />}
      {open === 'codes' && <CodeModal dispatch={dispatch} setToast={setToast} onClose={close} />}
      {open === 'letter' && <LetterModal dispatch={dispatch} setToast={setToast} onClose={close} />}

      {/* 버전(사람이 붙이는 이름)과 배포 식별자(커밋 SHA)를 같이 건다.
          업데이트가 나갔는지 확인할 때 봐야 하는 건 **뒤쪽**이다 — 버전은 릴리즈 때만 올라가서
          dev 배포 사이에서는 안 바뀐다. 두 탭의 이 값이 다르면 한쪽이 낡은 화면이다. */}
      <div className="text-2xs text-text-dim opacity-70 mt-auto pt-2">
        v{APP_VERSION} · <span className="pf-accent" title="배포 식별자 (커밋 SHA)">{BUILD_LABEL}</span>
      </div>
    </div>
  );
}
