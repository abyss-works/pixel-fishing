import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const DEFAULT_STAGE_URL = 'https://pixel-fishing-preview.abyssworks.dev';
const REQUIRED_DEPLOYMENTS = ['pixel-fishing', 'pixel-fishing-realtime', 'pixel-fishing-admin'];
const DEV_TAG_RE = /^dev-[0-9a-f]{7,}$/;

/** Validates ArgoCD Application sync and health state. */
export function validateArgocdStatus(appJson) {
  const errors = [];
  const syncStatus = appJson?.status?.sync?.status;
  const healthStatus = appJson?.status?.health?.status;

  if (syncStatus !== 'Synced') {
    errors.push(`ArgoCD sync status is ${syncStatus ?? 'missing'} (expected Synced)`);
  }
  if (healthStatus !== 'Healthy') {
    errors.push(`ArgoCD health status is ${healthStatus ?? 'missing'} (expected Healthy)`);
  }

  return { ok: errors.length === 0, errors };
}

function extractImageTag(image) {
  if (typeof image !== 'string') return null;
  const lastSlash = image.lastIndexOf('/');
  const lastColon = image.lastIndexOf(':');
  if (lastColon <= lastSlash) return null;
  return image.slice(lastColon + 1);
}

/** Validates that required staging deployments are ready and share an identical dev-<sha> tag. */
export function validateDeploymentParity(deployListJson) {
  const errors = [];
  const items = Array.isArray(deployListJson?.items) ? deployListJson.items : [];
  const byName = new Map();
  for (const item of items) {
    const name = item?.metadata?.name;
    if (typeof name === 'string') byName.set(name, item);
  }

  const observedTags = new Set();

  for (const name of REQUIRED_DEPLOYMENTS) {
    const deploy = byName.get(name);
    if (!deploy) {
      errors.push(`Deployment ${name} is missing`);
      continue;
    }

    const replicas = deploy?.spec?.replicas;
    const readyReplicas = deploy?.status?.readyReplicas ?? 0;
    if (typeof replicas !== 'number' || replicas <= 0 || readyReplicas !== replicas) {
      errors.push(
        `Deployment ${name} readyReplicas=${readyReplicas} does not match replicas=${String(replicas)}`,
      );
    }

    const image = deploy?.spec?.template?.spec?.containers?.[0]?.image;
    const tag = extractImageTag(image);
    if (!tag || !DEV_TAG_RE.test(tag)) {
      errors.push(`Deployment ${name} has invalid dev image tag: ${String(image)}`);
    } else {
      observedTags.add(tag);
    }
  }

  if (observedTags.size > 1) {
    errors.push(`Deployment image tag mismatch: ${Array.from(observedTags).join(', ')}`);
  }

  const tag = observedTags.size === 1 ? Array.from(observedTags)[0] : null;
  return { ok: errors.length === 0, tag, errors };
}

/** Classifies an error-path HTTP status code (notFound or staleAction). */
export function classifyErrorPathStatus(kind, status) {
  const isServerError = typeof status === 'number' && status >= 500 && status < 600;
  if (kind === 'notFound') {
    if (status === 404 || status === 401) return { ok: true, error: null };
    if (isServerError) {
      return { ok: false, error: `GET /__smoke-not-found returned 5xx (${status})` };
    }
    return { ok: false, error: `GET /__smoke-not-found returned ${String(status)} (expected 404 or 401)` };
  }
  if (kind === 'staleAction') {
    if (status === 426 || status === 401) return { ok: true, error: null };
    if (isServerError) {
      return { ok: false, error: `POST /api/action (stale build) returned 5xx (${status})` };
    }
    return {
      ok: false,
      error: `POST /api/action (stale build) returned ${String(status)} (expected 426 or 401)`,
    };
  }
  return { ok: false, error: `Unknown error-path kind: ${String(kind)}` };
}

