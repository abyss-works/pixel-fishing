import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { REJECT_TEXT } from '../../../../game/rules/logic';
import type { GameAction } from '../../../../game/rules/actions';
import { isClaimable, isPending } from '../../../../features/mailbox/model/mailbox';
import type { MailItem } from '../../../../features/mailbox/model/mailbox';
import { useMailbox } from '../../../../features/mailbox/service/useMailbox';
import type { DispatchResult, MaybePromise } from '../../../../features/gameplay/service/types';
import { when } from '../../../../shared/lib/when';
import Button from '../../../ui/Button';
import { cx } from '../../../ui/cx';
import { fmtGold } from '../../../ui/format';
import type { Notify } from '../../../ui/hud/messageFeed';
import Inset from '../../../ui/Inset';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import Note from '../../../ui/Note';
import PixelIcon from '../../../ui/PixelIcon';

// 우편함 창. 게임 스테이지 안에 뜨고, 680 폭에 탭이 없어 내용 높이를 따른다.
// 위는 우편 표(아이콘, 제목, 받은 날, 골드)로 표 머리와 다섯 줄 높이이고 넘치면 칸 안에서 굴린다. 아래는 고른 우편의 본문 칸이다.
// 할 일이 남은 우편은 골드 아이콘과 굵은 제목으로, 받지 않은 골드는 골드색으로 보인다. 처음 연 우편에 읽음이 남는다.
// 본문 칸 맨 아래 한 줄은 첨부 골드와 받기 자리이고, 골드가 없는 우편에서도 비워 두어 칸 높이가 같다.
const dateOf = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
const HEAD = 'h-[30px] px-2 font-normal border-b border-line';

export default function MailboxModal({ dispatch, setToast, onClose }: {
  dispatch: (action: GameAction) => MaybePromise<DispatchResult>;
  setToast: Notify;
  onClose: () => void;
}) {
  const { mails, loading, failed, markRead, claim } = useMailbox();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [claiming, setClaiming] = useState(false);
  const selected = mails?.find(m => m.id === selectedId) ?? null;

  const select = (mail: MailItem) => {
    setSelectedId(mail.id);
    markRead(mail.id);
  };
  const onClaim = (mail: MailItem) => {
    setClaiming(true);
    void Promise.resolve(when(claim(dispatch, mail.id), result => {
      if (result.status === 'rejected') setToast(REJECT_TEXT[result.error], 'warn');
      else setToast(`우편에서 ${fmtGold(mail.gold)}를 받았어요!`, 'gold');
    })).finally(() => setClaiming(false));
  };
  const onRowKey = (e: KeyboardEvent, mail: MailItem) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    select(mail);
  };

  return (
    <Modal layer="stage" md onClose={onClose}>
      <ModalCard title="우편함" onClose={onClose}>
        <div className="flex flex-col gap-3">
          {/* 표 머리 한 줄과 우편 다섯 줄 높이 */}
          <Inset className="pf-scroll-panel h-[212px] overflow-y-auto px-3 pb-2">
            {mails && mails.length > 0 ? (
              <table className="w-full table-fixed border-collapse text-sm" aria-label="받은 우편">
                <colgroup><col className="w-5" /><col /><col className="w-[120px]" /><col className="w-20" /></colgroup>
                <thead>
                  <tr className="sticky top-0 bg-[color-mix(in_oklab,var(--c-bg)_45%,var(--c-surface))] text-2xs text-text-dim">
                    <th className={cx(HEAD, 'pl-0')} aria-label="상태" />
                    <th className={cx(HEAD, 'text-left')}>제목</th>
                    <th className={cx(HEAD, 'text-right')}>받은 날</th>
                    <th className={cx(HEAD, 'text-right pr-0')}>골드</th>
                  </tr>
                </thead>
                <tbody>
                  {mails.map((m, i) => {
                    const pending = isPending(m);
                    const on = m.id === selectedId;
                    const cell = cx('h-[34px]', i > 0 && 'border-t border-line/60', on && 'bg-gold/[0.07]');
                    return (
                      <tr key={m.id} tabIndex={0} aria-selected={on} onClick={() => select(m)} onKeyDown={e => onRowKey(e, m)}
                          className="cursor-pointer hover:bg-surface-2/50 focus-visible:outline-1 focus-visible:outline-gold">
                        <td className={cell}>
                          <PixelIcon glyph="letter" size={12} className={pending ? 'text-gold' : 'text-text-dim'} />
                        </td>
                        <td className={cx(cell, 'px-2 truncate', pending ? 'font-bold' : 'font-normal',
                          on ? 'text-gold' : pending ? 'text-text' : 'text-text-dim')}>{m.title}</td>
                        <td className={cx(cell, 'px-2 text-right pf-accent text-2xs text-text-dim')}>{dateOf(m.createdAt)}</td>
                        <td className={cx(cell, 'pl-2 text-right pf-accent text-xs', isClaimable(m) ? 'text-gold' : 'text-text-dim')}>
                          {m.gold > 0 ? fmtGold(m.gold) : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="flex h-full items-center justify-center">
                {loading ? <Note>우편을 불러오는 중이에요.</Note>
                  : failed ? <Note tone="warn">우편을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</Note>
                  : <Note>받은 우편이 없어요.</Note>}
              </div>
            )}
          </Inset>
          <Inset className="h-[190px] px-3 pt-2.5 pb-2 flex flex-col gap-2">
            {selected ? (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <b className="text-gold truncate">{selected.title}</b>
                  <span className="pf-accent text-2xs text-text-dim shrink-0">{dateOf(selected.createdAt)}</span>
                </div>
                <p className="pf-scroll-panel flex-1 min-h-0 overflow-y-auto whitespace-pre-line text-sm leading-relaxed">{selected.body}</p>
                <div className="h-9 shrink-0 flex items-center justify-between gap-2 border-t border-line pt-1.5">
                  {selected.gold > 0 && (
                    <>
                      <span className="inline-flex items-center gap-1.5 text-gold">
                        <PixelIcon glyph="coin" size={12} />
                        <span className="pf-accent text-xs">{fmtGold(selected.gold)}</span>
                      </span>
                      {isClaimable(selected) ? (
                        <Button variant="primary" disabled={claiming} onClick={() => onClaim(selected)}>받기</Button>
                      ) : (
                        <span className="text-xs text-text-dim">받음</span>
                      )}
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center">
                {mails && mails.length > 0 && <Note>위에서 우편을 골라 주세요.</Note>}
              </div>
            )}
          </Inset>
        </div>
      </ModalCard>
    </Modal>
  );
}
