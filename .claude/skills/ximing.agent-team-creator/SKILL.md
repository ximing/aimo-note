---
name: ximing.agent-team-creator
description: Design and create Claude Code agent teams for tasks that benefit from parallel execution. Use this skill whenever a task involves multiple independent workstreams, requires different expertise angles explored simultaneously, or when the user asks to "spawn agents", "create a team", "parallelize work", "have multiple agents", or describes a complex task that could be broken into parallel roles. Triggers on requests like "create an agent team", "use parallel agents", "have teammates work on this", "explore from different angles", or any scenario where dividing work across specialized agents would be faster or better than one agent doing everything sequentially.
---

# Agent Team Creator

## What this skill does

Agent teams let you tackle complex tasks in parallel. Instead of one Claude session working through everything sequentially, a **Team Lead** (your current session) spawns **Teammates** — independent Claude Code instances that each own a piece of the work. Teammates share a task list, can communicate via a mailbox, and report back when done.

This skill guides you through: deciding if a team is the right approach, designing the team structure, and crafting the prompts that make teammates effective.

---

## Is a team right for this task?

Teams shine when the work naturally splits into **independent workstreams** — pieces that don't need each other's results to get started. Common good fits:

- **Exploration from different angles** — UX, architecture, and devil's advocate all exploring a problem simultaneously
- **Parallel implementation** — three unrelated modules being built at the same time
- **Research + implementation** — one teammate gathers information while another sets up scaffolding
- **Multi-domain tasks** — security review, performance profiling, and API design happening in parallel

Teams are **not** the right tool when tasks are tightly sequenced (step 2 needs step 1's output) or when the task is simple enough that coordination overhead isn't worth it. For sequential work, use `subagent-driven-development` instead.

---

## Architecture

| Component       | Role                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| **Team Lead**   | Your current Claude Code session — creates the team, spawns teammates, coordinates work, synthesizes results |
| **Teammates**   | Independent Claude Code instances — each works on their assigned task in isolation                           |
| **Task list**   | Shared work queue in `~/.claude/tasks/{team-name}/` — teammates claim and complete tasks                     |
| **Team config** | `~/.claude/teams/{team-name}/config.json` — stores team membership, agent IDs, and types                     |
| **Mailbox**     | Messaging system — teammates can message each other or the lead; messages arrive automatically               |

Each teammate starts fresh: they load CLAUDE.md, MCP servers, and skills from the project, plus whatever you put in their spawn prompt. They do **not** inherit the lead's conversation history — this is a feature, not a bug. You get clean, focused agents.

---

## Step 1: Design the team

Before spawning anyone, invest a minute in team design. Answer these questions:

**What are the workstreams?**  
Name each role clearly. "Backend teammate" is vague; "teammate who designs the database schema and writes migration scripts" is precise.

**What are the dependencies?**  
If Teammate B needs Teammate A's output, that's a dependency. Mark it explicitly when creating tasks so the system can manage blocking automatically.

**How will results be synthesized?**  
The lead synthesizes findings at the end. Think about what format you want teammates to produce — a written summary, code files, a structured report — so you can ask for it in their spawn prompts.

**Should teammates require plan approval?**  
For risky or complex tasks, you can require teammates to present their plan before taking action. The lead reviews and approves (or rejects with feedback). Good for anything that touches production systems, database schemas, or irreversible changes.

---

## Step 2: Write spawn prompts

Each teammate needs a spawn prompt that stands alone — they have no access to your session history. A good spawn prompt includes:

1. **Role and goal** — who they are and what outcome they're producing
2. **Scope boundaries** — what's in/out of their lane (prevents overlap and conflict)
3. **Output format** — what they should produce and where to put it
4. **Coordination instructions** — how to communicate findings back, whether to message the lead when done
5. **Plan approval requirement** (if applicable) — tell them to present a plan before acting

**Example spawn prompt (good):**

```
You are the UX Researcher on this team. Your goal is to analyze the proposed CLI tool
from a user experience perspective and produce a written report covering:
- Target user personas and their mental models
- Key interaction flows and where friction might occur
- 3-5 concrete UX recommendations with rationale

Scope: Focus on user-facing behavior only. Don't touch implementation or architecture.
Output: Write your findings to /tmp/ux-research-findings.md
When done: Message the lead with a summary and flag the task as complete.
```

**Example spawn prompt (too vague):**

```
Research the UX of this CLI tool and let me know what you find.
```

---

## Step 3: Manage tasks

The shared task list is how work gets coordinated. Each task has:

- A **description** of the work
- A **status**: pending → in progress → completed
- Optional **dependencies**: other tasks that must complete first

**Assigning work:**

- The lead can assign tasks explicitly to specific teammates
- Teammates can self-claim the next unassigned, unblocked task when they finish

Dependencies are managed automatically: when a blocking task completes, dependent tasks unblock without manual intervention.

---

## Step 4: Communicate

**User Talking to teammates:**

- Use `Shift+Down` to cycle through teammate sessions
- Type to send them a message; they receive it in their context
- Press `Enter` to view a teammate's session; `Escape` to interrupt their current turn
- Use `Ctrl+T` to toggle the task list view

**Broadcast vs. direct message:**

- **Direct message** (`message`): send to one specific teammate — prefer this
- **Broadcast** (`broadcast`): send to all teammates at once — use sparingly, costs scale with team size

**Requiring plan approval:**

```
Spawn an architect teammate to refactor the authentication module.
Require plan approval before they make any changes.
```

The teammate works read-only until the lead approves. If rejected, the teammate revises and resubmits.

---

## Step 5: Synthesize and clean up

When teammates finish, the lead synthesizes their outputs. Read the task list to confirm everything completed, then gather outputs from wherever teammates put them.

**Shut down teammates gracefully:**

```
Ask the researcher teammate to shut down
```

The lead sends a shutdown request; the teammate approves or explains why it can't yet.

**Clean up team resources:**

```
Clean up the team
```

This removes shared team resources. Always run cleanup from the lead — not from a teammate — to avoid leaving resources in an inconsistent state. Cleanup fails if teammates are still active, so shut them down first.

---

## Common patterns

### Exploration team

Three or more teammates exploring a problem from independent angles (technical, business, user), each producing a written summary. Lead synthesizes into a unified view.

### Parallel implementation team

Teammates each own a separate, non-overlapping module. Lead coordinates interfaces and resolves conflicts. Dependencies prevent teammates from stepping on each other.

### Research + build team

One teammate does discovery (reads docs, searches the codebase, gathers requirements) while another sets up scaffolding. When research completes, the builder teammate picks up the findings.

### Approval-gated team

Teammates plan in read-only mode, send plan approval requests to the lead, and only implement after approval. Best for risky changes.

---

## How to ask Claude to create a team

Claude will create a team when you describe a task and ask for parallel execution:

```
I'm designing a CLI tool that helps developers track TODO comments across
their codebase. Create an agent team to explore this from different angles: one
teammate on UX, one on technical architecture, one playing devil's advocate.
```

You can also let Claude propose: describe a complex task and Claude may suggest a team structure. You confirm before it proceeds.

If you want control over the structure, specify roles, scope, and output expectations explicitly. The more precise your instructions, the better Claude's spawn prompts will be.

---

## Checklist before spawning

- [ ] Each workstream is genuinely independent (or dependencies are explicit)
- [ ] Each teammate has a clear role, scope, and output format
- [ ] Synthesis plan is clear — where does the lead collect results?
- [ ] Cleanup plan is ready — how will the team be disbanded?
- [ ] Plan approval enabled for any teammate making risky or irreversible changes
