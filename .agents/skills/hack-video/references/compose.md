# Compose

Read this when turning clips and the storyboard into the video, and before the render checks. Commands were checked on 2026-10-17 against HyperFrames CLI 0.8.166, the Remotion docs, Playwright 1.58 `--help`, and ffmpeg 9.0.1.

## Pick the path

| Check | Path | Why |
|---|---|---|
| The `hyperframes` skill is installed and `npx hyperframes doctor --json` shows `"ok": true` | HyperFrames | HTML and CSS take DESIGN.md tokens directly; deterministic renders; caption, zoom, and effect tooling |
| The `remotion-best-practices` skill is installed, or the team already uses Remotion | Remotion | React components; strong when the team knows it |
| `ffmpeg -version` answers | ffmpeg with image cards | Always finishes; plain cuts, hard zooms, burned captions |

Every path works in `hack/demo/video/project/` (its own `package.json`), reads `hack/demo/video/clips/`, and writes `hack/demo/video/renders/`. Keep `project/` out of the app's TypeScript, lint, and build; if the root configs do not exclude `hack/demo/video/`, add the exclusion in a small chore branch announced to the captain.

## HyperFrames

1. Load the `hyperframes` skill and follow it from its entry point. It starts with `npx hyperframes usage --json`; report the reading, and read it again before the final render.
2. Answer its intent questions from the hack docs instead of asking the human again: message = PITCH.md one-liner · audience = hackathon judges · destination = the event's video platform, 16:9, 1920×1080 · length = storyboard target · language = `submission_language` · storyboard = `hack/demo/STORYBOARD.md` (already reviewed) · design spec = `hack/DESIGN.md` · assets = the clips, the QR image, the logo.
3. Its workflow scaffolds with `hyperframes init`, which refuses a non-empty folder: point it at `hack/demo/video/project/` while that folder does not exist yet.
4. Build per the storyboard: one caption track, the clips with punch-ins (the skill routes zooms to `hyperframes-keyframes`), cards, the architecture animation, the outro with URL and QR. Search before hand-building a named effect: `npx hyperframes catalog --query "<effect in plain English>"`.
5. Gate and render: `npx hyperframes check hack/demo/video/project`, then `npx hyperframes render hack/demo/video/project --quality draft --video-frame-format png --output hack/demo/video/renders/draft.mp4`. The final uses `--quality delivery`. `png` frame extraction keeps UI recordings sharp.
6. The skill stops at a final preview for approval. In the main session or a teammate pane, the storyteller's human approves; a subagent returns the preview URL and the QA findings instead of waiting.

## Remotion

1. Load `remotion-best-practices` and read its rules for videos, captions (display or SRT import), transitions, and fonts.
2. Scaffold outside the repo, because `npx create-video --yes` refuses to run inside a git repository: `npx create-video --yes --blank --no-tailwind <tmp-dir>/video`, then copy it without `node_modules` into `hack/demo/video/project/` and install there.
3. Preview with `npx remotion studio`; render from `project/` with `npx remotion render <entry-point> <composition-id> ../renders/<project>-full.mp4`.
4. Remotion is free for individuals and small teams; larger companies need a company license (remotion.dev/license).

## ffmpeg with image cards

Many ffmpeg builds have no `drawtext` or `subtitles` filter (the Homebrew build checked on 2026-10-17 had neither): `ffmpeg -hide_banner -filters | grep -E ' (drawtext|subtitles) '`. Make text as images instead: `project/cards.html` styled with DESIGN.md fonts and colors, one card per URL hash, screenshotted with the app's Playwright.

```bash
pnpm exec playwright screenshot --viewport-size "1920, 1080" "file://$PWD/hack/demo/video/project/cards.html#title" hack/demo/video/project/cards/title.png
pnpm exec playwright screenshot --viewport-size "1920, 160" "file://$PWD/hack/demo/video/project/cards.html#cap-B2-1" hack/demo/video/project/cards/cap-B2-1.png
npx qrcode -w 600 -o hack/demo/video/project/cards/qr.png "<prod_url>"
```

