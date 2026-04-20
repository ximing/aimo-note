---
name: spec-plan-agent-review
description: Review and fix completed implementation against both a spec and an implementation plan using an agent team. Use this skill whenever the user says they develop with specs + plans, asks to review code after a plan is completed, wants to verify changes match `docs/superpowers/specs/*` and `docs/superpowers/plans/*`, or explicitly wants issues fixed immediately instead of only getting a review report. Trigger on requests like "plan 做完了帮我 review 并直接修复", "按 spec/plan 检查然后改掉问题", "用 agent team 验收并修复偏差", or "看看是否符合 spec，不符合就直接修".
---

# Spec + Plan Agent Review

## What this skill does

This skill is for **post-implementation acceptance**, not a generic code review.

Its job is to use an **Agent Team** to answer four questions in order:

1. what did the **spec** require?
2. what did the **plan** promise to implement and verify?
3. what does the **code and diff** actually do today?
4. what must be fixed so the implementation is truly landed, not just documented?

The core idea is simple:

- do **not** assume that a finished plan means the feature exists in code
- do **not** assume that matching code names means the behavior matches the spec
- do **not** stop at a review report when the mismatch is clear and fixable

This skill therefore runs in two phases:

1. **Validation phase** - an Agent Team checks whether spec and plan are real in code
2. **Repair phase** - the lead turns validated findings into a fix backlog and hands them to a **Fixer Mate** or small fixer group

The default behavior is:

1. identify the spec, plan, and implementation scope
2. design a review team with tight role boundaries
3. verify in parallel whether required behavior and planned work really landed in code
4. synthesize only the validated findings into a fix backlog
5. hand the backlog to a fixer mate or integrator for repair
6. verify the repaired result against the original findings
7. report what is fixed, what remains, and what is still unverified

The point of this skill is to shorten the loop from "设计/计划" -> "代码落地" -> "发现偏差" -> "立即修复".

## Success criteria

This skill succeeds only when the lead can answer all of these clearly:

- which spec and plan were treated as sources of truth
- which parts of those docs are visibly implemented in code
- which parts are missing, partial, incorrect, or unverified
- which issues were fixed immediately
- which issues were intentionally left open because of ambiguity or risk

If you cannot map a claim from spec or plan to real code, real behavior, or a deliberate omission, treat that as an acceptance gap to investigate.

## When to use this skill

Use this skill when most of these are true:

- implementation already exists, or a plan chunk has just been completed
- there is at least one spec, one plan, or an equivalent design / task doc
- the user wants acceptance, review, gap analysis, or direct fixes
- the work is large enough that multiple independent review lanes increase signal

Typical trigger intents:

- "plan 做完了，帮我验收"
- "按 spec + plan 检查一下代码是不是已经真实落地了"
- "如果有问题直接改掉"
- "用 Agent Team 看看有没有偏离 spec 和 implementation plan"

Do **not** force a team for tiny edits. For a one-file low-risk change, do a lightweight read -> validate -> fix pass directly.

## Core principle: prove reality, not paper compliance

The team is not checking whether the docs look reasonable. The team is checking whether the implementation can be **proven** from code and targeted verification.

For every important requirement or plan item, try to place it into one bucket:

- **landed** - clearly implemented in code and supported by evidence
- **partial** - some code exists, but important behavior, wiring, or verification is missing
- **missing** - the spec or plan claims it, but the implementation does not exist where it should
- **unclear** - evidence is too weak; requires product clarification or broader testing

That evidence can come from:

- changed files or target modules
- code paths and symbol wiring
- relevant tests or absence of required tests
- targeted runtime or lint verification when practical
- doc/code mismatches that show planned work never actually landed

## Agent Team architecture

Follow the spirit of `ximing.agent-team-creator`: clear workstreams, explicit scope boundaries, explicit dependencies, and lead-side synthesis.

| Role | Goal | Scope boundary | Output |
| --- | --- | --- | --- |
| **Team Lead** | Choose inputs, design the team, synthesize evidence, build the fix backlog, verify the final result | Does not duplicate every detailed review lane | Acceptance checklist, fix backlog, final report |
| **Spec Reality Checker** | Verify whether user-visible behavior, constraints, and states required by the spec truly exist in code | Focus on behavior, UI, interactions, naming, contract semantics | Findings tagged `spec-gap`, `partial`, or `risk` |
| **Plan Reality Checker** | Verify whether promised implementation steps, architecture boundaries, and planned verification actually landed | Focus on layering, module placement, missing wiring, skipped verification, scope drift | Findings tagged `plan-gap`, `partial`, or `risk` |
| **Code Risk Checker** | Look for correctness, regression, lifecycle, state, async, data-flow, and integration risks not fully covered by docs | Avoid redoing the same spec/plan reading unless needed for evidence | Findings tagged `risk` |
| **Fixer Mate / Integrator** | Take the synthesized backlog and repair validated issues coherently | Does not independently redefine requirements; follows the lead's fix backlog | Code changes, verification notes, unresolved items |

