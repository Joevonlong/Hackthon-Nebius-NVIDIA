import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

// Static checks of the deploy scripts (#35). Nothing here runs docker or a cloud CLI.
const read = (f: string) => readFileSync(new URL(`../../scripts/${f}`, import.meta.url), 'utf8')

describe('deploy scripts', () => {
  for (const f of ['deploy.sh', 'docker-local.sh']) {
    it(`${f} is valid bash`, () => {
      expect(spawnSync('bash', ['-n', new URL(`../../scripts/${f}`, import.meta.url).pathname]).status).toBe(0)
    })
    it(`${f} never puts a key or the token on a command line`, () => {
      const code = read(f).split('\n').filter(l => !l.trim().startsWith('#')).join('\n')
      expect(code).not.toMatch(/--env\s+["']?\$?\{?[A-Za-z_]*(KEY|TOKEN)/) // --env KEY=value
      expect(code).not.toMatch(/\s-e\s+["']?[A-Z_]*(KEY|TOKEN)[A-Z_]*=/) // docker -e KEY=value
      expect(code).not.toMatch(/--env\s+"\$\{key\}=/)
    })
  }
  it('docker-local.sh publishes on loopback only and uses --env-file', () => {
    const code = read('docker-local.sh')
    expect(code).toMatch(/-p "127\.0\.0\.1:\$\{PORT\}:3000"/)
    expect(code).not.toMatch(/-p "\$\{HOST_PORT/)
    expect(code).toContain('--env-file')
  })
  it('deploy.sh passes secrets with --env-file', () => {
    expect(read('deploy.sh')).toMatch(/ENV_ARGS=\(--env-file "\$SECRETS"\)/)
  })
})
