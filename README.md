# Nous

**An operating system for sovereign intelligence.**

Four layers of cognition modeled on the human mind, governed by an auditable witness chain, compounding knowledge over time. Open source. Self-hosted. Yours.

Foundation models are commodity inputs. The architecture is the value layer.

![Demo](docs/assets/demo.gif)

[![CI](https://img.shields.io/github/actions/workflow/status/orthogonalhq/nous-core/ci-release.yml?branch=main&style=for-the-badge&label=CI&labelColor=0a0a0a)](https://github.com/orthogonalhq/nous-core/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/codecov/c/github/orthogonalhq/nous-core?style=for-the-badge&label=COVERAGE&labelColor=0a0a0a)](https://codecov.io/gh/orthogonalhq/nous-core)
[![Last Commit](https://img.shields.io/github/last-commit/orthogonalhq/nous-core?style=for-the-badge&labelColor=0a0a0a)](https://github.com/orthogonalhq/nous-core/commits/main)

> **Status**: Active development. The architecture is stable. The runtime is functional. Edges are sharp. Contributions welcome at the right layer — see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## What Is This

Nous is a local-first AI operating system that composes foundation models into persistent, self-improving, governed intelligence. It manages projects autonomously — routing tasks to the right model, learning from outcomes, enforcing governance boundaries, and compounding knowledge across everything it touches. One system handles a synthetic persona pipeline, a real estate monitor, and an open-ended inbox assistant with the same cognitive architecture.

You own everything. It runs on your machine. The open core is the complete system.

---

## Architecture

The architecture is modeled on the structure of human consciousness. Not as metaphor — as structural pattern.

```
┌─────────────────────────────────────────────────────────────────┐
│                         CORTEX                                  │
│          Decision · Reflection · Governance · Escalation        │
│                                                                 │
│  self/cortex/core/    10-step execution loop, trace persistence │
│  self/cortex/pfc/     Prefrontal engine — confidence gating,    │
│                       memory approval, tool authorization       │
├─────────────────────────────────────────────────────────────────┤
│                         MEMORY                                  │
│          STM · LTM · Distillation · Retrieval                   │
│                                                                 │
│  self/memory/stm/           Working context, session state      │
│  self/memory/ltm/           Document-backed long-term store     │
│  self/memory/distillation/  Pattern compression across clusters │
│  self/memory/retrieval/     Sentiment-weighted, budget-bound    │
│  self/memory/access/        Cross-project policy engine         │
│  self/memory/knowledge-index/  Project meta-vectors & taxonomy  │
│  self/memory/mwc/           Write candidate pipeline            │
├─────────────────────────────────────────────────────────────────┤
│                       SUBCORTEX                                 │
│       Model Routing · Tools · Workflows · Communication         │
│                                                                 │
│  self/subcortex/providers/   Model adapters (Ollama, OpenAI)    │
│  self/subcortex/router/      Role-based model routing           │
│  self/subcortex/tools/       Tool execution & capability gating │
│  self/subcortex/workflows/   Workflow graph engine              │
│  self/subcortex/witnessd/    Security evidence-chain service    │
│  self/subcortex/sandbox/     Runtime membrane & capabilities    │
│  self/subcortex/communication-gateway/  Messenger runtime       │
│  self/subcortex/escalation/  Principal escalation queue         │
│  self/subcortex/registry/    Package governance & marketplace   │
│  self/subcortex/mao/         Multi-Agent Orchestration surface  │
│  ... and 10 more packages                                       │
├─────────────────────────────────────────────────────────────────┤
│                       AUTONOMIC                                 │
│            Storage · Embedding · Health · Config                │
│                                                                 │
│  self/autonomic/storage/     SQLite persistence (better-sqlite3)│
│  self/autonomic/embeddings/  Pluggable embedding abstraction    │
│  self/autonomic/health/      Health monitoring & diagnostics    │
│  self/autonomic/config/      Configuration schema & validation  │
│  self/autonomic/runtime/     Cross-platform runtime abstraction │
└─────────────────────────────────────────────────────────────────┘

       Applications                    Shared
  self/apps/web/     Next.js SaaS      self/shared/    Types, interfaces,
  self/apps/cli/     Terminal (tRPC)                   events, errors —
  self/apps/desktop/ Electron + React                  the nervous system
  self/apps/bridge/  Messenger bridge
```

Information flows up as pre-processed results. Directives flow down as intent. The Cortex does the least processing but makes the highest-stakes decisions. Each layer below does more work but surfaces less.

The full architectural narrative: [`.architecture/reference/system/the-mind-model.md`](.architecture/reference/system/the-mind-model.md)

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
git clone https://github.com/orthogonal-research/nous-core.git
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

All code lives under `self/`. Architecture docs, decision records, and the roadmap live in `.architecture/`. Engineering SOPs live in `.skills/`.

Packages are organized by cognitive layer:
- **`self/cortex/*`** — core executor, prefrontal engine
- **`self/memory/*`** — STM, LTM, distillation, retrieval, access, knowledge-index, MWC, stubs
- **`self/subcortex/*`** — the largest layer:
  - `providers` — model adapters (Ollama, OpenAI-compatible)
  - `router` — role-based model routing
  - `tools` — tool execution and capability gating
  - `workflows` — workflow graph engine and run-state
  - `witnessd` — security evidence-chain witness service
  - `sandbox` — runtime membrane and capability enforcement
  - `communication-gateway` — messenger runtime
  - `escalation` — Principal escalation queue and ack
  - `registry` — package governance and marketplace
  - `mao` — Multi-Agent Orchestration projection service
  - `nudges` — discovery nudge runtime
  - `opctl` — operator control command integrity
  - `projects` — project container and lifecycle
  - `artifacts` — integrity-verified artifact storage
  - `scheduler` — document-backed scheduler and ingress envelopes
  - `voice-control` — voice session and turn management
  - `endpoint-trust` — device pairing and capability governance
  - `gtm` — GTM stage-threshold calculator
  - `stubs` — deferred interface stubs
- **`self/autonomic/*`** — storage, embeddings, health, config, runtime
- **`self/shared/`** — the nervous system: types, interfaces, events, errors shared across all layers
- **`self/apps/*`** — web, CLI, desktop, bridge

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution tier system, where to start, and how to navigate the codebase.

<!-- **Discord**: [placeholder — link when available] -->

**Issues**: Check the issue tracker for `good-first-issue` labels — these are real, scoped tasks at the integration layer.

---

## License

**No license file exists yet.** This is a required decision before public launch. The intent is open source — the specific license has not been ratified. Do not assume any license until one is published.

---

Built by [Orthogonal](https://orthogonal.dev) — a solo founder building with AI agents as co-builders.