If the fix backlog splits cleanly by module, the lead may use multiple fixers. If the changes are coupled, use one integrator.

## Dependency model

Use explicit dependencies instead of vague collaboration:

- `Spec Reality Checker`, `Plan Reality Checker`, and `Code Risk Checker` can start in parallel
- the lead waits for reviewer outputs, merges duplicates, and writes a single validated backlog
- `Fixer Mate / Integrator` starts only after backlog synthesis
- additional fixers start only when file ownership and edit boundaries are clearly non-overlapping
- final verification starts only after all fix tasks finish

This keeps the team parallel where it helps, and sequential where synthesis is required.

## Inputs to gather first

Before spawning teammates, gather or infer:

1. **Spec path(s)** - ideally explicit, otherwise infer from nearby `docs/superpowers/specs/` docs
2. **Plan path(s)** - ideally explicit, otherwise infer from nearby `docs/superpowers/plans/` docs
3. **Code scope** - changed files, target directory, diff, PR, or module name
4. **Acceptance target** - current chunk, whole feature, or diff-only validation
5. **Fixing latitude** - normally: fix clear issues immediately unless product semantics are unclear

If exact paths are missing, infer the closest matching spec/plan pair by feature name, date, active files, or changed scope. Record that assumption in the final report instead of blocking on a question unless the ambiguity is severe enough to risk the wrong fix.

## Team sizing rule

### Use the full team when

- the feature spans multiple files or layers
- spec compliance, plan alignment, and generic code risk are meaningfully different checks
- the acceptance backlog may split into multiple independent repair lanes

### Use a reduced flow when

- the change is tiny or obviously local
- one reviewer lane is enough to establish reality
- the coordination overhead would exceed the likely benefit

Reduced flow usually means one focused reviewer plus one direct fix pass by the lead.

## Workflow

### Step 1: Read the sources of truth first

Read the selected spec and plan before diving into implementation details. Extract a compact acceptance checklist:

- required user-visible behavior
- explicit constraints and non-goals
- architecture or layering requirements
- plan promises about files, services, boundaries, or sequencing
- verification expectations the plan said would exist

The checklist should be written in terms that can later be proven from code.

### Step 2: Inspect the implementation scope

Read the changed files, target module, or diff. The goal here is not to finish the review early. The goal is to understand:

- where the feature should have landed
- which files or symbols should prove implementation
- which files reviewers should inspect
- whether there are obvious verification hooks such as tests, IPC wrappers, services, or UI integration points

### Step 3: Spawn the validation team

When the workstreams are truly independent, spawn parallel reviewers with strict role boundaries.

Each reviewer prompt must include:

1. role and goal
2. exact spec and plan inputs
3. exact code scope
4. out-of-scope boundaries
5. required output format
6. instruction to report only validated, high-signal findings
7. instruction to classify every major requirement or plan item as `landed`, `partial`, `missing`, or `unclear`

### Step 4: Validate whether spec and plan became code

The lead should synthesize reviewer outputs into an evidence table or backlog.

For each finding, capture:

- the requirement or plan item being checked
- the evidence in code or verification
- the current status: `landed` / `partial` / `missing` / `unclear`
- the issue classification: `spec-gap` / `plan-gap` / `risk`
- the concrete repair direction

Do not pass raw reviewer output straight to a fixer. The lead must deduplicate and validate first.

### Step 5: Decide what can be fixed immediately

Fix immediately when all are true:

- the issue is concrete and evidenced
- the correct repair path is reasonably clear from the spec, plan, and code
- the fix is low ambiguity and reversible
- the lead can describe the expected result precisely enough for a fixer mate

Do **not** auto-fix when:

- the spec and plan conflict in a product-significant way
- the docs leave room for multiple product meanings
- the fix is risky and effectively irreversible without approval
- the reviewer evidence is too weak to prove the intended behavior

When auto-fix is unsafe, keep the issue in the final report instead of guessing.

### Step 6: Hand validated issues to a Fixer Mate

The fixer mate should receive a **curated fix backlog**, not a vague instruction like "please fix review comments".

Each handoff item should contain:

- title
- classification: `spec-gap` / `plan-gap` / `risk`
- why it matters
- required outcome
- allowed code scope
- constraints or non-goals
- any required verification after the fix

Good handoff:

- "Spec requires titlebar actions to remain visible in compact mode; current render path hides them behind `isSidebarCollapsed`. Restore visibility without changing unrelated layout tokens. Verify the compact-mode branch and affected styles."

Bad handoff:

- "Please look into the titlebar issue from the review."

### Step 7: Verify after repair

After the fixer mate completes changes, the lead verifies the original issue is actually resolved.

Minimum expectations:

