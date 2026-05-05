# SimpleExplorer

A Python project. Conventions for AI-assisted development live in
[`CLAUDE.md`](./CLAUDE.md), modeled on the
[CopilotHarness](https://github.com/Eurus7895/CopilotHarness/blob/dev/CLAUDE.md)
CLAUDE.md.

## Getting Started

```bash
python -m venv .venv
source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -e .
```

## Checks

```bash
ruff check .
mypy .
pytest -v
```

If tooling is not yet wired up, see `CLAUDE.md` — do not claim a check passed
when it has not been run.

## Contributing

Read `CLAUDE.md` before running any `git` command. In particular:

- Branch from the latest default branch using a Conventional Commits type
  (`feat/...`, `fix/...`, `docs/...`, etc.).
- Commit with explicit identity flags; never modify global `git config`.
- Treat `claude/*` branches as assistant scratch space.

## License

See [`LICENSE`](./LICENSE).
