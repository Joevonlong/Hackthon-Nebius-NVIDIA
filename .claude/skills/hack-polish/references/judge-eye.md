# Judge's eye

A judge meets the demo on a projector, in a slot of a few minutes, after and before dozens of other projects, with a rubric in hand. They score what they understood in the moment, not what was built. These tests stand in for that judge.

## Tests per beat

Run them on the 1280×720 shots in beat order. A failed test is a finding; rank it in step 5.

| Test | How | Pass when |
|---|---|---|
| Five-second read | Show only the screenshot for five seconds, to a teammate who has not seen it or to a fresh helper given nothing but the image, then ask: who is this for, what just happened, why does it matter? | The three answers match PITCH.md's persona, the beat's purpose in SPEC.md, and the pain |
| Logic without narration | Read the screen as if the presenter were muted | Input, what the AI did, and the result each have an on-screen label; every number shows a unit and a source; the before and after sit on the same screen |
| Climax | Lay the beat shots side by side in order | The wow beat carries the largest type or number, the most motion, and the accent; no earlier beat outshines it |
| First ten seconds | The opening screen | Product name, who it is for, what changes for them, and how the demo starts are visible at 1280×720 without scrolling |
| Back of the room | View the shot at half size | Key labels and the payoff number are still readable |
| Squint | Blur the shot, or squint | The primary element of each screen is still the first thing you see |

The five-second read works best blind: the helper gets the image and the three questions, never the pitch, DESIGN.md, or the build history, so hindsight cannot fill the gaps. Claude Code: a background subagent with only the image path · Codex: a spawned subagent with only the image path.

## Rubric coverage

For each criterion in HACKATHON.md's judging rubric, name the beat and the on-screen element that earns it. Typical mappings:

| Criterion family | Visible evidence |
|---|---|
| Impact or usefulness | The before and after with real numbers, on the persona's own data |
| Technical depth | The AI working in view: the step trail, structured output, streaming, a real model response in live mode |
| Innovation or creativity | The wow beat itself, and why no existing tool does it |
| Design or UX | The polish of the path and the clarity of the flow |
| Presentation | A narrative that reads across the beats in order |

A criterion with no visible evidence is a P1 finding, and a P0 when it is the rubric's heaviest criterion.

## Critique scoring

Used by the judge role in step 6. Score each lens 0–10 from the shots, the rubric, and DESIGN.md.

| Lens | Scores | Ignores |
|---|---|---|
| Story | The five-second read, logic without narration, whether the wow lands | Visual taste |
| Craft | Hierarchy, type, contrast, rhythm, space | Brand fit, copy |
| System | Fidelity to DESIGN.md's tokens and direction posture; anti-slop | Hierarchy |
| Access | Projector contrast, visible focus, target sizes, reduced motion | Aesthetics |
| Copy | Voice, specific verbs, real names and numbers, no filler | Color and spacing |

- **Composite** = Story × 0.3 + Craft × 0.25 + System × 0.15 + Access × 0.15 + Copy × 0.15. The weights are a heuristic that puts judge comprehension first.
- **MUST_FIX:** every lens scoring under 8 names at least one: a concrete change without which a judge would misunderstand, doubt, or dismiss the demo. Each names the beat, the element, and the change.
- **Ship bar:** composite 8.0 or more and zero MUST_FIX.
- **Rounds:** at most two in a hackathon. After the second, ship the best version and list what remains.

The judge reports in at most 20 lines:

```text
Judge review · polish-<MMDD-HHMM> · rubric: <criteria and weights>
Story <n> · Craft <n> · System <n> · Access <n> · Copy <n> → composite <n.n>
MUST_FIX: B<n> <element> — <change>
Rubric gaps: <criterion> has no visible evidence | none
Ship bar met: <yes | no (composite, MUST_FIX count)>
```

Lens model adapted from open-design's Critique Theater design jury (Apache-2.0); see `docs/sources.md`.
