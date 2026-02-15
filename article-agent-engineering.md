# What Engineering Discipline Looks Like When Your Collaborator Is an LLM

There are two conversations happening about AI and software engineering right now, and both of them are wrong.

The first says: let the AI drive. Describe what you want in natural language, accept what comes back, ship it. This has a name — vibecoding — and it works surprisingly well for prototypes, throwaway scripts, and things where correctness doesn't matter. It works less well for everything else.

The second says: AI coding tools are just autocomplete with better marketing. Useful for boilerplate, dangerous for anything structural. Keep the human in control of every keystroke. This is safer, but it leaves most of the leverage on the table.

Both camps miss the same thing. The question isn't whether an LLM should write your code. It's whether your engineering process is legible enough that an LLM can participate in it rigorously — with the same constraints, the same artifacts, and the same accountability you'd expect from a human engineer.

That's what we built. Not a prompting technique. Not a tool configuration. An engineering workflow designed from the ground up for human-agent collaboration, where the repo is the shared workspace and discipline is enforced by structure, not willpower.

---

## The Problem with Vibecoding

Vibecoding isn't engineering. It's improvisation with a capable partner.

When you open an AI coding tool and start describing features in natural language — accepting suggestions, iterating in conversation, building by feel — you're optimizing for speed of creation. And the results can be impressive. But you're also accumulating a specific kind of debt:

- **No traceability.** Why does this code exist? What problem was it solving? What alternatives were considered? The conversation that produced it is ephemeral. It's in a chat window you'll close, not in a document you'll maintain.
- **No governance.** The AI decided the architecture. It chose the abstraction boundaries, the data model, the error handling strategy. Maybe it chose well. Maybe it didn't. You won't know until it matters, and by then the decisions are load-bearing.
- **No verification contract.** What does "done" mean? What should the tests cover? What are the acceptance criteria? Without these, you're relying on your own judgment in the moment — the exact thing that deteriorates under speed pressure.
- **Scope creep by default.** LLMs are eager collaborators. They'll happily add features you didn't ask for, refactor things that were fine, and expand scope in ways that feel productive but aren't deliberate.

None of this means vibecoding is useless. It means it's appropriate for work where the cost of these failures is low. The problem is when people apply it to work where the cost is high and assume the speed carries over.

---

## The Alternative: Design the Process, Not Just the Prompt

Here's the shift in thinking that changed everything for us.

Instead of asking "how do I get better output from the AI?", we asked: **"What would our engineering process need to look like for an LLM agent to follow it the same way a human engineer would?"**

That question led to a set of principles:

1. Every expectation must be written down, in the repo, where the agent can read it.
2. Work must flow through explicit gates, each requiring a durable artifact before proceeding.
3. The human approves at every gate. The agent proposes, the human disposes.
4. Documentation is not a side effect of engineering — it is the engineering process.
5. Every merged change must be traceable back through the chain of decisions that produced it.

These aren't AI-specific principles. They're just good engineering discipline. But they become *essential* when your collaborator is an LLM, because an LLM has no institutional memory, no implicit understanding of your norms, and no ability to read the room. Everything must be explicit. Everything must be in the repo. If it's not written down, it doesn't exist.

The upside is that making things explicit for an agent also makes them explicit for future humans — including yourself in six months.

---

## Pattern 1: The Repo as Control Surface

Most engineering teams encode their norms in onboarding docs, Slack conventions, PR review culture, and tribal knowledge. A new human engineer absorbs these over weeks. An LLM agent never will.

We solved this with a single file at the root of the repository: `AGENTS.mdx`.

```markdown
# AGENTS

This repo follows the Engineering Workflow SOP.
Source of truth is the repo docs. Manual approval at every gate.

## Read first
- docs/content/docs/sop/agent-engineering-workflow.mdx

## Core rules
1. Repo docs are the system of record
2. Work only moves forward when the required artifact exists
3. Nothing merges without verification
4. Nothing is complete until docs reflect reality
5. One sub-phase = one branch = one PR
6. Conventional commits required
7. Manual approval at every gate
```

This file is the agent's first instruction. Before it writes a line of code, it reads this. The file tells it: here's how we work, here's where the detailed rules live, here are the non-negotiable constraints.

It also includes the documentation structure — where to find architecture docs, where to find the roadmap, where working artifacts go, and what the workflow gates are. The agent doesn't need to guess or infer. It reads the file and knows.

This is a pattern any team can adopt immediately. You don't need a sophisticated AI framework. You need a markdown file at your repo root that encodes your engineering norms in a format an LLM can consume. Think of it as an onboarding document that never goes stale because it's versioned with the code it describes.

The key insight: **your repo is already the shared workspace between you and the agent. Make it the control surface too.**

---

## Pattern 2: Docs as the System of Record

Most teams manage project state in external tools — Jira, Linear, Notion, a spreadsheet someone keeps meaning to update. The engineering artifacts live in the repo. The project management artifacts live elsewhere. The two drift apart constantly.

