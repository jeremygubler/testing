/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `npm install` run against an existing node_modules prunes the platform
 * binaries of *other* operating systems out of the lockfile — so a lockfile
 * written on Linux makes `npm ci` fail on Windows with "Missing: … from lock
 * file". CI only ever runs on Linux and cannot notice, hence this test.
 *
 * Repair: delete node_modules, then `npm install --package-lock-only` in a
 * directory that has none (a copy of package.json alone is enough).
 */

type Lock = {
  packages: Record<string, { optionalDependencies?: Record<string, string> }>;
};

const lock: Lock = JSON.parse(
  readFileSync(join(__dirname, '..', 'package-lock.json'), 'utf8'),
) as Lock;

const entries = Object.keys(lock.packages);

/** The lockfile may satisfy a dependency at any level, not just the root. */
function isResolved(name: string): boolean {
  const suffix = `node_modules/${name}`;
  return entries.some((key) => key === suffix || key.endsWith(`/${suffix}`));
}

describe('package-lock.json', () => {
  it('resolves every optional dependency it names', () => {
    const missing = new Set<string>();
    for (const entry of Object.values(lock.packages)) {
      for (const name of Object.keys(entry.optionalDependencies ?? {})) {
        if (!isResolved(name)) missing.add(name);
      }
    }
    expect([...missing].sort()).toEqual([]);
  });

  it('carries binaries for Windows and macOS, not just this machine', () => {
    for (const platform of ['win32', 'darwin']) {
      expect(entries.filter((key) => key.includes(platform)).length).toBeGreaterThan(0);
    }
  });
});
