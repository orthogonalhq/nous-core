# Codex - Parallel Panels

Orthogonal standalone VS Code extension for running multiple Codex CLI agents side by side.

This extension does not patch, copy, or redistribute OpenAI's Codex VS Code extension. It creates independent VS Code terminals and starts the Codex CLI in each one.

Commands:

- `Codex - Parallel Panels: New Codex Agent Terminal`
- `Codex - Parallel Panels: New Codex Agent in Git Worktree`
- `Codex - Parallel Panels: Show Codex Agent Terminals`

Settings:

- `codexParallelPanels.codexCommand`
- `codexParallelPanels.startCommandArgs`
- `codexParallelPanels.terminalLocation`

This is less polished than OpenAI's webview UI, but it is durable, update-safe, and avoids redistributing proprietary extension code.