Caption strips are opaque bands (DESIGN.md surface color), which also read better over busy UI. Then, from `hack/demo/video/`:

```bash
ffmpeg -loop 1 -t 4 -i project/cards/title.png -r 30 -c:v libx264 -crf 18 -pix_fmt yuv420p clips/00-title.mp4
ffmpeg -i clips/B2.mp4 -i project/cards/cap-B2-1.png -filter_complex "[0:v][1:v]overlay=0:H-h-60:enable='between(t,0.5,4.5)'" -c:v libx264 -crf 18 -pix_fmt yuv420p clips/B2-cap.mp4
ffmpeg -i clips/B4.mp4 -vf "crop=iw/1.7:ih/1.7:<x>:<y>,scale=1920:1080:flags=lanczos" -c:v libx264 -crf 18 -pix_fmt yuv420p clips/B4-zoom.mp4
printf "file 'clips/00-title.mp4'\nfile 'clips/B2-cap.mp4'\n" > list.txt
ffmpeg -f concat -safe 0 -i list.txt -c copy renders/silent.mp4
ffmpeg -i renders/silent.mp4 -i vo.wav -c:v copy -c:a aac -b:a 192k -af loudnorm=I=-16:TP=-1.5:LRA=11 -shortest -movflags +faststart renders/<project>-full.mp4
```

Every clip made this way shares codec, size, and frame rate, so the concat copies without re-encoding. With no voice-over, skip the last command's audio input and add `-movflags +faststart` to the concat.

## Voice and captions from audio

- Team voice-over: a phone voice memo in a quiet room, normalized with the `loudnorm` filter above.
- Local TTS: `npx hyperframes tts lines/B1.txt --voice af_heart --output vo/B1.wav` (Kokoro, runs locally, no account).
- Captions from finished audio: `npx hyperframes transcribe vo/full.wav --to srt -o renders/<project>.srt`, then correct names and numbers by hand.
- Music only with a license that covers the use, kept well under the voice; none is fine.

## Teaser, GIF, poster

- Teaser: a second composition in HyperFrames or Remotion, or an ffmpeg concat of the title card, the wow clip, and the close card.
- GIF: `ffmpeg -ss <wow-start> -t 8 -i renders/<project>-full.mp4 -vf "fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" -loop 0 ../media/hero.gif`. Over 8 MB: drop to 10 fps, 800 px, or 6 s. HyperFrames can also render `--format gif`.
- Poster: `ffmpeg -ss <t> -i renders/<project>-full.mp4 -frames:v 1 ../media/poster.png`.

## Checks

```bash
f=renders/<project>-full.mp4
ffprobe -v error -show_entries format=duration:stream=codec_name,width,height,avg_frame_rate -of default=nw=1 "$f"
ffmpeg -hide_banner -nostats -i "$f" -af ebur128=framelog=quiet:peak=true -f null - 2>&1 | grep -E 'I:|Peak:'
ffmpeg -i "$f" -frames:v 1 qa-first.png
ffmpeg -ss <caption-time> -i "$f" -frames:v 1 -vf scale=390:-2 qa-phone.png
du -h ../media/hero.gif
```

- Duration under the event limit; 1920×1080; integrated loudness about −16 to −14 LUFS with peaks below −1 dB (heuristic; platforms normalize).
- `qa-first.png` works as a thumbnail; `qa-phone.png` (phone width) has readable captions. Look at both, plus stills about 0.1 s before and 0.2 s after every cut.
- Nothing flashes more than three times in any one second (WCAG 2.2 SC 2.3.1).
- After the human uploads: `curl -s -o /dev/null -w "%{http_code}\n" "https://www.youtube.com/oembed?url=<video-url>&format=json"` prints 200 when the video is embeddable (public or unlisted). For other hosts, open the link in a signed-out browser.
