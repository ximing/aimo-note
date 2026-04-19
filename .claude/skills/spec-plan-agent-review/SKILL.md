---
name: spec-plan-agent-review
description: Review and fix completed implementation against both a spec and an implementation plan using an agent team. Use this skill whenever the user says they develop with specs + plans, asks to review code after a plan is completed, wants to verify changes match `docs/superpowers/specs/*` and `docs/superpowers/plans/*`, or explicitly wants issues fixed immediately instead of only getting a review report. Trigger on requests like "plan 做完了帮我 review 并直接修复", "按 spec/plan 检查然后改掉问题", "用 agent team 验收并修复偏差", or "看看是否符合 spec，不符合就直接修".
---

# Spec + Plan Agent Review

## What this skill does

This skill is for **post-implementation acceptance work**, not just review.

It treats the **spec** and the **plan** as dual sources of truth, uses an **Agent Team** to inspect the work from different angles, and then **directly fixes clear problems** instead of stopping at a review-only report.

Use it when the user's real intent is:
- "plan 做完了，帮我验收"
- "按 spec + plan 检查一下"
- "如果有问题直接改掉"
- "用多 agent 看看有没有偏离设计和实施计划"

The default behavior is:
1. infer or gather spec / plan / code scope
2. design a small agent team with clear role boundaries
3. run the review workstreams in parallel when that actually helps
4. synthesize a fix backlog from the findings
5. fix the clear, actionable issues immediately
6. verify the touched files and report residual risk

Do **not** route through a separate human review page. The point of this skill is to shorten the loop from "发现问题" to "修完问题".

## When to use this skill

Use this skill when most of these are true:

- implementation already exists, or a plan chunk has just been completed
- there is at least one spec, one plan, or an equivalent design / task doc
- the user wants review, acceptance, gap analysis, regression checking, or direct follow-up fixes
- the task is non-trivial enough that multiple independent review angles increase signal

Do **not** force a team for tiny cosmetic changes. For a small text tweak or a one-file low-risk fix, do a lightweight review-and-fix pass directly.

## Agent Team architecture

Follow the spirit of `ximing.agent-team-creator`: clear workstreams, explicit scope boundaries, explicit dependencies, and lead-side synthesis.

| Role | Goal | Scope boundary | Output |
|------|------|----------------|--------|
| **Team Lead** | Choose docs, design the team, synthesize findings, decide fix plan, verify final result | Does not duplicate all detailed review work | Consolidated issue list, fix plan, final report |
| **Spec Reviewer** | Check whether user-visible behavior matches the spec | Focus on behavior, UI, interactions, naming, constraints | Findings classified as `spec-gap` or `risk` |
| **Plan Reviewer** | Check whether implementation follows the intended plan and architecture | Focus on chunk intent, layering, required verification, scope drift | Findings classified as `plan-gap` or `risk` |
| **Risk Reviewer** | Check correctness, regressions, lifecycle/state/data-flow risks not fully covered by docs | Avoid re-litigating obvious spec text unless needed for evidence | Findings classified as `risk` |
| **Fixer / Integrator** | Apply agreed fixes and keep changes coherent | Only executes the synthesized fix backlog, not independent review | Code changes + short fix notes |

If findings break into independent clusters, the lead may spawn **multiple fixers in parallel**. If changes are tightly coupled, use **one integrator** instead.

## Dependency model

Use explicit dependencies rather than vague teamwork:

- `Spec Reviewer`, `Plan Reviewer`, and `Risk Reviewer` can start in parallel.
- `Fixer / Integrator` depends on the lead's synthesized fix backlog.
- Additional fixers only start after the lead has split work into non-overlapping modules or file groups.
- Final verification depends on all fix tasks being complete.

This keeps the team useful instead of chaotic.

## Inputs to gather

Before spawning teammates, gather or infer:

1. **Spec path(s)** - preferably explicit, otherwise infer from nearby `docs/superpowers/specs/` docs
2. **Plan path(s)** - preferably explicit, otherwise infer from nearby `docs/superpowers/plans/` docs
3. **Code scope** - changed files, target directory, diff, PR, or module name
4. **Acceptance target** - current chunk, whole feature, or current diff only
5. **Fixing latitude** - normally "fix clear issues immediately unless product semantics are unclear"

If paths are not provided, infer the closest matching pair by feature name, date, or current editor context. Record that assumption in the final report; do not block on a follow-up question unless ambiguity would likely produce the wrong fix.

## Team sizing rule

### Use the full team when
- the feature spans multiple files or layers
- spec compliance, plan alignment, and generic code risk are meaningfully different checks
- the fix backlog may split into multiple independent workstreams

### Use a reduced flow when
- the change is tiny or obviously local
- the review would otherwise become heavier than the change itself

Reduced flow usually means: one focused reviewer + one direct fix pass by the lead.

## Workflow

### Step 1: Read sources of truth first

Read the chosen spec and plan before diving into code. Extract:
- required behavior
- explicit constraints
- architecture or layering expectations
- verification expectations
- anything the final code must visibly prove

Turn this into a short internal checklist. This prevents generic review noise.

### Step 2: Inspect the implementation scope

Read the changed files or target module. If a diff exists, use it. If not, inspect the files most directly connected to the spec / plan.

