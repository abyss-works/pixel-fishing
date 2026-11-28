// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  validateArgocdStatus,
  validateDeploymentParity,
  validateSmokeResponses,
} from './verify-stage.mjs';

function makeDeploy(name: string, replicas: number, readyReplicas: number, image: string) {
  return {
    metadata: { name },
    spec: {
      replicas,
      template: {
        spec: {
          containers: [{ name, image }],
        },
      },
    },
    status: { readyReplicas },
  };
}

describe('validateArgocdStatus', () => {
  it('passes when Synced and Healthy', () => {
    const result = validateArgocdStatus({
      status: { sync: { status: 'Synced' }, health: { status: 'Healthy' } },
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('fails when OutOfSync or Degraded', () => {
    const outOfSync = validateArgocdStatus({
      status: { sync: { status: 'OutOfSync' }, health: { status: 'Healthy' } },
    });
    expect(outOfSync.ok).toBe(false);
    expect(outOfSync.errors.length).toBeGreaterThan(0);

    const degraded = validateArgocdStatus({
      status: { sync: { status: 'Synced' }, health: { status: 'Degraded' } },
    });
    expect(degraded.ok).toBe(false);
    expect(degraded.errors.length).toBeGreaterThan(0);
  });

  it('fails when status fields are missing', () => {
    const missing = validateArgocdStatus({});
    expect(missing.ok).toBe(false);
    expect(missing.errors.length).toBeGreaterThan(0);
  });
});

describe('validateDeploymentParity', () => {
  it('passes when all three deployments are ready with identical dev-<sha> tag', () => {
    const result = validateDeploymentParity({
      items: [
        makeDeploy('pixel-fishing', 1, 1, 'ghcr.io/abyss-works/pixel-fishing:dev-2416417'),
        makeDeploy('pixel-fishing-realtime', 2, 2, 'ghcr.io/abyss-works/pixel-fishing:dev-2416417'),
        makeDeploy('pixel-fishing-admin', 1, 1, 'ghcr.io/abyss-works/pixel-fishing-admin:dev-2416417'),
        makeDeploy('pixel-fishing-valkey', 1, 1, 'valkey/valkey:8-alpine'),
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.tag).toBe('dev-2416417');
    expect(result.errors).toEqual([]);
  });

  it('fails when image tags mismatch across deployments', () => {
    const result = validateDeploymentParity({
      items: [
        makeDeploy('pixel-fishing', 1, 1, 'ghcr.io/abyss-works/pixel-fishing:dev-2416417'),
        makeDeploy('pixel-fishing-realtime', 2, 2, 'ghcr.io/abyss-works/pixel-fishing:dev-2416417'),
        makeDeploy('pixel-fishing-admin', 1, 1, 'ghcr.io/abyss-works/pixel-fishing-admin:dev-abcdef1'),
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e: string) => e.includes('mismatch'))).toBe(true);
  });

  it('fails when readyReplicas does not match replicas or deployment is missing', () => {
    const unready = validateDeploymentParity({
      items: [
        makeDeploy('pixel-fishing', 1, 0, 'ghcr.io/abyss-works/pixel-fishing:dev-2416417'),
        makeDeploy('pixel-fishing-realtime', 2, 2, 'ghcr.io/abyss-works/pixel-fishing:dev-2416417'),
        makeDeploy('pixel-fishing-admin', 1, 1, 'ghcr.io/abyss-works/pixel-fishing-admin:dev-2416417'),
      ],
    });
    expect(unready.ok).toBe(false);
    expect(unready.errors.some((e: string) => e.includes('readyReplicas'))).toBe(true);

    const missing = validateDeploymentParity({
      items: [
        makeDeploy('pixel-fishing', 1, 1, 'ghcr.io/abyss-works/pixel-fishing:dev-2416417'),
        makeDeploy('pixel-fishing-admin', 1, 1, 'ghcr.io/abyss-works/pixel-fishing-admin:dev-2416417'),
      ],
    });
    expect(missing.ok).toBe(false);
    expect(missing.errors.some((e: string) => e.includes('pixel-fishing-realtime'))).toBe(true);
  });

  it('fails when image tag is not dev-<sha>', () => {
    const result = validateDeploymentParity({
      items: [
        makeDeploy('pixel-fishing', 1, 1, 'ghcr.io/abyss-works/pixel-fishing:v0.21.0'),
        makeDeploy('pixel-fishing-realtime', 2, 2, 'ghcr.io/abyss-works/pixel-fishing:v0.21.0'),
        makeDeploy('pixel-fishing-admin', 1, 1, 'ghcr.io/abyss-works/pixel-fishing-admin:v0.21.0'),
      ],
    });
    expect(result.ok).toBe(false);
  });
});

describe('validateSmokeResponses', () => {
  it('passes for valid staging smoke responses', () => {
    expect(
      validateSmokeResponses({
        home: { status: 401, csp: "default-src 'self'" },
        action: { status: 204 },
        liveWs: { status: 401 },
      }),
    ).toEqual({ ok: true, errors: [] });

    expect(
      validateSmokeResponses({
        home: { status: 200, csp: "default-src 'self'" },
        action: { status: 405 },
        liveWs: { status: 401 },
      }),
    ).toEqual({ ok: true, errors: [] });
  });

  it('fails on 503/502/404 or missing CSP header', () => {
    const badHome = validateSmokeResponses({
      home: { status: 503, csp: null },
      action: { status: 204 },
      liveWs: { status: 401 },
    });
    expect(badHome.ok).toBe(false);
    expect(badHome.errors.length).toBeGreaterThanOrEqual(2);

    const badAction = validateSmokeResponses({
      home: { status: 401, csp: "default-src 'self'" },
      action: { status: 503 },
      liveWs: { status: 401 },
    });
    expect(badAction.ok).toBe(false);

    const badWs = validateSmokeResponses({
      home: { status: 401, csp: "default-src 'self'" },
      action: { status: 405 },
      liveWs: { status: 502 },
    });
    expect(badWs.ok).toBe(false);
  });
});