/** Validates HTTP and WebSocket smoke responses from the staging gateway. */
export function validateSmokeResponses(results) {
  const errors = [];

  const homeStatus = results?.home?.status;
  if (homeStatus !== 200 && homeStatus !== 401) {
    errors.push(`GET / returned ${String(homeStatus)} (expected 200 or 401)`);
  }
  const csp = results?.home?.csp;
  if (typeof csp !== 'string' || csp.trim().length === 0) {
    errors.push('GET / is missing content-security-policy header');
  }

  const actionStatus = results?.action?.status;
  if (actionStatus !== 204 && actionStatus !== 405) {
    errors.push(`GET /api/action returned ${String(actionStatus)} (expected 204 or 405)`);
  }

  const liveStatus = results?.liveWs?.status;
  if (liveStatus !== 401) {
    errors.push(`WS /api/live returned ${String(liveStatus)} (expected 401)`);
  }

  if (results?.notFound !== undefined) {
    const notFoundResult = classifyErrorPathStatus('notFound', results.notFound?.status);
    if (!notFoundResult.ok && notFoundResult.error) errors.push(notFoundResult.error);
  }

  if (results?.staleAction !== undefined) {
    const staleActionResult = classifyErrorPathStatus('staleAction', results.staleAction?.status);
    if (!staleActionResult.ok && staleActionResult.error) errors.push(staleActionResult.error);
  }

  return { ok: errors.length === 0, errors };
}

