#!/usr/bin/env node

/**
 * Build and pack the CLI tarball.
 *
 * Usage:
 *   node scripts/package.mjs [--snapshot]
 *
 * --snapshot  Append the short git commit hash to the version (e.g. 0.8.0-sha.abc1234)
 *             so pre-release tarballs are traceable to a specific commit.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const snapshot = process.argv.includes('--snapshot');

function getCommitHash() {
  try {
    return execSync('git rev-parse --short=7 HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    throw new Error('Failed to get git commit hash. Is this a git repository?');
  }
}

function setVersion(version) {
  const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
  pkg.version = version;
  writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');

  const lock = JSON.parse(readFileSync('package-lock.json', 'utf-8'));
  lock.version = version;
  if (lock.packages?.['']) lock.packages[''].version = version;
  writeFileSync('package-lock.json', JSON.stringify(lock, null, 2) + '\n');
}

let origPkg;
let origLock;

if (snapshot) {
  origPkg = readFileSync('package.json', 'utf-8');
  origLock = readFileSync('package-lock.json', 'utf-8');
}

try {
  if (snapshot) {
    const hash = getCommitHash();
    const { version } = JSON.parse(origPkg);
    const snapshotVersion = `${version}-sha.${hash}`;
    console.log(`Snapshot version: ${snapshotVersion}`);
    setVersion(snapshotVersion);
  }

  execSync('npm run build', { stdio: 'inherit' });
  execSync('npm pack', { stdio: 'inherit' });
} finally {
  if (snapshot) {
    writeFileSync('package.json', origPkg);
    writeFileSync('package-lock.json', origLock);
  }
}
