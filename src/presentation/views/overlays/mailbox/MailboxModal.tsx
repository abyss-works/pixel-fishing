import { useState } from 'react';
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
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import Note from '../../../ui/Note';
import Panel from '../../../ui/Panel';
import SelectList from '../../../ui/SelectList';
import PixelIcon from '../../../ui/PixelIcon';

// 우편함 창 — 게임 스테이지 안에 뜬다. 왼쪽 목록에서 고르면 오른쪽에 본문이 열리고, 골드가 붙은 우편은 받기로 받는다.
// 처음 연 우편에 읽음이 남는다. 칸 높이는 고정이라 목록이 바뀌어도 창 크기가 흔들리지 않는다.
const dateOf = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });

function MailRow({ mail }: { mail: MailItem }) {
  const pending = isPending(mail);
  return (
    <>
      <PixelIcon glyph="letter" size={12} className={pending ? 'text-gold' : 'text-text-dim'} />
      <span className="flex-1 min-w-0">
        <b className={cx('block truncate', !pending && 'font-normal text-text-dim')}>{mail.title}</b>
        <span className="block text-xs text-text-dim">{dateOf(mail.createdAt)}</span>
      </span>
      {mail.gold > 0 && (
        <span className={cx('text-xs shrink-0', isClaimable(mail) ? 'text-gold' : 'text-text-dim')}>{fmtGold(mail.gold)}</span>
      )}
    </>
  );
}

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

  return (
    <Modal layer="stage" xl onClose={onClose}>
      <ModalCard title="우편함" onClose={onClose}>
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 max-[640px]:grid-cols-1">
          <Panel title="받은 우편" className="min-w-0">
            <div className="pf-scroll-panel h-80 overflow-y-auto pr-1 max-[640px]:h-48">
              {mails && mails.length > 0 ? (
                <SelectList label="받은 우편" items={mails} keyOf={m => String(m.id)} selectedKey={String(selectedId ?? '')}
                            onSelect={key => { const m = mails.find(x => String(x.id) === key); if (m) select(m); }}
                            renderItem={m => <MailRow mail={m} />} />
              ) : (
                <div className="flex h-full items-center justify-center">
                  {loading ? <Note>우편을 불러오는 중이에요.</Note>
                    : failed ? <Note tone="warn">우편을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</Note>
                    : <Note>받은 우편이 없어요.</Note>}
                </div>
              )}
            </div>
          </Panel>
          <Panel title={selected ? selected.title : '우편'} className="min-w-0">
            <div className="pf-scroll-panel h-80 overflow-y-auto pr-1 flex flex-col gap-3 max-[640px]:h-auto">
              {selected ? (
                <>
                  <span className="text-xs text-text-dim">{dateOf(selected.createdAt)}</span>
                  <p className="whitespace-pre-line text-sm leading-relaxed">{selected.body}</p>
                  {selected.gold > 0 && (
                    <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-2">
                      <span className="inline-flex items-center gap-1.5 text-gold">
                        <PixelIcon glyph="coin" size={12} />
                        {fmtGold(selected.gold)}
                      </span>
                      {isClaimable(selected) ? (
                        <Button variant="primary" size="sm" disabled={claiming} onClick={() => onClaim(selected)}>받기</Button>
                      ) : (
                        <span className="text-xs text-text-dim">받음</span>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Note>왼쪽에서 우편을 골라 주세요.</Note>
                </div>
              )}
            </div>
          </Panel>
        </div>
      </ModalCard>
    </Modal>
  );
}
