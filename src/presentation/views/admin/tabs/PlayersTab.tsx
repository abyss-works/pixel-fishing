// 플레이어 탭 — 검색·명부와 제재·무결성 두 구역을 한 탭에 모은다.
// admin과 maintainer 모두 동일하게 사용한다(개인정보 경계는 서버 투영이 강제).
import type { PlayersSection } from '../routes';
import AntiAbuseTab from './AntiAbuseTab';
import UsersTab from './UsersTab';

export default function PlayersTab({ section, onCompose }: {
  section: PlayersSection;
  onSection?: (section: PlayersSection) => void;
  /** 이 계정을 받는 사람으로 넣고 우편 쓰기를 연다 */
  onCompose: (userId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {section === 'directory' && <UsersTab onCompose={onCompose} />}
      {section === 'sanctions' && <AntiAbuseTab onCompose={onCompose} />}
    </div>
  );
}
