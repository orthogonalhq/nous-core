# Nous

**Your personal assistant.

Finally, an AI that's actually yours.**

It lives on your machine, learns how you work, and gets better the longer you use it. Open source. Self-hosted. Yours.

> This is the Nous monorepo — the full codebase that builds into the desktop apps (macOS, Linux, Windows) and the web app. Maintained by [Orthogonal](https://orthg.nl).

![Demo](docs/assets/demo.gif)

[![CI Gate](https://img.shields.io/github/actions/workflow/status/orthogonalhq/nous-core/ci-gate.yml?branch=dev&style=for-the-badge&label=CI)](https://github.com/orthogonalhq/nous-core/actions/workflows/ci-gate.yml)
[![Release](https://img.shields.io/github/actions/workflow/status/orthogonalhq/nous-core/ci-release.yml?branch=main&style=for-the-badge&label=RELEASE)](https://github.com/orthogonalhq/nous-core/actions/workflows/ci-release.yml)
[![Coverage](https://img.shields.io/codecov/c/github/orthogonalhq/nous-core?branch=main&style=for-the-badge&label=COVERAGE)](https://codecov.io/gh/orthogonalhq/nous-core)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue?style=for-the-badge)](LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/orthogonalhq/nous-core/dev?style=for-the-badge)](https://github.com/orthogonalhq/nous-core/commits/dev)

> **Status**: Active development. v1 launches in weeks. Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## What Is Nous

Nous is a local-first AI agent. It composes foundation models into a personal assistant that actually does things for you — routing tasks to the right model, learning from outcomes, and getting better over time.

Easy enough for your family to use. Powerful enough for engineers and business owners to rely on.

---

## Architecture

Four cognitive layers, modeled on how the human brain organizes intelligence.

| Layer | Role |
|---|---|
| **Cortex** | Decision, reflection, governance, escalation |
| **Memory** | Short-term, long-term, distillation, retrieval, knowledge indexing |
| **Subcortex** | Model routing, tools, workflows, multi-agent orchestration, sandbox, witness chain |
| **Autonomic** | Storage, embeddings, health, config, runtime |

---

## Ecosystem

- **[APM](https://apm.orthg.nl)** — the open registry for agent skills. Works across every major agent ecosystem. 5,000+ skills indexed.
- **[Orthogonal Research](https://orthg.nl/research)** — papers and the thinking behind the lab.

---

## Tech Stack

| | |
|---|---|
| **Language** | TypeScript 5 (strict, ESM) |
| **Runtime** | Node.js 22+ |
| **Packages** | pnpm v10 workspace monorepo |
| **Build** | tsdown (libraries), electron-vite (desktop), Next.js (web) |
| **Persistence** | SQLite via better-sqlite3 |
| **Validation** | Zod — runtime schemas as single source of truth |
| **RPC** | tRPC v11 (web ↔ CLI) |
| **Desktop** | Electron 34, React 19, dockview-react v4 |
| **Web** | Next.js 14+ |
| **Lint** | oxlint (not eslint) |
| **Test** | vitest |
| **CI** | GitHub Actions — typecheck, lint, test, benchmark, build (Ubuntu, macOS, Windows) |

---

## Quick Start

**Prerequisites**: Node.js 22+, pnpm 10+

```bash
git clone https://github.com/orthogonalhq/nous-core.git
cd nous-core
pnpm install
pnpm build
```

Run the web interface:
```bash
pnpm dev:web
```

Run the CLI:
```bash
pnpm dev:cli
```

Run the desktop app:
```bash
pnpm dev:desktop
```

Run tests:
```bash
pnpm test
```

### Known Sharp Edges

> **Electron + VS Code terminals**: The Electron dev flow requires a wrapper script that unsets `ELECTRON_RUN_AS_NODE`. `pnpm dev:desktop` handles this automatically, but running `electron-vite dev` directly from a VS Code or Claude Code terminal will fail silently because those terminals set `ELECTRON_RUN_AS_NODE=1`. See `self/apps/desktop/scripts/start-dev.mjs`.

> **Electron binary download**: pnpm v10's build-script allowlisting can prevent Electron's postinstall from running. If `pnpm install` doesn't download the Electron binary, run `node node_modules/electron/install.js` manually.

> **better-sqlite3 on Windows**: Requires build tools (`windows-build-tools` or Visual Studio C++ workload). If it fails to compile during install, that's why.

---

## Project Structure

All code lives under `self/`, organized by cognitive layer.

- **`self/cortex/*`** — core executor, prefrontal engine, governance
- **`self/memory/*`** — STM, LTM, distillation, retrieval, access policy, knowledge index
- **`self/subcortex/*`** — model routing, tools, workflows, sandbox, witness chain, multi-agent orchestration, scheduler, voice control, and more
- **`self/autonomic/*`** — storage, embeddings, health, config, runtime abstraction
- **`self/shared/`** — types, interfaces, events, errors shared across all layers
- **`self/apps/*`** — web, CLI, desktop

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution tier system, where to start, and how to navigate the codebase.

**Issues**: Check the issue tracker for `good-first-issue` labels — real, scoped tasks at the integration layer.

**Discord**: [Join the community](https://discord.gg/39uDKGDwqd) — ask questions, share what you're building, see what's happening.

---

## License

Licensed under the [GNU Affero General Public License v3.0](LICENSE).

---

Built by [Orthogonal](https://orthg.nl).
