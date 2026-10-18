// Records the README hero clip from the real app in demo mode (?demo=1).
// Usage: start a server (e.g. PORT=3071 node dist/server/index.js), then BASE=http://localhost:3071 OUT=./hero-cap node scripts/capture-readme-hero.mjs
// Needs the playwright package (PW_DIR = a node_modules dir that has it). GIF: ffmpeg -ss <loaded> -i <webm> -vf "setpts=PTS/2,fps=12,scale=1200:-1,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=none" docs/media/hero.gif
import { createRequire } from 'node:module'
const require = createRequire(process.env.PW_DIR ?? (process.env.HOME + '/.claude/skills/gstack/node_modules/'))
const { chromium } = require('playwright')
const BASE = process.env.BASE ?? 'http://localhost:3071'
const OUT = process.env.OUT ?? 'hero-cap'
const Q = 'Which single-cell methods help study melanoma immune cells?'
let t0 = Date.now(); const mark = (s) => console.log(((Date.now() - t0) / 1000).toFixed(1), s)

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, recordVideo: { dir: OUT + '/video', size: { width: 1440, height: 900 } } })
const p = await ctx.newPage()
t0 = Date.now()
await p.goto(BASE + '/?demo=1'); await p.waitForTimeout(1500)
mark('loaded')
await p.getByRole('button', { name: 'Collapse the chat' }).click()
await p.waitForTimeout(400)
await p.getByRole('button', { name: 'New question' }).click()
await p.locator('#qs-text').pressSequentially(Q, { delay: 12 })
await p.waitForTimeout(300)
await p.getByRole('button', { name: 'Create question' }).click()
await p.waitForTimeout(800)
mark('created')
await p.screenshot({ path: OUT + '/s1.png' })
await p.getByRole('button', { name: /Build library/ }).first().click()
mark('build clicked')
await p.waitForTimeout(3500)
await p.getByRole('radio', { name: 'Tiles' }).waitFor({ timeout: 20000 })
mark('results visible')
await p.waitForTimeout(800)
await p.mouse.move(420, 600)
for (let i = 0; i < 10; i++) { await p.mouse.wheel(0, 60); await p.waitForTimeout(60) }
await p.mouse.move(1300, 880)
await p.getByText('Replay of a recorded real run').first().waitFor()
await p.waitForTimeout(2500)
mark('tiles shown')
await p.screenshot({ path: OUT + '/s2.png' })
await p.getByRole('button', { name: 'Graph' }).first().click()
mark('graph')
await p.waitForTimeout(4000)
await p.screenshot({ path: OUT + '/s3.png' })
mark('end')
await ctx.close(); await b.close()
