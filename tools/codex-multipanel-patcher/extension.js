const cp = require('child_process');
const path = require('path');
const vscode = require('vscode');

let agentCounter = 1;
const terminals = new Set();

function config() {
  return vscode.workspace.getConfiguration('codexParallelPanels');
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function workspaceCwd() {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder?.uri?.scheme === 'file' ? folder.uri.fsPath : process.cwd();
}

function terminalLocation() {
  return config().get('terminalLocation', 'editor') === 'panel'
    ? vscode.TerminalLocation.Panel
    : vscode.TerminalLocation.Editor;
}

function codexCommand() {
  const command = config().get('codexCommand', 'codex').trim() || 'codex';
  const args = config().get('startCommandArgs', []);
  return [command, ...args].map(shellQuote).join(' ');
}

function createCodexTerminal({ cwd = workspaceCwd(), name } = {}) {
  const terminal = vscode.window.createTerminal({
    name: name ?? `Codex Agent ${agentCounter++}`,
    cwd,
    location: terminalLocation(),
  });
  terminals.add(terminal);
  terminal.show(false);
  terminal.sendText(codexCommand(), true);
  return terminal;
}

function exec(command, cwd) {
  return new Promise((resolve, reject) => {
    cp.exec(command, { cwd }, (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

async function newAgent() {
  createCodexTerminal();
}

async function newAgentInWorktree() {
  const root = workspaceCwd();
  const defaultName = `codex-agent-${Date.now().toString(36)}`;
  const branch = await vscode.window.showInputBox({
    title: 'New Codex Agent Worktree',
    prompt: 'Branch name for the new worktree',
    value: defaultName,
  });
  if (!branch) return;

  const parent = path.dirname(root);
  const basename = path.basename(root);
  const worktreePath = path.join(parent, `${basename}-${branch.replace(/[^A-Za-z0-9._-]/g, '-')}`);

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Creating worktree ${branch}`,
      cancellable: false,
    },
    async () => {
      await exec(`git worktree add ${shellQuote(worktreePath)} -b ${shellQuote(branch)}`, root);
    },
  );

  createCodexTerminal({ cwd: worktreePath, name: `Codex ${branch}` });
}

async function showAll() {
  for (const terminal of [...terminals]) {
    if (terminal.exitStatus) {
      terminals.delete(terminal);
      continue;
    }
    terminal.show(false);
  }
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codexParallelPanels.newAgent', newAgent),
    vscode.commands.registerCommand('codexParallelPanels.newAgentInWorktree', newAgentInWorktree),
    vscode.commands.registerCommand('codexParallelPanels.showAll', showAll),
    vscode.window.onDidCloseTerminal((terminal) => terminals.delete(terminal)),
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
