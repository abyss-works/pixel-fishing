// 계정 식별 표기 — "닉네임(이메일)"과 짧은 uid를 적고, 전체 uid를 title로 보이는지 확인한다.
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import UserIdentity from './UserIdentity';

afterEach(cleanup);

const UID = 'abcdef01-2345-4678-9abc-def012345678';

describe('계정 식별 표기', () => {
  it('가입 계정은 닉네임(이메일)과 짧은 uid를 적고 전체 uid는 title에 둔다', () => {
    render(<UserIdentity user={{ user_id: UID, nickname: '갈치', email: 'galchi@example.com', is_anonymous: false }} />);
    expect(screen.getByText('갈치(galchi@example.com)')).toBeInTheDocument();
    expect(screen.getByText('abcdef01')).toBeInTheDocument();
    expect(screen.getByTitle(UID)).toBeInTheDocument();
  });

  it('게스트는 이메일 대신 게스트, 닉네임이 없으면 이름 없음이다', () => {
    render(<>
      <UserIdentity user={{ user_id: UID, nickname: '갈치', email: null, is_anonymous: true }} />
      <UserIdentity inline user={{ user_id: UID, nickname: null, email: 'galchi@example.com', is_anonymous: false }} />
    </>);
    expect(screen.getByText('갈치(게스트)')).toBeInTheDocument();
    expect(screen.getByText('이름 없음(galchi@example.com)')).toBeInTheDocument();
    expect(screen.getAllByText('abcdef01')).toHaveLength(2);
  });
});
