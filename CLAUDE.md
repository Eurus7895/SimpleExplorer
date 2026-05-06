# CLAUDE.md — SimpleExplorer

Conventions for Claude Code (and other AI assistants) working in this repository.
Modeled on the CopilotHarness CLAUDE.md — see
`https://github.com/Eurus7895/CopilotHarness/blob/dev/CLAUDE.md` for the upstream
reference.

## One Sentence

SimpleExplorer is a Neutralinojs Windows desktop app (vanilla HTML/CSS/JS
frontend, ~2 MB native shell, one MSVC-built helper exe for Shell COM
calls); this file fixes the rules an assistant must follow when reading,
editing, branching, and committing here. Per-project architecture and
status live in [`docs/design.md`](./docs/design.md); the
implementation plan, MVP audit, and phased backlog live in
[`docs/roadmap.md`](./docs/roadmap.md) — read it before starting any
new feature so the work fits the existing plan instead of inventing a
new one.

## Hard Invariants

Non-negotiable. Changing any of these requires explicit discussion in the PR.

1. **No fabricated architecture.** If a module, command, or test does not exist
   on disk, do not document it as if it does. Edit reality, not aspirations.
2. **UTF-8 everywhere.** All text I/O passes UTF-8 explicitly. JS reads /
   writes use `TextDecoder`/`TextEncoder` with `'utf-8'`; the C++ helper
   uses `wmain` + `/utf-8` so wide-char paths round-trip cleanly. Platform
   defaults (`cp1252`/`charmap` on Windows) mangle non-ASCII content.
3. **Prefer editing existing files.** Don't scatter new top-level docs, status
   files, or version footers — they rot. Status belongs in a single design doc,
   not sprinkled across the tree.
4. **No scaffolding cruft.** No backwards-compat shims, no `// removed` markers,
   no commented-out code blocks "for later", no comments narrating what the code
   already says.
5. **No silent destructive actions.** Never `git reset --hard`, `git push
   --force`, `rm -rf`, or `git clean -f` without an explicit instruction in the
   current task. Investigate unfamiliar state before deleting it.

## Branches & Commits — READ BEFORE EVERY `git` COMMAND

### NEVER

- Modify `user.name` / `user.email` via `git config` — pass identity per-commit
  via `-c` flags so global config stays clean.
- Use an identity other than `Eurus <t.hoang7895@gmail.com>` for author or
  committer on canonical branches.
- Amend or force-push commits that already exist on a remote branch other than
  the assistant's scratch branch — create a new commit instead.
- Push branches whose merge-base lags `origin/main` (or whichever default the
  repo uses) — rebase first.

### ALWAYS

- Start work from the latest default branch:
  `git fetch origin && git switch -c <branch> origin/main`.