When your collaborator is an LLM agent operating inside a code editor, external tools are invisible. The agent can't check your Jira board. It can't read your Slack channel. It can't absorb your standup notes. It can only read what's in the repo.

So we made the repo the system of record for everything. Architecture, roadmap, business model, engineering workflow — all of it lives in docs, versioned alongside the code.

But not all docs are the same. We split documentation into two categories with different lifecycles:

**Reference docs** describe what the system *is*. They represent current truth. When the system changes, they change in the same PR. Architecture docs, the roadmap, the project overview — these are reference docs. If you need to understand the system, you read these.

**Working docs** capture what happened when work was done. Goals documents, system design specs, implementation plans, architecture decision records — these accumulate over time and are never rewritten. They're the history. If you need to understand *why* a decision was made, you read these.

This split matters for agents because it answers a question that LLMs struggle with: **what is current truth vs. what is historical context?** Reference docs are truth. Working docs are history. The agent doesn't need to reconcile conflicting information across Notion pages, chat threads, and stale wiki articles. It reads the reference docs and knows what's real.

It also solves the "docs are always out of date" problem by making it a non-negotiable rule: **docs update in the same PR when reality changes.** No "I'll update docs later." If your code changes the architecture, the architecture docs change in that PR. The agent knows this rule. The human enforces it during review.

---

## Pattern 3: Gated Workflow with Proportional Ceremony

Here's where most "AI workflow" advice falls apart. It's either "let the AI do everything" or "review every line." Neither scales.

We use a gated workflow where work flows through up to six stages, each requiring a specific artifact before proceeding:

1. **Goals** — define what this work achieves and why
2. **Design** — design the solution before building it (system design spec and/or architecture decision records)
3. **Plan** — plan the implementation before writing code (implementation spec with tasks, tests, acceptance criteria, rollback plan)
4. **Implement** — write the code, the tests, and update docs
5. **Verify** — confirm tests pass, acceptance criteria are met, docs are updated
6. **Ratify** — confirm reference docs reflect reality after merge

Every gate requires a durable artifact. Every artifact lives in the repo. Every gate requires human approval before work proceeds.

But — and this is critical — **not every change needs every gate.** The required artifacts scale with the significance of the change:

| Change Size | Goals | Design | Impl Spec | Tests | Doc Update |
|---|---|---|---|---|---|
| Small (bug fix, config) | No | No | No (PR desc) | If behavioral | If reality changed |
| Medium (new package, new interfaces) | Yes | If architecture changes | Yes | Yes | Yes |
| Large (new layer, cross-cutting change) | Yes | Yes | Yes | Yes | Yes |

A bug fix needs a good PR description and tests. A new package needs a goals document and an implementation spec. A cross-cutting architecture change needs the full ceremony — goals, system design, ADRs, implementation spec, the lot.

This proportionality is what makes the workflow practical rather than bureaucratic. The agent knows the classification. It can assess whether the current work is small, medium, or large and produce the appropriate artifacts. The human reviews the classification and the artifacts at each gate.

The agent doesn't need judgment about when to cut corners. The workflow tells it. The human confirms.

---

## Pattern 4: Traceability as a First-Class Concern

Every merged change must be traceable through a complete chain:

```
Roadmap Phase → Sub-Phase Goals → Design (SDS/ADR) → Implementation Spec → PR → Merged Code
```

This isn't paperwork. It's the mechanism that prevents the most dangerous failure mode of agent-assisted development: **confident, untraceable change.**

An LLM can produce code that works, passes tests, and looks reasonable — but that reflects assumptions or decisions that were never explicitly approved. Without traceability, those invisible decisions accumulate. Six months later, you have a codebase shaped by choices no one remembers making.

The traceability chain means every piece of merged code links back to an approved plan, which links back to an approved design, which links back to an approved goal, which links back to a roadmap phase. If you want to know why the code works this way, you can follow the chain. If the agent made an assumption, it's visible in the artifact where the human should have caught it.

ADRs (Architecture Decision Records) play a specific role here. When a decision is durable, cross-cutting, hard to reverse, or changes contracts — the agent writes an ADR. ADRs are never deleted. If a decision is superseded, a new ADR links to the old one. The decision history is permanent and navigable.

---

## What This Actually Looks Like in Practice

Let me make this concrete. Here's how a medium-sized change flows through the system:

**You identify the work.** Say it's adding a new storage layer to the system. You tell the agent: "We need to implement the document store. Start with the goals doc."

**Gate 1: Goals.** The agent reads the roadmap, reads the architecture docs, and produces a goals document. It includes what this sub-phase achieves, what's in scope, what's explicitly out, success criteria as checkboxes, constraints and risks. You review it. You might push back on scope. You approve it.

