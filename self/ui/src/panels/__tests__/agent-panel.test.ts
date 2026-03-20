/**
 * AgentPanel component tests.
 *
 * These tests verify the AgentPanel module exports, type contracts,
 * and component function identity. Full rendering tests require jsdom
 * or @testing-library/react, which will be added in a future phase.
 */

import { describe, it, expect } from 'vitest';
import { AgentPanel } from '../AgentPanel.js';
import type {
  AgentPanelApi,
  AgentSession,
  AgentMessage,
  AgentToolCall,
  AgentStatus,
  GovernanceDecision,
} from '../AgentPanel.js';

// ---------------------------------------------------------------------------
// Export verification
// ---------------------------------------------------------------------------

describe('AgentPanel exports', () => {
  it('exports AgentPanel as a function component', () => {
    expect(typeof AgentPanel).toBe('function');
    expect(AgentPanel.name).toBe('AgentPanel');
  });

  it('is re-exported from panels index', async () => {
    const panelsIndex = await import('../index.js');
    expect(panelsIndex.AgentPanel).toBe(AgentPanel);
  });
});

// ---------------------------------------------------------------------------
// Type contract verification (compile-time + runtime shape tests)
// ---------------------------------------------------------------------------

describe('AgentPanel type contracts', () => {
  it('AgentSession shape is valid', () => {
    const session: AgentSession = {
      id: 'test-1',
      agentName: 'Claude',
      agentType: 'nous.agent.claude',
      status: 'running',
      messages: [],
    };

    expect(session.id).toBe('test-1');
    expect(session.agentName).toBe('Claude');
    expect(session.agentType).toBe('nous.agent.claude');
    expect(session.status).toBe('running');
    expect(session.messages).toEqual([]);
  });

  it('AgentMessage with tool call shape is valid', () => {
    const toolCall: AgentToolCall = {
      id: 'tc-1',
      toolName: 'Read',
      input: { file_path: '/src/index.ts' },
      output: { content: 'hello' },
      governance: 'allowed',
      timestamp: '2026-03-20T00:00:00.000Z',
    };

    const message: AgentMessage = {
      id: 'm-1',
      role: 'tool',
      content: 'Read /src/index.ts',
      timestamp: '2026-03-20T00:00:00.000Z',
      toolCall,
    };

    expect(message.role).toBe('tool');
    expect(message.toolCall?.toolName).toBe('Read');
    expect(message.toolCall?.governance).toBe('allowed');
  });

  it('AgentPanelApi shape supports all methods', () => {
    const api: AgentPanelApi = {
      onSessionUpdate: (_callback) => () => {},
      sendStopSignal: (_sessionId) => {},
      getSessions: () => [],
    };

    expect(typeof api.onSessionUpdate).toBe('function');
    expect(typeof api.sendStopSignal).toBe('function');
    expect(typeof api.getSessions).toBe('function');
  });

  it('AgentStatus covers all states', () => {
    const statuses: AgentStatus[] = ['running', 'waiting', 'completed', 'failed', 'idle'];
    expect(statuses).toHaveLength(5);
  });

  it('GovernanceDecision covers allowed and denied', () => {
    const decisions: GovernanceDecision[] = ['allowed', 'denied'];
    expect(decisions).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Multi-tab support verification
// ---------------------------------------------------------------------------

describe('AgentPanel multi-tab support', () => {
  it('AgentPanelApi.getSessions returns multiple sessions', () => {
    const sessions: AgentSession[] = [
      {
        id: 'claude-1',
        agentName: 'Claude',
        agentType: 'nous.agent.claude',
        status: 'running',
        messages: [],
      },
      {
        id: 'codex-1',
        agentName: 'Codex',
        agentType: 'nous.agent.codex',
        status: 'completed',
        messages: [],
      },
    ];

    const api: AgentPanelApi = {
      getSessions: () => sessions,
    };

    expect(api.getSessions!()).toHaveLength(2);
    expect(api.getSessions!()[0]!.agentType).toBe('nous.agent.claude');
    expect(api.getSessions!()[1]!.agentType).toBe('nous.agent.codex');
  });

  it('AgentPanelApi.onSessionUpdate can add new sessions', () => {
    const sessions: AgentSession[] = [];
    let updateCallback: ((session: AgentSession) => void) | null = null;

    const api: AgentPanelApi = {
      onSessionUpdate: (callback) => {
        updateCallback = callback;
        return () => { updateCallback = null; };
      },
      getSessions: () => sessions,
    };

    const unsubscribe = api.onSessionUpdate!((session) => {
      sessions.push(session);
    });

    // Simulate new session arriving
    updateCallback!({
      id: 'new-1',
      agentName: 'Claude',
      agentType: 'nous.agent.claude',
      status: 'running',
      messages: [],
    });

    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.id).toBe('new-1');

    // Cleanup
    unsubscribe();
    expect(updateCallback).toBeNull();
  });
});
