import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const TMPDIR_FILE = join(__dirname, '.tmp-dir');

export default function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'agentcore-integ-'));
  process.env.AGENTCORE_TEST_TMPDIR = dir;
  writeFileSync(TMPDIR_FILE, dir);

  return () => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(TMPDIR_FILE, { force: true });
  };
}
