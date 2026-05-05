# SimpleExplorer

A fast, simple file explorer for Windows. Multi-pane (1–4 panes in a grid),
three switchable design directions, light/dark theme. Built as a
[Neutralinojs](https://neutralino.js.org) app: native Windows `.exe` (~2 MB),
real local filesystem access, no Rust toolchain, no Electron.

Conventions for AI-assisted development live in [`CLAUDE.md`](./CLAUDE.md).
Project architecture and current status live in
[`docs/design.md`](./docs/design.md).

## Getting Started

Prerequisites:

- [Node.js](https://nodejs.org) 20+
- On Windows: [WebView2 runtime](https://developer.microsoft.com/microsoft-edge/webview2/)
  (already installed on Win11)

```bash
npm install        # installs the Neutralinojs CLI
npm run setup      # one-time: downloads the Neutralino runtime to bin/
npm run dev        # neu run — opens the app with hot reload of src/
npm run build      # neu build — produces dist/simpleexplorer/...exe
```

`src/index.html` also opens directly in a browser for UI-only iteration —
the FS adapter falls back to mock folder data when `window.Neutralino`
isn't present.

## Checks

JS lint / test tooling is not yet wired up. Per `CLAUDE.md`, do not claim a
check passed when it has not been run.

## Contributing

Read [`CLAUDE.md`](./CLAUDE.md) before running any `git` command. In
particular:

- Branch from the latest default branch using a Conventional Commits type
  (`feat/...`, `fix/...`, `docs/...`, etc.).
- Commit with explicit identity flags; never modify global `git config`.
- Treat `claude/*` branches as assistant scratch space.

## License

See [`LICENSE`](./LICENSE).
