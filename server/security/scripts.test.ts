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
  it('deploy.sh takes its token from a deploy-only source, not from .env.local', () => {
    const code = read('deploy.sh')
    expect(code).toContain('PAPERTRAIL_DEPLOY_TOKEN')
    expect(code).toContain('.env.deploy.local')
    expect(code).not.toMatch(/envval PAPERTRAIL_ACCESS_TOKEN/)
  })
  it('deploy.sh does not require PUBLIC_ORIGIN and checks an authenticated /api call, with the token on stdin', () => {
    const code = read('deploy.sh')
    expect(code).not.toMatch(/die "PUBLIC_ORIGIN is required/)
    expect(code).toMatch(/auth_post_status\(\)/)
    expect(code).toMatch(/== 400/)
    expect(code).toMatch(/\^\[A-Za-z0-9\._~-\]\+\$/)
    expect(code).toMatch(/curl[^\n]* -K -/)
    expect(code).not.toMatch(/curl[^\n]*Authorization/)
    expect(code).toMatch(/Tear down/)
  })
  it('docker-local.sh prints the token URL only when it creates the token', () => {
    const code = read('docker-local.sh')
    expect(code.match(/\?token=\$\(cat/g)).toHaveLength(1)
    expect(code).toMatch(/NEW_TOKEN==1|NEW_TOKEN == 1/)
  })
  it('deploy.sh passes secrets with --env-file', () => {
    expect(read('deploy.sh')).toMatch(/ENV_ARGS=\(--env-file "\$SECRETS"\)/)
  })
})