- re-read the changed files
- confirm the new code matches the intended fix direction
- run targeted checks that fit the touched scope when practical
- confirm the finding status moved from `partial` or `missing` to `landed`, or document why it did not
- record any residual risk or unverified behavior honestly

Do not claim full acceptance if only the code shape changed but the required behavior remains unproven.

## Reviewer output format

Ask each reviewer to return this exact structure:

```text
1. Verdict: pass / pass-with-risks / fail
2. Acceptance mapping:
   - requirement or plan item
   - status: landed / partial / missing / unclear
   - evidence
3. Findings:
   - [severity] title
   - why it matters
   - classification: spec-gap / plan-gap / risk
   - repair direction
4. Open questions
5. What looks good
```

This format forces reviewers to prove what is real, not only list complaints.

## Fixer Mate output format

Ask each fixer to return:

```text
1. Backlog items addressed
2. Files changed
3. What was fixed
4. What could not be fixed and why
5. Verification performed
6. Residual risk
```

## Lead synthesis rules

1. Findings come before celebration.
2. Prefer proven user-visible correctness over plan aesthetics when they conflict.
3. Do not mark a plan item as landed merely because similarly named code exists.
4. Missing verification promised by the plan is itself a meaningful finding when it weakens confidence.
5. Merge duplicate reviewer findings into one validated backlog item.
6. A fixer mate should receive concrete outcomes, boundaries, and evidence.
7. Move from validated finding to repair quickly when the correct change is clear.
8. Leave issues unresolved only when ambiguity or risk genuinely justifies it.

## Final answer format

Use a concise execution report in this order:

### Scope

- spec path(s)
- plan path(s)
- code scope reviewed

### Findings

- issue title
- status: `partial` / `missing` / `unclear`
- classification: `spec-gap` / `plan-gap` / `risk`
- why it matters

### Fixed

- which validated findings were repaired
- what changed to resolve them

### Remaining

- unresolved issues, if any
- why they were not auto-fixed

### Verification

- what was checked after fixes
- what is still not fully verified

### Assumptions

- inferred spec / plan paths
- scope assumptions
- product assumptions made during fixes

If no substantive issues are found, say so explicitly and briefly explain why the implementation appears genuinely landed.

## Reviewer spawn prompt template

```text
You are the [ROLE] on a spec + plan acceptance team.

Goal:
Verify whether the spec and implementation plan are real in code, not just documented.

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
- For each major requirement or plan item you inspect, classify it as landed / partial / missing / unclear.
- Prefer concrete mismatches, missing wiring, missing verification, and regressions over style nits.
- Keep role boundaries tight; do not redo another teammate's lane.
- If there are no substantive findings, say "No findings" explicitly.
- Suggest repair direction, not just criticism.
- Cite evidence with file paths and symbols where possible.

Return exactly:
1. Verdict: pass / pass-with-risks / fail
2. Acceptance mapping:
   - requirement or plan item
   - status: landed / partial / missing / unclear
   - evidence
3. Findings:
   - [severity] title
   - why it matters
   - classification: spec-gap / plan-gap / risk
   - repair direction
4. Open questions
5. What looks good
```

## Fixer Mate spawn prompt template

```text
You are the Fixer Mate on a spec + plan acceptance team.

Goal:
Repair only the validated backlog items provided by the lead, keep changes coherent, and verify that each repaired issue is actually resolved.

Inputs:
- Spec: <path(s)>
- Plan: <path(s)>
- Validated fix backlog:
  - <item 1>
  - <item 2>
- Allowed code scope: <path(s)>

Rules:
- Do not redefine requirements; follow the validated backlog.
- If a backlog item is ambiguous in a product-significant way, stop and report it instead of guessing.
- Keep edits within the allowed scope unless the fix clearly requires a small adjacent change.
- After editing, verify each backlog item against the intended outcome.
- Report anything intentionally not fixed.

Return exactly:
1. Backlog items addressed
2. Files changed
3. What was fixed
4. What could not be fixed and why
5. Verification performed
6. Residual risk
```

## Heuristics that improve signal

- A requirement is not "done" until you can point to code and explain how it satisfies the behavior.
- A plan step is not "done" until the intended wiring, boundaries, or verification really exist.
- Missing tests are not always a bug, but missing verification promised by the plan is a real acceptance signal.
- A good reviewer reduces uncertainty; a good fixer reduces the backlog.
- For small changes, restraint is part of quality: use the lightest workflow that still proves reality.

## Example trigger phrases

This skill should activate for prompts like:

- "我采取 specs + plan 开发，plan 做完后帮我 review 并直接修复"
- "按 spec 和 implementation plan 做一次 Agent Team 验收，有问题直接改"
- "检查这次改动是不是把 spec 和 plan 真正落地成代码了，不符合就修掉"
- "用 agent team 验证 spec/plan 是否真实落地，收集问题后交给 fixer mate 处理"
- "这个功能做完了，检查是否符合 docs/superpowers/specs 和 plans，不符合就修掉"
