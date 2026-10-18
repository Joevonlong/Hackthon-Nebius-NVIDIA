#!/usr/bin/env python3
"""Copy the hack-team project scaffold into a repository. Python 3.8+, stdlib only.

Never overwrites an existing file without --force. Merges AGENTS.md (between
hack-team markers), CLAUDE.md, .env.example, and .gitignore instead of
replacing them, excludes worktree and video folders from TypeScript and ESLint,
and pins the Next.js root so worktree dev servers build the worktree.

    python3 init_project.py --target . --event "Example Hack" --project my-app \
        --start 2026-10-18T09:00+02:00 --submit-by 2026-10-19T15:00+02:00 \
        --deadline 2026-10-19T16:00+02:00 --doc-language zh
"""
import argparse
import json
import os
import re
import shutil
import stat
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATES = os.path.join(os.path.dirname(HERE), "templates")
BEGIN, END = "<!-- hack-team:begin -->", "<!-- hack-team:end -->"
# Kept out of typecheck and lint: worktrees hold whole app copies; the video project has its own deps.
EXCLUDED_DIRS = [".worktrees", ".claude/worktrees", "hack/demo/video"]

# template path -> project path; copied only when the project path is missing
PLAIN = {
    "hack/HACKATHON.md": "hack/HACKATHON.md",
    "hack/BOARD.md": "hack/BOARD.md",
    "hack/DECISIONS.md": "hack/DECISIONS.md",
    "hack/reviews/.gitkeep": "hack/reviews/.gitkeep",
    "hack/demo/media/.gitkeep": "hack/demo/media/.gitkeep",
    "scripts/hack": "scripts/hack",
    "scripts/gate.sh": "scripts/gate.sh",
    "scripts/smoke.sh": "scripts/smoke.sh",
    "e2e/golden-path.spec.ts": "e2e/golden-path.spec.ts",
    "playwright.config.ts": "playwright.config.ts",
    "README.md": "README.md",
    "github/pull_request_template.md": ".github/pull_request_template.md",
}
EXECUTABLE = {"scripts/hack", "scripts/gate.sh", "scripts/smoke.sh"}
FIELDS = ["event", "project", "start", "submit_by", "deadline", "doc_language",
          "submission_language", "autonomy", "merge_mode", "repo_url"]
QUOTED = {"event", "project", "repo_url"}


class Plan:
    def __init__(self, target, dry_run, force):
        self.target, self.dry_run, self.force = target, dry_run, force
        self.created, self.merged, self.skipped, self.manual = [], [], [], []

    def path(self, rel):
        return os.path.join(self.target, rel)

    def write(self, rel, content, kind="created"):
        getattr(self, kind).append(rel)
        if self.dry_run:
            return
        full = self.path(rel)
        os.makedirs(os.path.dirname(full) or ".", exist_ok=True)
        with open(full, "w", encoding="utf-8") as handle:
            handle.write(content)

    def report(self):
        prefix = "would " if self.dry_run else ""
        for title, items in (("created", self.created), ("merged", self.merged),
                             ("skipped (exists)", self.skipped), ("do by hand", self.manual)):
            if items:
                print("%s%s:" % (prefix if title != "do by hand" else "", title))
                for item in items:
                    print("  " + item)


def read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def fill_event(text, values):
    head, sep, body = text.partition("\n---\n")
    for key in FIELDS:
        value = values.get(key)
        if not value:
            continue
        rendered = '"%s"' % value.replace('"', "'") if key in QUOTED else value
        head = re.sub(r"(?m)^%s:.*$" % re.escape(key), "%s: %s" % (key, rendered), head)
    if values.get("event"):
        body = body.replace("# <event name>", "# " + values["event"], 1)
    return head + sep + body


