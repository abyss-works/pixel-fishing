import type { BountyQuest } from '../../../../../game/content/bounties';
import { zoneById } from '../../../../../game/content/zones';
import type { GameState } from '../../../../../game/rules/logic';
import { selectNamedDetail } from '../../../../../features/dex/model/catalog';
import Modal from '../../../../ui/Modal';
import PageTitle from '../../../../ui/PageTitle';
import Subheading from '../../../../ui/Subheading';
import Frame from '../../../../ui/Frame';
import FishSprite from '../../../../ui/fish/FishSprite';
import { fmtGold } from '../../../../ui/format';

// 네임드 상세 — 일반 어종 상세와 같은 2열이지만 오른쪽은 순위 대신 읽을거리(전승)다.
// 왼쪽은 수배서처럼 정체·체력·보상·흔적을 세우고, 오른쪽은 그 바다 사람들이 전해 온 이야기를 길게 싣는다.
// 이름·로어·흔적·전승은 토벌한 뒤에만 공개한다.
export default function NamedDetail({ quest, game, onClose }: {
  quest: BountyQuest; game: GameState; onClose: () => void;
}) {
  const d = selectNamedDetail(game, quest);
  if (!d) return null;
  const zone = zoneById(d.zone)?.shortName ?? d.zone;
  return (
    <Modal xl onClose={onClose}>
      <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-5 max-[640px]:grid-cols-1">
        <section className="min-w-0 flex flex-col gap-3">
          <div className="flex flex-col items-center">
            <FishSprite fish={d.fish} preset="portrait" discovered={d.found} animate={d.found}
                        ariaLabel={d.name ?? '미확인 네임드'} className="block" />
            <p className="pf-accent text-xs text-text-dim mt-1">{zone}의 네임드</p>
          </div>
          <PageTitle className="text-center">{d.name ?? '???'}</PageTitle>
          <div className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
            <span className="text-text-dim">출현 구역</span><span>{zone}</span>
            <span className="text-text-dim">결투 체력</span><span className="pf-accent">{d.hp}</span>
            <span className="text-text-dim">토벌 보상</span><span className="pf-accent">{fmtGold(d.reward)}</span>
            <span className="text-text-dim">처음 토벌한 날</span><span>{d.firstCaught ?? (d.found ? '알 수 없음' : '—')}</span>
          </div>
          <p className="text-sm text-text-dim italic leading-[1.8]">
            {d.lore ?? '…수배서에만 그림자로 남은 존재다. 토벌하면 정체가 드러난다.'}
          </p>
          {d.trace && (
            <p className="border-l-2 border-gold-dark pl-2 text-xs text-text-dim">흔적 — {d.trace}</p>
          )}
        </section>

        <section className="min-w-0 flex flex-col">
          <Subheading>전해 오는 이야기</Subheading>
          <Frame className="pf-scroll-panel h-[min(52vh,440px)] overflow-y-auto px-4 py-3">
            {d.chronicle ? (
              <article className="flex flex-col gap-3 text-sm leading-[1.95] text-text">
                {d.chronicle.map((p, i) => (
                  <p key={i} className={i === 0 ? 'first-letter:text-2xl first-letter:text-gold first-letter:mr-0.5' : undefined}>
                    {p}
                  </p>
                ))}
              </article>
            ) : (
              <div className="flex h-full items-center justify-center text-center text-sm text-text-dim">
                이 바다 사람들이 전해 온 이야기는<br />토벌한 뒤에 읽을 수 있다.
              </div>
            )}
          </Frame>
        </section>
      </div>
    </Modal>
  );
}