/** Extracts the module entry script path from an HTML document. */
export function extractModuleScriptPath(html) {
  if (typeof html !== 'string') return null;
  const scriptTagRe = /<script\b([^>]*)>/gi;
  for (const match of html.matchAll(scriptTagRe)) {
    const attrs = match[1] ?? '';
    if (!/\btype\s*=\s*["']module["']/i.test(attrs)) continue;
    const srcMatch = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs);
    if (srcMatch?.[1]) return srcMatch[1];
  }
  return null;
}

/** Extracts the embedded build identifier from a compiled client bundle. */
export function extractBuildIdFromBundle(scriptText) {
  if (typeof scriptText !== 'string') return null;
  const match = /["']x-build-id["']\s*:\s*["']([^"']+)["']/.exec(scriptText);
  return match?.[1] ?? null;
}

/** Validates authenticated WS /api/live handshake and build-mismatch rejection. */
export function validateAuthenticatedLiveHandshake(results) {
  const errors = [];

  if (results?.homeStatus !== 200) {
    errors.push(`Authenticated GET / returned ${String(results?.homeStatus)} (expected 200)`);
  }
  if (!results?.buildId) {
    errors.push('Could not determine current build id for authenticated WS /api/live smoke');
  }
  if (!results?.version) {
    errors.push('Could not determine current app version for authenticated WS /api/live smoke');
  }

  if (results?.buildId && results?.version) {
    const matched = results?.matched;
    if (matched?.closeCode === 4001) {
      errors.push('Authenticated WS /api/live with matching build closed with 4001');
    } else if (!matched?.opened) {
      const detail = matched?.error ? `: ${matched.error}` : '';
      errors.push(`Authenticated WS /api/live with matching build failed to open${detail}`);
    }

    const mismatched = results?.mismatched;
    if (mismatched?.closeCode !== 4001) {
      const detail = mismatched?.error ? ` (${mismatched.error})` : '';
      errors.push(
        `Authenticated WS /api/live with mismatched build closed with ${String(mismatched?.closeCode ?? 'none')} (expected 4001)${detail}`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}

function probeWebSocketUpgrade(targetUrl) {
  const url = new URL('/api/live', targetUrl);
  const client = url.protocol === 'https:' ? https : http;

  return new Promise((resolvePromise, rejectPromise) => {
    const req = client.request(
      url,
      {
        method: 'GET',
        timeout: 10_000,
        headers: {
          Origin: url.origin,
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Version': '13',
          'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
        },
      },
      (res) => {
        res.resume();
        resolvePromise({ status: res.statusCode ?? 0 });
      },
    );

    req.on('upgrade', (res, socket) => {
      socket.destroy();
      resolvePromise({ status: res.statusCode ?? 101 });
    });

    req.on('timeout', () => {
      req.destroy(new Error('WS /api/live probe timed out'));
    });

    req.on('error', rejectPromise);
    req.end();
  });
}

async function runSmokeChecks(baseUrl) {
  const homeRes = await fetch(new URL('/', baseUrl), {
    headers: { Accept: 'text/html' },
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });
  const actionRes = await fetch(new URL('/api/action', baseUrl), {
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });
  const notFoundRes = await fetch(new URL('/__smoke-not-found', baseUrl), {
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });
  const staleActionRes = await fetch(new URL('/api/action', baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-build-id': 'smoke-mismatch',
    },
    body: '{}',
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });
  const liveWs = await probeWebSocketUpgrade(baseUrl);

  return {
    home: {
      status: homeRes.status,
      csp: homeRes.headers.get('content-security-policy'),
    },
    action: {
      status: actionRes.status,
    },
    notFound: {
      status: notFoundRes.status,
    },
    staleAction: {
      status: staleActionRes.status,
    },
    liveWs,
  };
}

function readLocalAppVersion() {
  try {
    const pkgPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return typeof pkg?.version === 'string' && pkg.version.trim().length > 0 ? pkg.version.trim() : null;
  } catch {
    return null;
  }
}

function probeAuthenticatedWebSocket(baseUrl, { buildId, version, cookie, holdMs = 500 }) {
  const wsUrl = new URL('/api/live', baseUrl);
  wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  wsUrl.searchParams.set('build', buildId);
  wsUrl.searchParams.set('version', version);

  return new Promise((resolvePromise) => {
    let settled = false;
    let opened = false;
    let closeCode = null;
    let error = null;
    let holdTimer = null;

    const ws = new WebSocket(wsUrl, {
      headers: {
        Cookie: cookie,
        Origin: wsUrl.origin,
      },
      handshakeTimeout: 10_000,
    });

    const finish = () => {
      if (settled) return;
      settled = true;
      if (holdTimer) clearTimeout(holdTimer);
      clearTimeout(overallTimer);
      resolvePromise({ opened, closeCode, error });
    };

    const overallTimer = setTimeout(() => {
      error = error ?? 'WS /api/live handshake timed out';
      ws.terminate();
      finish();
    }, 10_000);

    ws.on('open', () => {
      opened = true;
      holdTimer = setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close(1000, 'smoke-ok');
        }
      }, holdMs);
    });

    ws.on('message', () => {
      opened = true;
    });

    ws.on('close', (code) => {
      closeCode = code;
      finish();
    });

    ws.on('unexpected-response', (_req, res) => {
      res.resume();
      error = `unexpected server response: ${String(res.statusCode ?? 0)}`;
      finish();
    });

    ws.on('error', (err) => {
      error = err instanceof Error ? err.message : String(err);
      finish();
    });
  });
}

async function runAuthenticatedLiveChecks(baseUrl, cookie) {
  const homeRes = await fetch(new URL('/', baseUrl), {
    headers: {
      Accept: 'text/html',
      Cookie: cookie,
    },
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });
  const homeHtml = homeRes.status === 200 ? await homeRes.text() : '';

  const staleActionRes = await fetch(new URL('/api/action', baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-build-id': 'smoke-mismatch',
      Cookie: cookie,
    },
    body: '{}',
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });

  let serverVersion = null;
  if (staleActionRes.status === 426) {
    try {
      const body = await staleActionRes.json();
      if (typeof body?.server === 'string' && body.server.trim().length > 0) {
        serverVersion = body.server.trim();
      }
    } catch {
      // Ignore malformed JSON and fall back to package.json version.
    }
  }
  const version = serverVersion ?? readLocalAppVersion();

  let buildId = process.env.STAGE_BUILD_ID?.trim() || null;
  if (!buildId && homeHtml) {
    const scriptPath = extractModuleScriptPath(homeHtml);
    if (scriptPath) {
      const scriptRes = await fetch(new URL(scriptPath, baseUrl), {
        headers: { Cookie: cookie },
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      });
      if (scriptRes.ok) {
        buildId = extractBuildIdFromBundle(await scriptRes.text());
      }
    }
  }

  let matched = { opened: false, closeCode: null, error: 'skipped' };
  let mismatched = { opened: false, closeCode: null, error: 'skipped' };

  if (homeRes.status === 200 && buildId && version) {
    matched = await probeAuthenticatedWebSocket(baseUrl, { buildId, version, cookie });
    mismatched = await probeAuthenticatedWebSocket(baseUrl, {
      buildId: 'smoke-mismatch',
      version,
      cookie,
      holdMs: 1_500,
    });
  }

  return {
    homeStatus: homeRes.status,
    buildId,
    version,
    matched,
    mismatched,
  };
}

function runK8sChecks() {
  const appRaw = execFileSync('kubectl', ['-n', 'argocd', 'get', 'app', 'pixel-fishing-stage', '-o', 'json'], {
    encoding: 'utf8',
    timeout: 15_000,
  });
  const argocdResult = validateArgocdStatus(JSON.parse(appRaw));

  const deployRaw = execFileSync('kubectl', ['-n', 'pixel-fishing-stage', 'get', 'deploy', '-o', 'json'], {
    encoding: 'utf8',
    timeout: 15_000,
  });
  const deployResult = validateDeploymentParity(JSON.parse(deployRaw));

  return { argocdResult, deployResult };
}

function parseArgs(argv) {
  let url = DEFAULT_STAGE_URL;
  let checkK8s = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--check-k8s') {
      checkK8s = true;
    } else if (arg === '--url' && i + 1 < argv.length) {
      url = argv[++i];
    } else if (arg.startsWith('--url=')) {
      url = arg.slice('--url='.length);
    }
  }

  return { url, checkK8s };
}

