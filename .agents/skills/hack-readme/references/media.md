# README media

Read this when choosing, preparing, or checking images for README.md and the submission gallery. Media is real footage of the product: screenshots from the golden path and the GIF from `hack-video`, never mock-ups drawn to look like the product.

## Files

| File | From | Size target |
|---|---|---|
| `hack/demo/media/hero.gif` | `hack-video` export of the wow moment, 6–10 s, about 960 px wide | at most 8 MB |
| `hack/demo/media/poster.png` | `hack-video` still, 1920×1080 | at most about 1 MB |
| `hack/demo/media/01-<slug>.png` … `03-<slug>.png` | `hack/demo/shots/B<n>.png`, curated | at most about 500 KB each (heuristic) |

Keep the whole folder under about 15 MB (heuristic) so the repo clones fast. Never commit the full video: GitHub warns on files over 50 MiB and blocks files over 100 MiB (GitHub docs, "About large files on GitHub"); link the hosted video instead.

## Screenshots by beat

1. Run `scripts/smoke.sh <prod_url>` (a plain run; `--capture` keeps its 1920×1080 shots in `hack/demo/shots/capture/`). It walks the golden path in demo mode and saves `hack/demo/shots/B<n>.png` at 1440×900.
2. Pick three beats: the starting point (the persona's input), the wow, and the outcome.
3. Copy each to `hack/demo/media/0<n>-<slug>.png` with a stable, descriptive slug (`02-duplicate-caught.png`), so README links survive re-shoots.
4. Look at every image before using it:
   - the state the beat names, fully loaded, with no spinner, toast, or half-streamed text;
   - no dev overlay, `localhost`, real personal data, keys, or other tabs;
   - sample data labeled the way the app labels it;
   - the DESIGN.md theme, matching the video.

A shot that fails goes back through the smoke run after the fix; never edit pixels to hide a broken state.

## Hero

- The GIF from `hack-video` when it exists. Until then, the wow screenshot, so the first screen is never empty.
- If you must cut a GIF yourself from a take, use the palette command in `hack-video`'s compose reference and the same 8 MB cap.
- Set a display width in the README (`width="800"`) so large files do not stretch the page.

## Alt text

- Say what the image shows and why it matters, in `submission_language`: "Two invoices side by side with the duplicated lines highlighted and €1,240 flagged."
- About 125 characters or fewer (heuristic); no "image of" or "screenshot of".
- The GIF's alt text describes the whole moment, start to result.

## Light and dark themes

GitHub shows READMEs in the reader's theme.

- Screenshots are opaque, so they read in both themes; never cut out the UI background.
- A transparent logo or diagram image needs a variant per theme, chosen with the HTML `<picture>` element and the `prefers-color-scheme` media feature (GitHub docs, "Specifying the theme an image is shown to").
- Mermaid diagrams follow the theme by themselves; prefer them over exported diagram images.

## Shrinking files

- Resize: `ffmpeg -i in.png -vf scale=1440:-1 out.png`.
- A screenshot with photos or gradients compresses far better as JPG: `ffmpeg -i in.png -q:v 3 out.jpg`.
- `pngquant` or `oxipng` cut PNG size further when installed.
- GIF over budget: fewer frames per second, narrower, or shorter, re-cut by `hack-video`.

## Check

```bash
du -h hack/demo/media/*
git check-ignore -q hack/demo/media/hero.gif && echo "media is ignored: fix .gitignore"
```

The deliverable lists every file with its size. After the merge, open the README on GitHub (or a Markdown preview for a private repo) and confirm every image renders in both light and dark themes.