- Name canonical branches `<type>/<short-kebab-slug>` using Conventional
  Commits types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`,
  `ci`, `chore`, `style`, `revert`.
- Commit with identity flags so global config is never touched:

  ```bash
  git -c user.name='Eurus' -c user.email='t.hoang7895@gmail.com' \
      commit -m "<type>(<scope>): <description>"
  ```

- Follow Conventional Commits 1.0.0:
  - `<type>[optional scope]: <description>` — lowercase, imperative,
    ≤72 chars, no trailing period.
  - Body wraps at 72 columns and explains *why*, not *what*.
  - Breaking changes use `!` after the type/scope and a `BREAKING CHANGE:`
    footer.

### Scratch Branches (`claude/*`)

`claude/*` branches are assistant scratch space and may be force-pushed by the
harness. Treat them as ephemeral: do not base long-lived work on them, and do
not open PRs from them unless the task explicitly says so. When a task instructs
"push to `claude/<slug>`", that is the harness override and takes precedence
over the canonical-branch rule above.

## Conventions

### File Layout

Adopt these locations as soon as the corresponding artifact exists. Do not
create empty directories just to match the layout.

- **Frontend (JS/CSS/HTML):** `src/` — flat ES-module layout, no bundler.
- **Per-direction renderers:** `src/directions/<name>.js`.
- **Native helpers (C++ source):** `tools/<helper>.cpp` plus a sibling
  `build.md` documenting the MSVC build command.
- **Native helpers (compiled binaries):** `extras/<helper>.exe`,
  intentionally tracked so end users never need a C++ toolchain.
- **Slash commands:** `.github/commands/<name>.md` (frontmatter-driven)
- **Skills:** `.github/skills/<name>/SKILL.md` (+ `assets/`, `references/`)
- **Agents:** `.github/agents/<role>.agent.md` (canonical, flat catalog)
- **Memory:** `.github/memory/{MEMORY.md, architecture.md, failure-patterns.md}`
- **Design / status:** `docs/design.md` is the single source of truth for
  current status; do not duplicate status into READMEs or footers.
- **Implementation plan / backlog:** `docs/roadmap.md` is the canonical
  list of what's painted-but-not-wired, what's deferred, and the phased
  plan for upcoming work. New features go through this file first
  (sized, ordered, written down) before any code lands. Update it when
  a phase ships.

### Adding Things

- **New slash command:** drop a `.md` file in `.github/commands/`. No code
  change required.
- **New skill:** add a directory under `.github/skills/` containing `SKILL.md`.
- **New agent:** add `.github/agents/<role>.agent.md`. Promote from a single
  agent to multiple only after 3+ documented, reproducible failures that a
  better skill or schema cannot fix.

### Editing Guidelines

- Prefer editing existing files over creating new ones.
- Do not add status, version, or week-number footers — they rot. Status lives
  in `docs/design.md` only.
- Do not add scaffolding comments (`# TODO: implement later`,
  `# kept for backwards compatibility`) when the code can simply be written or
  removed.
- Three similar lines is better than a premature abstraction.

### Text I/O — Always Use UTF-8 Explicitly

JS (Neutralino has no encoding param — but `readFile` returns a string
decoded from UTF-8 by default; `writeFile` accepts a string and encodes
UTF-8). Don't reach for `TextDecoder('windows-1252')` etc. without a
specific reason.

```js
import * as fs from './fs.js';
const text = await Neutralino.filesystem.readFile('notes.md');         // UTF-8 in
await Neutralino.filesystem.writeFile('out.md', text);                  // UTF-8 out
const payload = JSON.parse(await Neutralino.filesystem.readFile('data.json'));
await Neutralino.filesystem.writeFile('data.json', JSON.stringify(payload, null, 2));
```

C++ helpers use `wmain` + `/utf-8` and pass `wchar_t*` paths through
`SHCreateItemFromParsingName` / `ShellExecuteExW` so non-ASCII paths
round-trip cleanly. See `tools/shellhelp.cpp`.

## Commands

These are the standard checks once the corresponding tooling is wired up.
Run them before declaring a task complete.

```bash
# JS lint    (not yet wired — when added, likely eslint or biome)
# JS test    (not yet wired — vitest or node:test, run from src/)
# Helper rebuild (only when tools/*.cpp changes; see tools/build.md)
```

If a tool is not yet configured, say so explicitly rather than claiming
the check passed.

## Decision Rules

### Choose the lowest viable complexity

| Level  | Shape                                  | When                              |
| ------ | -------------------------------------- | --------------------------------- |
| Direct | 1 LLM call, no harness                 | Simple questions, lookups         |
| 0      | 1 agent + skill + plan JSON            | Well-defined task, simple schema  |
| 1      | 1 agent + evaluator + correction loop  | Wrong output has real cost        |
| 2      | Multi-agent + evaluator                | Single-agent demonstrably fails   |

### Promotion checklist (0→1, 1→2)

Promote only after **all** of:

- 3+ observed reproducible failures (not random flakes).
- A skill file or schema change cannot fix the failure mode.
- A specialized agent is demonstrably better, with the comparison documented.
- The subtask, single-agent output, and rationale are written down.

If any item is unchecked, fix the skill or schema first — do not invent agents
speculatively.

### Instructions vs Skills

- `instructions/` — always-loaded, priority-ranked rules
  (P1 universal > P2 org > P3 domain > P4 project). P1 cannot be overridden.
- `skills/` — procedures and knowledge, injected by the harness in pipeline
  mode and pulled on demand in direct mode.

## Core Rule

> "Never send an LLM to do a linter's job."

Deterministic checks (formatting, type-checking, schema validation, secret
scanning) belong in hooks and CI, not in agent prompts.