async function main() {
  const { url, checkK8s } = parseArgs(process.argv.slice(2));
  const failures = [];

  if (checkK8s) {
    const { argocdResult, deployResult } = runK8sChecks();
    if (!argocdResult.ok) failures.push(...argocdResult.errors);
    if (!deployResult.ok) failures.push(...deployResult.errors);
    if (argocdResult.ok && deployResult.ok) {
      console.log(`K8s OK: ArgoCD Synced/Healthy, deployments ready (${deployResult.tag})`);
    }
  }

  const smokeRaw = await runSmokeChecks(url);
  const smokeResult = validateSmokeResponses(smokeRaw);
  if (!smokeResult.ok) {
    failures.push(...smokeResult.errors);
  } else {
    console.log(
      `Smoke OK (${url}): GET / -> ${smokeRaw.home.status}, GET /api/action -> ${smokeRaw.action.status}, GET /__smoke-not-found -> ${smokeRaw.notFound.status}, POST /api/action (stale) -> ${smokeRaw.staleAction.status}, WS /api/live -> ${smokeRaw.liveWs.status}`,
    );
  }

  const stageCookie = process.env.STAGE_COOKIE?.trim() || '';
  if (stageCookie) {
    const authRaw = await runAuthenticatedLiveChecks(url, stageCookie);
    const authResult = validateAuthenticatedLiveHandshake(authRaw);
    if (!authResult.ok) {
      failures.push(...authResult.errors);
    } else {
      console.log(
        `Auth WS OK (${url}): GET / -> ${authRaw.homeStatus}, build=${authRaw.buildId}, version=${authRaw.version}, matched=open, mismatch=4001`,
      );
    }
  }

  if (failures.length > 0) {
    for (const msg of failures) console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await main();
}
