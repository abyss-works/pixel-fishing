import { useState } from 'react';
import type { GameAction } from '../../../../game/rules/actions';
import { REJECT_TEXT } from '../../../../game/rules/logic';
import type { CouponItem } from '../../../../game/content/coupons';
import { josa } from '../../../../shared/lib/josa';
import { when } from '../../../../shared/lib/when';
import type { DispatchResult, MaybePromise } from '../../../../features/gameplay/service/types';
import { sendNotice } from '../../../../features/display/model/toastPolicy';
import { formatItemQtyText } from '../../../../features/inventory/model/items';
import Modal from '../../../ui/Modal';
import Button from '../../../ui/Button';
import Tip from '../../../ui/Tip';
import SectionTitle from '../../../ui/SectionTitle';
import TextInput from '../../../ui/TextInput';
import { fmtGold } from '../../../ui/format';
import type { Notify } from '../../../ui/hud/messageFeed';

type Dispatch = (a: GameAction) => MaybePromise<DispatchResult>;

/** 쿠폰 보상 문구 조립 — 골드와 아이템을 조사에 맞춰 한 문장과 1줄 토스트로 정리한다 */
function formatCouponNotice(gold: number, items?: readonly CouponItem[]): { text: string; toastText: string } {
  const goldText = gold > 0 ? fmtGold(gold) : null;
  const itemTexts = (items ?? []).filter(item => item.qty > 0).map(item => formatItemQtyText(item.id, item.qty));
  const rewardParts = [
    ...(goldText ? [goldText] : []),
    ...(itemTexts.length > 0 ? [itemTexts.join(', ')] : []),
  ];
  if (rewardParts.length === 0) {
    return { text: '쿠폰을 사용했어요!', toastText: '쿠폰 사용 완료!' };
  }
  const rewardText = rewardParts.length === 2
    ? `${rewardParts[0]}${josa(rewardParts[0], '과/와')} ${rewardParts[1]}`
    : rewardParts[0];
  const toastReward = itemTexts.length > 1
    ? `${goldText ? `${goldText} 외 ` : ''}아이템 ${itemTexts.length}종`
    : rewardText;
  return {
    text: `쿠폰을 사용했어요! ${rewardText}${josa(rewardText, '을/를')} 받았어요.`,
    toastText: `쿠폰 ${toastReward} 받음!`,
  };
}

/** 코드 한 줄 — 입력칸 + 사용 버튼. 빈 칸이거나 처리 중이면 잠근다. 성공하면 칸을 비운다 */
function CodeField({ label, placeholder, submit }: {
  label: string;
  placeholder: string;
  /** 판정 요청 — 끝나면 done(성공 여부). 요청 자체가 실패하면(통신 오류) 잠금만 풀고 오류는 전역 처리에 맡긴다 */
  submit: (code: string, done: (ok: boolean) => void) => unknown;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const value = code.trim();
  const send = () => {
    if (!value || busy) return;
    setBusy(true);
    const unlock = () => setBusy(false);
    try {
      const pending = submit(value, ok => { unlock(); if (ok) setCode(''); });
      // 실패는 그대로 흘려보내 전역 오류 처리가 안내하게 두고, 잠금만 푼다
      if (pending instanceof Promise) void pending.finally(unlock);
    } catch (e) {
      unlock();
      throw e;
    }
  };
  return (
    <form className="flex gap-2" onSubmit={e => { e.preventDefault(); send(); }}>
      <TextInput aria-label={label} placeholder={placeholder} value={code}
                 onChange={e => setCode(e.target.value)} className="flex-1 min-w-0" />
      {/* 보이는 문구는 "사용" 하나 — 무엇을 쓰는지는 바로 위 섹션 제목이 말한다. 읽기 도구용 이름만 구분한다 */}
      <Button type="submit" size="sm" aria-label={`${label} 사용`} disabled={!value || busy}>사용</Button>
    </form>
  );
}

// 코드 입력 창 — 쿠폰과 지원 코드를 한곳에서 넣는다. 판정은 전부 서버 소관이고, 결과는 토스트로 알린다.
export default function CodeModal({ dispatch, setToast, onClose }: {
  dispatch: Dispatch;
  setToast: Notify;
  onClose: () => void;
}) {
  // 쿠폰 — 정적 코드와 동적 쿠폰 조회는 서버가 판정한다. 클라는 코드만 보낸다
  const redeemCoupon = (code: string, done: (ok: boolean) => void) =>
    when(dispatch({ type: 'redeemCoupon', code }), r => {
      if (r.status === 'ok' && r.result.type === 'coupon') {
        const { text, toastText } = formatCouponNotice(r.result.gold, r.result.items);
        sendNotice(setToast, {
          kind: 'social.modalAction',
          text,
          toastText,
          tone: 'gold',
        });
        done(true);
      } else {
        if (r.status === 'rejected') sendNotice(setToast, { kind: 'system.modalRejected', text: REJECT_TEXT[r.error] });
        done(false);
      }
    });

  // 지원 코드 — 운영자가 발급하는 일회성 자산 패키지. 검증·소비는 서버 소관
  const claimRelief = (code: string, done: (ok: boolean) => void) =>
    when(dispatch({ type: 'claimRelief', code }), r => {
      if (r.status === 'ok') {
        sendNotice(setToast, {
          kind: 'social.modalAction',
          text: '지원 코드를 적용했어요!',
          tone: 'gold',
        });
      } else if (r.status === 'rejected') {
        sendNotice(setToast, { kind: 'system.modalRejected', text: REJECT_TEXT[r.error] });
      }
      done(r.status === 'ok');
    });

  return (
    <Modal layer="app" title="코드 입력" narrow onClose={onClose}>
      <SectionTitle>
        <Tip text="공지나 이벤트로 받은 쿠폰 코드를 넣으면 골드나 아이템을 받아요.">쿠폰</Tip>
      </SectionTitle>
      <CodeField label="쿠폰 코드" placeholder="예) 출항준비" submit={redeemCoupon} />

      <SectionTitle>
        <Tip text={'운영자가 따로 보내 드린 지원 코드를 붙여 넣으면 그 자산이 이 계정에 더해져요.\n한 번만 쓸 수 있어요.'}>지원 코드</Tip>
      </SectionTitle>
      <CodeField label="지원 코드" placeholder="받은 코드를 붙여 넣기" submit={claimRelief} />
    </Modal>
  );
}
