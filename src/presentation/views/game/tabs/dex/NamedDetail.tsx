import type { BountyQuest } from '../../../../../game/content/bounties';
import { zoneById } from '../../../../../game/content/zones';
import type { GameState } from '../../../../../game/rules/logic';
import { selectNamedDetail } from '../../../../../features/dex/model/catalog';
import Modal from '../../../../ui/Modal';
import DetailCell from './DetailCell';
import Inset from '../../../../ui/Inset';
import KeyValueRow from '../../../../ui/KeyValueRow';
import PageTitle from '../../../../ui/PageTitle';
import FishSprite from '../../../../ui/fish/FishSprite';
import { fmtGold } from '../../../../ui/format';

// 네임드 상세 — 일반 어종 상세와 같은 머리·메인 그리드·오목한 칸 언어. 오른쪽은 순위 대신 읽을거리(전승)이고
// 왼쪽 두 칸(표본 · 기록) 높이를 한 칸으로 이어 받는다.
// 이름·로어·흔적·전승은 토벌한 뒤에만 공개한다. 진열 칸은 일반 어종보다 일찍 가라앉는 깊은 물빛이다.
export default function NamedDetail({ quest, game, onClose }: {
  quest: BountyQuest; game: GameState; onClose: () => void;
}) {
  const d = selectNamedDetail(game, quest);
  if (!d) return null;
  const zone = zoneById(d.zone)?.shortName ?? d.zone;
  return (
    <Modal xl onClose={onClose}>
      <header className="mb-3 flex items-baseline gap-3 border-b border-line pb-2 pr-8">
        <PageTitle>{d.name ?? '???'}</PageTitle>
        <span className="pf-accent ml-auto text-2xs text-text-dim">{zone}의 네임드</span>
      </header>

      <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)] grid-rows-[auto_1fr] gap-x-5 gap-y-4
                      max-[640px]:grid-cols-1">
        <DetailCell title="표본">
          <Inset tone="light" className="flex flex-1 flex-col
                 bg-[linear-gradient(180deg,var(--c-surface-2),color-mix(in_oklab,var(--c-bg)_60%,var(--c-surface))_60%)]">
            <div className="flex justify-center px-2 pt-4">
              <FishSprite fish={d.fish} preset="portrait" discovered={d.found} animate={d.found}
                          ariaLabel={d.name ?? '미확인 네임드'} className="block" />
            </div>
            <p className="mt-auto px-3 pb-3 pt-2 text-sm leading-[1.8] text-text-dim">
              {d.lore ?? '…수배서에만 그림자로 남은 존재다. 토벌하면 정체가 드러난다.'}
            </p>
          </Inset>
        </DetailCell>

        <DetailCell title="전해 오는 이야기" className="row-span-2 max-[640px]:row-span-1">
          <Inset className="pf-scroll-panel flex-1 min-h-64 max-h-[min(62vh,560px)] overflow-y-auto px-5 py-4">
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
                이 바다 사람들이 전해 온 이야기는<br />토벌한 뒤에 읽을 수 있어요.
              </div>
            )}
          </Inset>
        </DetailCell>

        <DetailCell title="기록">
          <Inset divided className="flex-1">
            <KeyValueRow label="출현 구역" value={zone} />
            <KeyValueRow label="결투 체력" value={<span className="pf-accent">{d.hp}</span>} />
            <KeyValueRow label="토벌 보상" value={<span className="pf-accent text-gold">{fmtGold(d.reward)}</span>} />
            <KeyValueRow label="처음 토벌한 날" value={d.firstCaught ?? (d.found ? '알 수 없음' : '—')} />
            {d.trace && <KeyValueRow label="흔적" value={<span className="italic text-text-dim">{d.trace}</span>} />}
          </Inset>
        </DetailCell>
      </div>
    </Modal>
  );
}

