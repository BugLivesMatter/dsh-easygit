/** Shared helpers for EasyGit tests: real temporary git repositories. */
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Run git with literal arguments and return stdout. */
export function git(cwd, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile('git', args, {
      cwd,
      timeout: options.timeout ?? 20000,
      windowsHide: true,
      encoding: 'utf8',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' },
    }, (error, stdout, stderr) => {
      if (error !== null) {
        reject(new Error(`git ${args.join(' ')} failed: ${stderr || error.message}`))
        return
      }
      resolve(stdout)
    })
  })
}

/** Create one throwaway directory. */
export async function tempDir(prefix = 'easygit-test-') {
  return (await mkdtemp(join(tmpdir(), prefix))).replace(/\\/g, '/')
}

/** Remove a directory tree, ignoring failures on locked Windows files. */
export async function cleanup(path) {
  await rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => undefined)
}

/** Create a repository with one initial commit. */
export async function makeRepo(options = {}) {
  const dir = await tempDir()
  await git(dir, ['init', '-b', 'main'])
  await git(dir, ['config', 'user.email', 'easygit@example.com'])
  await git(dir, ['config', 'user.name', 'EasyGit Test'])
  await git(dir, ['config', 'commit.gpgsign', 'false'])
  await writeFile(join(dir, 'a.txt'), 'first\n', 'utf8')
  if (options.trackEnv === true) await writeFile(join(dir, '.env'), 'SECRET=first\n', 'utf8')
  await git(dir, ['add', '-A'])
  await git(dir, ['commit', '-m', 'initial'])
  return dir
}

/** Create a bare repository usable as a push remote. */
export async function makeBareRemote() {
  const dir = await tempDir('easygit-remote-')
  await git(dir, ['init', '--bare', '-b', 'main'])
  return dir
}

/** Tracked changes summary used by assertions. */
export async function headFiles(dir) {
  const output = await git(dir, ['show', '--name-only', '--format=', 'HEAD'])
  return output.split('\n').map(line => line.trim()).filter(Boolean).sort()
}

/** Current branch of a repository. */
export async function currentBranch(dir) {
  return (await git(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
}

/** Ensure a directory exists. */
export async function ensureDir(path) {
  await mkdir(path, { recursive: true })
  return path
}
