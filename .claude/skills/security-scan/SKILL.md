---
name: security-scan
description: Runs a security pass on PaperTrail with OpenAI's Codex Security CLI (via npx) plus Claude's /security-review, triages the findings, and turns real ones into GitHub sub-issues under the security parent issue. Use at the start of a milestone (baseline), after security fixes (verify), and before a release, or when the user says "security scan", "scan for vulnerabilities", "安全扫描". Not for reviewing one PR's diff; use /security-review or the reviewer agent.
---

# Security scan

**Every milestone ends with no open high or critical security finding**, because PaperTrail runs a local server that holds the user's API keys and unpublished research.

## Inputs
- The repo at the current branch, `SECURITY.md` if present, and the open issues labelled `security`.
- Codex Security CLI: <https://github.com/openai/codex-security> (`@openai/codex-security`, Apache-2.0). It sends the code to OpenAI for analysis; the user agreed to this on 2026-10-21 (dev/DECISIONS.md).

## Steps
1. **Check sign-in.** Run `npx -y @openai/codex-security --version`. If a scan reports that you are not signed in, ask the user to run `! npx @openai/codex-security login` themselves, because login is interactive and uses their account. Done when the CLI prints a version and the user confirms they are signed in.
2. **Scan in the background.** Run `npx -y @openai/codex-security scan .` with the Bash tool's `run_in_background`, logging to `dev/security/scan-<date>.log`, because deep scans take many minutes and a foreground hang freezes the session. Use `--cyber-access-program standard` unless the user has Daybreak access. Done when the scan exits and the log names the saved report.
3. **Export.** Export the findings as JSON or SARIF into `dev/security/<date>/` (see `npx @openai/codex-security --help` for the export command of the installed version), because triage needs a stable file, not terminal output. Never copy key values into these files.
4. **Second opinion.** Run `/security-review` on the same branch, because two different scanners miss different things.
5. **Triage.** For each finding: confirm it in the code (file:line), mark it real or false positive with one reason, and rate it critical, high, medium or low. Merge duplicates across the two scanners. Done when every finding has a verdict.
6. **File.** The repo is public, so **don't publish exploit details for unfixed high or critical findings**. Keep the full details in `dev/security/` (git-ignored). For each real finding, high or above first: create a sub-issue under the open `security` parent issue with `gh issue create` (labels `security`, plus `critical` for critical or high), with a neutral description (area, Files it owns, Done when as a test that fails before the fix, no reproduction steps), the milestone, and a pointer to the local report. Link it with the GraphQL `addSubIssue` mutation. Group findings that touch the same files into one sub-issue, because sub-issues must be big enough to be worth an agent run and must not overlap. Ask the user whether a critical finding should also become a private GitHub security advisory.
7. **Verify run.** On a re-scan, close sub-issues whose finding is gone with a comment that cites the new scan report, and reopen any that came back.

## Deliverable
```text
Scan: <date> · Codex Security <version> · report <path> · /security-review done
Findings: <n> total · <n> real (<c> critical, <h> high, <m> medium, <l> low) · <n> false positive
Filed: <#issue list> · closed: <#issue list>
Gate: no open high/critical → pass | fail (<#issues>)
```

## When blocked
- **Not signed in, or the CLI needs a paid plan:** stop and tell the user what the CLI printed; continue with `/security-review` only and say so in the deliverable.
- **Node version rejected:** the CLI needs Node 22.13+ (22.x), 24.x or 26.x and Python 3.10+; report the versions found (`node -v`, `python3 -V`).
- **Scan runs over 60 minutes:** check the log; if there is no progress for 15 minutes, stop it and rescan only `server/` and `client/src/`.