**Gate 2: Design.** Since this is a new component, the agent produces a system design spec — boundaries, interfaces, data model, failure modes, security notes. It might also produce an ADR if the storage backend choice is a durable decision. You review both. You approve.

**Gate 3: Plan.** The agent produces an implementation spec — ordered task list, target files, tests to write, acceptance criteria, rollback plan. This is the contract for what "done" means. You review it. You approve.

**Gate 4: Implement.** The agent writes code, writes tests, updates docs. One branch, one PR. The PR links to all the worklog artifacts. Conventional commits, grouped by concern.

**Gate 5: Verify.** Tests pass. Lint passes. Typecheck passes. Acceptance criteria from the implementation spec are met. Docs are updated. You review and approve.

**Gate 6: Ratify.** Reference docs reflect the merged change. ADR updated with the PR link. Roadmap updated if a milestone was completed.

At every step, the agent did the work. At every step, the human made the decision. The artifacts are in the repo. The history is navigable. If you open this codebase a year from now, you can trace any piece of code back through the full chain of reasoning that produced it.

---

## Why This Isn't Slower

The obvious objection: "This is a lot of process. Isn't the whole point of AI coding tools to go faster?"

Two responses.

First, the artifacts the agent produces — goals, designs, implementation specs — are things a disciplined engineering team would produce anyway. The agent just produces them faster and more consistently than most humans do. Writing a goals doc takes an LLM thirty seconds. Writing an implementation spec takes a minute. The review takes human time, but the *creation* is nearly free.

Second, the time you "save" by skipping these artifacts is time you spend later — debugging decisions you don't remember making, untangling scope that drifted without anyone noticing, rewriting code that solved the wrong problem. Agent-assisted development amplifies both creation speed and mistake speed. The gates are how you keep the first without suffering the second.

The workflow is fast where fast matters (artifact creation, code generation, test writing) and deliberately slow where slow matters (goal approval, design review, scope decisions). That's not a compromise. That's the point.

---

## The Deeper Implication

What we've built isn't really an "AI workflow." It's an engineering workflow that happens to work well with AI.

The principles — explicit norms, durable artifacts, gated progress, proportional ceremony, full traceability — are principles that would improve any engineering team. The reason they become urgent with AI collaboration is that AI strips away the crutches. You can't rely on tribal knowledge when your collaborator has no tribe. You can't rely on implicit norms when your collaborator takes everything literally. You can't rely on "we'll fix it later" when your collaborator can produce code faster than you can review it.

Working with an LLM agent forces you to be the kind of engineering organization you always said you'd be. The documentation you always meant to write? You have to write it, because the agent can't work without it. The process you always meant to follow? You have to follow it, because the agent will happily skip it if you don't enforce it. The decisions you always meant to record? You have to record them, because the agent will make them silently if you don't create a place for them to be made explicitly.

The agent doesn't make you disciplined. But it makes discipline pay off immediately and makes the lack of it hurt immediately. That's a forcing function most teams have never had.

---

## Getting Started

You don't need our specific workflow. You need the principles behind it. Here's the minimum viable version:

1. **Create an `AGENTS.md` at your repo root.** Write down how work happens in your repo. What are the norms? What does "done" mean? Where do docs live? What needs human approval? This is your control surface.

2. **Move your project state into the repo.** Architecture docs, a roadmap, a brief project overview. Whatever the agent needs to understand the system without asking you. If it's not in the repo, the agent can't see it.

3. **Define your gates.** What artifacts must exist before code is written? At minimum: a description of what you're building and why, and a definition of done. The agent produces the artifact. You approve it before implementation begins.

4. **Enforce docs-with-code.** When code changes reality, docs update in the same PR. Make this a review checklist item. The agent will comply if you tell it to. The human enforces it during review.

5. **Record durable decisions.** When you make a choice that will be hard to reverse — a technology, an abstraction boundary, a data model — write it down in an ADR. The agent can draft it. You approve the decision.

That's it. Five things. None of them require a new tool. All of them require a commitment to making your engineering process explicit.

---

## The Real Divide

The real divide in AI-assisted software engineering isn't between people who use AI and people who don't. It's between people who treat AI as a replacement for engineering discipline and people who treat it as a reason to finally have some.

Vibecoding is the former. It's fast, it's fun, and it produces things that work until they don't. It's appropriate for contexts where that tradeoff is acceptable.

Agent-based engineering is the latter. It's the recognition that having a tireless, capable, context-aware collaborator is only as valuable as the process it operates within. A great engineer with no process is a liability. A great LLM with no process is the same liability, moving faster.

The agents file, the docs-based workflow, the gated artifacts, the traceability chain — these aren't bureaucracy. They're the mechanism that turns a powerful tool into a trustworthy collaborator.

The code is the easy part. It always was. The hard part is making sure you're building the right thing, for the right reasons, in a way you can explain and maintain.

That's engineering. It doesn't change because your collaborator is an LLM. If anything, it matters more.