def copy_plain(plan, values):
    app_dir = next((d for d in ("app", "src/app") if os.path.isdir(plan.path(d))), None)
    items = dict(PLAIN)
    if app_dir:
        items["app/api/health/route.ts"] = app_dir + "/api/health/route.ts"
    else:
        plan.manual.append("no app/ yet: add api/health/route.ts from the hack-init templates after scaffolding the app")
    if not os.path.exists(plan.path("fly.toml")):
        items["vercel.json"] = "vercel.json"
    for source, rel in items.items():
        if os.path.exists(plan.path(rel)) and not plan.force:
            plan.skipped.append(rel)
            continue
        content = read(os.path.join(TEMPLATES, source))
        if rel == "hack/HACKATHON.md":
            content = fill_event(content, values)
        plan.write(rel, content)
        if source in EXECUTABLE and not plan.dry_run:
            mode = os.stat(plan.path(rel)).st_mode
            os.chmod(plan.path(rel), mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def merge_agents(plan):
    block = read(os.path.join(TEMPLATES, "AGENTS.hack.md")).strip()
    rel = "AGENTS.md"
    if not os.path.exists(plan.path(rel)):
        plan.write(rel, "# Agent instructions\n\n" + block + "\n")
        return
    text = read(plan.path(rel))
    if BEGIN in text and END in text:
        start, end = text.index(BEGIN), text.index(END) + len(END)
        new = text[:start] + block + text[end:]
    else:
        new = text.rstrip("\n") + "\n\n" + block + "\n"
    if new != text:
        plan.write(rel, new, "merged")


def merge_claude(plan):
    rel = "CLAUDE.md"
    if not os.path.exists(plan.path(rel)):
        plan.write(rel, read(os.path.join(TEMPLATES, "CLAUDE.md")))
        return
    text = read(plan.path(rel))
    if "@AGENTS.md" not in text:
        plan.write(rel, "@AGENTS.md\n\n" + text, "merged")


def merge_lines(plan, template, rel, key):
    wanted = read(os.path.join(TEMPLATES, template)).splitlines()
    if not os.path.exists(plan.path(rel)):
        plan.write(rel, "\n".join(wanted) + "\n")
        return
    text = read(plan.path(rel))
    present = {key(line) for line in text.splitlines() if line.strip()}
    missing = [line for line in wanted if line.strip() and not line.startswith("#") and key(line) not in present]
    if missing:
        plan.write(rel, text.rstrip("\n") + "\n\n# hack-team\n" + "\n".join(missing) + "\n", "merged")


def patch_tsconfig(plan):
    rel = "tsconfig.json"
    if not os.path.exists(plan.path(rel)):
        return
    try:
        data = json.loads(read(plan.path(rel)))
    except ValueError:
        plan.manual.append("tsconfig.json: add %s to \"exclude\"" % ", ".join(EXCLUDED_DIRS))
        return
    exclude = data.setdefault("exclude", ["node_modules"])
    missing = [d for d in EXCLUDED_DIRS if d not in exclude]
    if missing:
        exclude.extend(missing)
        plan.write(rel, json.dumps(data, indent=2) + "\n", "merged")


def patch_eslint(plan):
    rel = next((f for f in ("eslint.config.mjs", "eslint.config.js", "eslint.config.ts")
                if os.path.exists(plan.path(f))), None)
    if not rel:
        return
    text = read(plan.path(rel))
    if ".worktrees/**" in text:
        return
    entries = "".join('\n    "%s/**",' % d for d in EXCLUDED_DIRS)
    if "globalIgnores([" in text:
        plan.write(rel, text.replace("globalIgnores([", "globalIgnores([" + entries, 1), "merged")
    else:
        plan.manual.append("%s: ignore %s" % (rel, ", ".join(d + "/**" for d in EXCLUDED_DIRS)))


def patch_next_config(plan):
    # Without a pinned root, a dev server inside .worktrees/F-NN finds the parent checkout's
    # lockfile and compiles the parent instead of the worktree.
    rel = next((f for f in ("next.config.ts", "next.config.mjs", "next.config.js")
                if os.path.exists(plan.path(f))), None)
    if not rel:
        return
    text = read(plan.path(rel))
    if "outputFileTracingRoot" in text:
        return
    opener = re.search(r"nextConfig(?:\s*:\s*NextConfig)?\s*=\s*\{", text)
    if rel != "next.config.ts" or not opener:
        plan.manual.append("%s: set turbopack.root and outputFileTracingRoot to __dirname" % rel)
        return
    turbopack = re.search(r"\bturbopack\s*:\s*\{", text)
    if turbopack and re.search(r"\broot\s*:", text[turbopack.end():]):
        plan.manual.append("%s: turbopack.root is set; set outputFileTracingRoot to the same path" % rel)
        return
    if turbopack:
        text = text[:turbopack.end()] + "\n    root: __dirname," + text[turbopack.end():]
        pin = "\n  outputFileTracingRoot: __dirname, // hack-team: worktrees build themselves"
    else:
        pin = ("\n  // hack-team: pin the root so dev servers in worktrees build the worktree"
               "\n  turbopack: { root: __dirname },\n  outputFileTracingRoot: __dirname,")
    opener = re.search(r"nextConfig(?:\s*:\s*NextConfig)?\s*=\s*\{", text)
    plan.write(rel, text[:opener.end()] + pin + text[opener.end():], "merged")


def main(argv=None):
    parser = argparse.ArgumentParser(description="Install the hack-team project scaffold.")
    parser.add_argument("--target", default=".")
    parser.add_argument("--force", action="store_true", help="overwrite plain template files")
    parser.add_argument("--dry-run", action="store_true")
    for field in FIELDS:
        parser.add_argument("--" + field.replace("_", "-"), dest=field)
    args = parser.parse_args(argv)
    target = os.path.abspath(args.target)
    if not os.path.isdir(target):
        print("init: target %s does not exist" % target, file=sys.stderr)
        return 1
    if not os.path.exists(os.path.join(target, ".git")):
        print("init: warning: %s is not a git repository yet (run git init -b main)" % target, file=sys.stderr)
    plan = Plan(target, args.dry_run, args.force)
    values = {f: getattr(args, f) for f in FIELDS}
    copy_plain(plan, values)
    merge_agents(plan)
    merge_claude(plan)
    merge_lines(plan, "env.example", ".env.example", lambda l: l.split("=", 1)[0].strip())
    merge_lines(plan, "gitignore", ".gitignore", lambda l: l.strip())
    patch_tsconfig(plan)
    patch_eslint(plan)
    patch_next_config(plan)
    plan.report()
    if not shutil.which("python3"):
        print("note: scripts/hack needs python3 on PATH")
    return 0


if __name__ == "__main__":
    sys.exit(main())
