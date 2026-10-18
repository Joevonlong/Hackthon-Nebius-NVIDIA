# Submission text

Read this when writing `hack/demo/SUBMISSION.md`. It holds paste-ready text for every field of the event's form, the checks behind it, and the checklist the human submits from. The agent never submits.

## Fields

Devpost's project story uses the sections below; other platforms (Devfolio, DoraHacks, lablab, a Google Form) ask for the same content under other names. Read the event's form fields from HACKATHON.md §Submission requirements, map each to a row, and add any field the event adds (track, sponsor questions, team photo).

| Field | Limit | Source | What it says |
|---|---|---|---|
| Project name | Devpost's form showed 60 characters; check the live form | PITCH.md name | The name only |
| Tagline (elevator pitch) | Kit rule: at most 60 characters, so it also fits cards and repo descriptions; the form may allow more | PITCH.md tagline | Persona + outcome, no adjectives |
| Inspiration | — | PITCH.md painful moment | Why this persona and moment; the cost with its source |
| What it does | — | PITCH.md one-liner, SPEC.md beats | One-liner, then the demo path in 3–5 sentences |
| How we built it | — | ARCHITECTURE.md | Stack, the AI pipeline in plain words, sponsor technology by name, what is real and what is mocked |
| Challenges we ran into | — | DECISIONS.md, board log | One or two real problems and what you did |
| Accomplishments that we're proud of | — | BOARD.md done cards, the wow beat | What works end to end, shown by the video or the live URL |
| What we learned | — | Team | Specific lessons, not "teamwork" |
| What's next for <name> | — | SPEC.md P1/P2, cut cards | The next two steps for the same persona |
| Built with | tags | `package.json`, ARCHITECTURE.md | Languages, frameworks, models, APIs, hosting; lowercase tags as the platform suggests |
| Try it out | links | HACKATHON.md | Prod URL with `?demo=1`, the repo when the rules make it visible, any other required link |
| Video | link | `hack-video` | The uploaded video's URL |
| Image gallery | images | `hack/demo/media/` | Poster, then the three beat screenshots; check the form's size and ratio guidance |

Most forms accept Markdown in the story fields; check the preview. Write in `submission_language`.

## Writing rules

- Reuse README sentences so the judge reads one story in both places.
- Every number comes from PITCH.md with its source, the demo's output, or a cited page. No invented users, testimonials, accuracy figures, or results.
- Say what is mocked and that demo mode replays recorded outputs of the real pipeline, when it does.
- Disclose code that existed before the event and AI tools used, in the form the rules ask.
- Name the track and sponsor prizes the team enters, and where in the demo each sponsor's technology is visible.

## SUBMISSION.md layout

```markdown
# Submission · <project> · <event>

Form: <link> · deadline <deadline> · our target <submit_by>

## Project name (limit 60, used 12)
<text>

## Tagline (limit 60, used 47)
<text>

## Inspiration
<text>
…

## Checks
| Link | Status | Checked at |
|---|---|---|
| <prod_url>/?demo=1 | 200 | 10-19 13:40 |

| Claim | Source |
|---|---|
| "38 invoices every Monday" | PITCH.md §Painful moment (interview note) |

## Checklist for the human (G3)
- [ ] Video plays signed out (oEmbed 200 at <time>)
- [ ] Repo visibility matches the rules (gh: <PUBLIC|PRIVATE>)
- [ ] Every teammate added on the platform
- [ ] Tracks and prizes selected
- [ ] Fields pasted and preview checked
- [ ] Submitted at <time> · confirmation <url>
```

Count characters with `printf %s "<text>" | wc -m` and write the count into each heading.

## Checks

- Every URL: `curl -sS -o /dev/null -w "%{http_code} %{url_effective}\n" -L <url>`; expect 200 after redirects.
- YouTube video: `curl -s -o /dev/null -w "%{http_code}\n" "https://www.youtube.com/oembed?url=<video-url>&format=json"` prints 200 when the video is embeddable (public or unlisted). For other hosts, open the link in a signed-out browser.
- Repo: `gh repo view --json visibility -q .visibility` against the rules; a private repo that judges must read needs the human to invite them or change visibility.
- Prod: `scripts/smoke.sh <prod_url>` green within the last hour before the human submits.

## Handing over

Give the human, in one message: the form link, the time left to `submit_by` and to the official `deadline`, the checklist with every unchecked item named, and SUBMISSION.md's path. Pasting into the form, adding teammates, choosing tracks, and pressing submit are theirs, because the submission is public and final. Ask them to paste back the confirmation URL; then log it.
