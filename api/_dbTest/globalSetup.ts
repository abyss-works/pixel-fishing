import { Client } from 'pg';
import { GenericContainer, Network, Wait } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';
import type { TestProject } from 'vitest/node';
import { AUTHENTICATOR_PASSWORD, DB_NETWORK_ALIAS, DB_TEST_IMAGE, TEMPLATE_DATABASE } from './config.js';
import { applySqlMigrations } from './migrations.js';

declare module 'vitest' {
  export interface ProvidedContext {
    dbAdminUrl: string;
    /** 테스트 파일이 띄우는 보조 컨테이너(PostgREST)가 DB에 닿는 Docker 네트워크 */
    dbNetwork: string;
  }
}

const PASSWORD = 'test-only-password';

async function waitForDatabase(url: string): Promise<void> {
  const deadline = Date.now() + 120_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    const client = new Client({ connectionString: url });
    try {
      await client.connect();
      // 이미지 초기화 스크립트가 만드는 Supabase 역할이 보일 때 초기화가 끝난 것으로 본다.
      const { rowCount } = await client.query("select 1 from pg_roles where rolname = 'authenticated'");
      if (rowCount === 1) return;
    } catch (e) {
      lastError = e;
    } finally {
      await client.end().catch(() => {});
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`테스트 데이터베이스가 준비되지 않았습니다: ${String(lastError)}`);
}

// 이미지 초기화 스크립트는 auth 스키마(auth.users·auth.uid())를 postgres 데이터베이스에만 만든다.
// postgres 데이터베이스는 pg_net·pg_cron 작업자가 붙어 있어 복제 원본으로 쓸 수 없으므로,
// auth 스키마 정의만 덤프해 원본 데이터베이스에 먼저 적용한다. 마이그레이션이 auth.users 외래 키와 auth.uid()를 쓴다.
// 소유자 지정에 필요한 권한은 supabase_admin에만 있어 컨테이너 안의 psql로 적용한다.
// 이미지의 auth.users는 인증 서버 마이그레이션 이전 형태라, 호스팅 환경에서 그 마이그레이션이 더하는 열 중
// 마이그레이션이 참조하는 것(is_anonymous, 관리자 명부 뷰)을 호스팅 환경과 같은 정의로 더한다.
const AUTH_USERS_SUPPLEMENT = 'alter table auth.users add column if not exists is_anonymous boolean not null default false';
// 테스트가 사용자 행을 직접 만들 수 있게 auth.users 쓰기를 postgres에 허용한다(테스트 전용).
const AUTH_USERS_TEST_GRANT = 'grant select, insert, update, delete on auth.users to postgres';
// public 스키마 권한과 기본 권한은 데이터베이스마다 따로라 새 데이터베이스에는 없다.
// 이미지가 postgres 데이터베이스에 두는 것과 같게 맞춘다. 마이그레이션이 만드는 표를 service_role 등이 쓰게 된다.
const API_ROLES = 'postgres, anon, authenticated, service_role';
const PUBLIC_SCHEMA_GRANTS = [
  `grant usage on schema public to ${API_ROLES}`,
  ...['postgres', 'supabase_admin'].flatMap(owner => [
    `alter default privileges for role ${owner} in schema public grant all on tables to ${API_ROLES}`,
    `alter default privileges for role ${owner} in schema public grant all on sequences to ${API_ROLES}`,
    `alter default privileges for role ${owner} in schema public grant execute on functions to ${API_ROLES}`,
  ]),
].join('; ');

async function copyAuthSchema(container: StartedTestContainer, database: string): Promise<void> {
  const { stderr, exitCode } = await container.exec(['sh', '-c',
    `pg_dump -U supabase_admin --schema-only -n auth postgres | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`
    + ` && psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q -c "${AUTH_USERS_SUPPLEMENT}"`
    + ` && psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q -c "${AUTH_USERS_TEST_GRANT}"`
    + ` && psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q -c "${PUBLIC_SCHEMA_GRANTS}"`]);
  if (exitCode !== 0) throw new Error(`auth 스키마 복사에 실패했습니다: ${stderr}`);
}

async function buildTemplate(container: StartedTestContainer, adminUrl: string): Promise<void> {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`create database "${TEMPLATE_DATABASE}"`);
  } finally {
    await admin.end();
  }
  await copyAuthSchema(container, TEMPLATE_DATABASE);
  const url = new URL(adminUrl);
  url.pathname = `/${TEMPLATE_DATABASE}`;
  const template = new Client({ connectionString: url.toString() });
  await template.connect();
  try {
    await applySqlMigrations(template);
  } finally {
    await template.end();
  }
}

// PostgREST가 접속하는 authenticator 역할에 암호를 준다. 이 역할은 anon·authenticated·service_role로 전환할 수 있다.
async function enableAuthenticator(container: StartedTestContainer): Promise<void> {
  const { stderr, exitCode } = await container.exec(['psql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q',
    '-c', `alter role authenticator with password '${AUTHENTICATOR_PASSWORD}'`]);
  if (exitCode !== 0) throw new Error(`authenticator 암호 설정에 실패했습니다: ${stderr}`);
}

export default async function setup(project: TestProject) {
  const network = await new Network().start();
  const container: StartedTestContainer = await new GenericContainer(DB_TEST_IMAGE)
    .withNetwork(network)
    .withNetworkAliases(DB_NETWORK_ALIAS)
    .withEnvironment({ POSTGRES_PASSWORD: PASSWORD })
    .withExposedPorts(5432)
    // 이미지 자체 상태 검사는 시작 유예 없이 약 20초 안에 준비되지 않으면 실패로 판정한다.
    // 포트 개방만 기다리고 초기화 완료는 waitForDatabase가 역할 생성으로 판정한다.
    .withWaitStrategy(Wait.forListeningPorts())
    .withStartupTimeout(120_000)
    .start();

  const adminUrl = `postgresql://postgres:${PASSWORD}@${container.getHost()}:${container.getMappedPort(5432)}/postgres`;
  await waitForDatabase(adminUrl);
  await buildTemplate(container, adminUrl);
  await enableAuthenticator(container);
  project.provide('dbAdminUrl', adminUrl);
  project.provide('dbNetwork', network.getName());

  return async () => {
    await container.stop();
    await network.stop();
  };
}