The goal is to prepare good spawn prompts, not to fully redo the review before the team starts.

### Step 3: Design and spawn the review team

When the workstreams are genuinely independent, spawn parallel reviewers with strict role boundaries.

Each spawn prompt should include:
1. role and goal
2. exact spec / plan inputs
3. exact code scope
4. what is out of scope
5. required output structure
6. instruction to return only high-signal findings

### Step 4: Synthesize findings into a fix backlog

The lead merges duplicate findings and creates a fix backlog.

Classify each item as:
- `spec-gap`
- `plan-gap`
- `risk`

Then decide whether it should be fixed immediately.

### Fix immediately when
- the issue is concrete and evidenced
- the correct change is reasonably clear from the spec, plan, and code
- the change is reversible and low ambiguity

### Do not auto-fix when
- the spec and plan conflict in a product-significant way
- the required behavior is ambiguous
- the fix is risky and irreversible without approval
- the fix requires a product or design decision not present in the docs

When auto-fix is unsafe, report the issue clearly instead of guessing.

### Step 5: Spawn fixer teammates when appropriate

If there are clear issues:
- use **one integrator** for tightly coupled changes
- use **multiple fixers** only when file ownership and dependency boundaries are clear

Good examples for parallel fixers:
- one fixer for renderer UI wiring
- one fixer for service-layer state logic
- one fixer for tests or verification harness

Bad examples for parallel fixers:
- three fixers all touching the same service or same component tree without boundaries

For risky fixes, require plan approval before editing.

### Step 6: Verify after fixes

After fixes are applied:
- re-read the changed files
- run targeted checks that match the touched scope when practical
- confirm the original finding is actually resolved
- record any residual risk or unverified behavior

Do not claim full compliance if only part of the issue was verified.

## Reviewer output format

Ask each reviewer to return this exact structure:

```text
1. Verdict: pass / pass-with-risks / fail
2. Findings:
   - [severity] title
   - why it matters
   - evidence
   - classification: spec-gap / plan-gap / risk
3. Suggested fix direction
4. Open questions
5. What looks good
```

This format makes it easy for the lead to convert review output into a concrete fix backlog.

## Fixer output format

Ask each fixer to return:

```text
1. Files changed
2. What was fixed
3. Anything intentionally not fixed
4. Verification performed
5. Residual risk
```

## Lead synthesis rules

1. Findings come before celebration.
2. Prefer user-visible spec correctness over plan preferences when they conflict.
3. Do not treat every unchecked plan step as a bug; only elevate it when it affects architecture, verification confidence, or maintainability.
4. If multiple reviewers report the same issue, merge them into one fix item.
5. Keep team coordination overhead proportional to the problem size.
6. Once an issue is validated and fixable, move to repair rather than stopping at review.
7. Only leave issues unresolved when ambiguity or risk justifies it.

## Final answer format

Use a concise execution report in this order:

### Fixed
- what issue was found
- classification: `spec-gap` / `plan-gap` / `risk`
- what changed to resolve it

### Remaining
- unresolved issues, if any
- why they were not auto-fixed

### Verification
- what was checked after the fixes
- what is still not fully verified

### Assumptions
- inferred spec / plan paths
- review scope boundaries
- product assumptions made during fixes

### Next actions
- only brief, practical follow-ups

If no substantive issues are found, say that explicitly and do not invent changes just to satisfy the workflow.

## Spawn prompt template

```text
You are the [ROLE] on a spec + plan acceptance team.

Goal:
Review the implementation against the spec and plan, then help the lead turn real findings into actionable fixes.

Inputs:
- Spec: <path(s)>
- Plan: <path(s)>
- Code scope: <path(s) or diff summary>

Your lane:
- <role-specific focus bullets>

Out of scope:
- <explicit non-goals>

Rules:
- Read the spec and plan before judging code.
- Prefer concrete mismatches, regressions, and missing verification over style nits.
- Keep role boundaries tight; don't redo another teammate's job.
- If you find no substantive issues, say "No findings" explicitly.
- Suggest fix direction, not just criticism.
- Cite evidence with file paths and symbols where possible.

Return exactly:
1. Verdict: pass / pass-with-risks / fail
2. Findings:
   - [severity] title
   - why it matters
   - evidence
   - classification: spec-gap / plan-gap / risk
3. Suggested fix direction
4. Open questions
5. What looks good
```

## Heuristics that improve signal

- A missing user-visible requirement is usually more important than a plan-style deviation.
- A plan deviation without user impact can still matter if it weakens architecture boundaries or leaves required verification undone.
- A good teammate does not only identify a bug; they narrow the repair path.
- A good lead does not stop at a review document when the fix is obvious.
- For tiny changes, restraint is part of quality: do the smallest review/fix flow that still protects correctness.

## Example trigger phrases

This skill should activate for prompts like:
- "我采取 specs + plan 开发，plan 做完后帮我 review 并直接修复"
- "按 spec 和 implementation plan 做一次 Agent Team 验收，有问题直接改"
- "这个功能做完了，检查是否符合 docs/superpowers/specs 和 plans，不符合就修掉"
- "用 agent team 看看这次改动有没有偏离设计和实施计划，发现问题直接处理"
