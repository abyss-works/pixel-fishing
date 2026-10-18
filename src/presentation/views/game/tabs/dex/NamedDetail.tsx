import type { BountyQuest } from '../../../../../game/content/bounties';
import { zoneById } from '../../../../../game/content/zones';
import type { GameState } from '../../../../../game/rules/logic';
import { selectNamedDetail } from '../../../../../features/dex/model/catalog';
import Modal from '../../../../ui/Modal';
import Inset from '../../../../ui/Inset';
import KeyValueRow from '../../../../ui/KeyValueRow';
import PageTitle from '../../../../ui/PageTitle';
import SectionTitle from '../../../../ui/SectionTitle';
import FishSprite from '../../../../ui/fish/FishSprite';
import { fmtGold } from '../../../../ui/format';

// 네임드 상세 — 일반 어종 상세와 같은 2열·오목한 칸 언어. 오른쪽은 순위 대신 읽을거리(전승)다.
// 왼쪽은 수배서처럼 정체·체력·보상·흔적을 세우고, 오른쪽은 그 바다 사람들이 전해 온 이야기를 길게 싣는다.
// 이름·로어·흔적·전승은 토벌한 뒤에만 공개한다. 진열 칸은 일반 어종보다 깊은 물빛(바탕까지 일찍 가라앉음)이다.
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
          <Inset className="flex flex-col items-center px-2 py-5
                            bg-[linear-gradient(180deg,var(--c-surface-2),var(--c-bg)_55%)]">
            <FishSprite fish={d.fish} preset="portrait" discovered={d.found} animate={d.found}
                        ariaLabel={d.name ?? '미확인 네임드'} className="block" />
            <span className="pf-accent mt-1 text-2xs text-text-dim">{zone}의 네임드</span>
          </Inset>
          <PageTitle>{d.name ?? '???'}</PageTitle>
          <p className="text-sm leading-[1.8] text-text-dim">
            {d.lore ?? '…수배서에만 그림자로 남은 존재다. 토벌하면 정체가 드러난다.'}
          </p>
          <Inset divided>
            <KeyValueRow label="출현 구역" value={zone} />
            <KeyValueRow label="결투 체력" value={<span className="pf-accent">{d.hp}</span>} />
            <KeyValueRow label="토벌 보상" value={<span className="pf-accent text-gold">{fmtGold(d.reward)}</span>} />
            <KeyValueRow label="처음 토벌한 날" value={d.firstCaught ?? (d.found ? '알 수 없음' : '—')} />
            {d.trace && <KeyValueRow label="흔적" value={<span className="italic text-text-dim">{d.trace}</span>} />}
          </Inset>
        </section>

        <section className="min-w-0 flex flex-col">
          <SectionTitle>전해 오는 이야기</SectionTitle>
          <Inset className="pf-scroll-panel h-[min(54vh,460px)] overflow-y-auto px-5 py-4">
            {d.chronicle ? (
              <article className="mx-auto flex max-w-[60ch] flex-col gap-4 text-sm leading-[2] text-text">
                {d.chronicle.map((p, idx) => (
                  <p key={idx} className={idx === 0
                    ? 'first-letter:float-left first-letter:mr-1.5 first-letter:text-3xl first-letter:leading-none first-letter:text-gold'
                    : undefined}>
                    {p}
                  </p>
                ))}
              </article>
            ) : (
              <div className="flex h-full items-center justify-center text-center text-sm leading-[1.8] text-text-dim">
                이 바다 사람들이 전해 온 이야기는<br />토벌한 뒤에 읽을 수 있다.
              </div>
            )}
          </Inset>
        </section>
      </div>
    </Modal>
  );
}
