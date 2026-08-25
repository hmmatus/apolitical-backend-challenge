---
name: generate-crud
description: End-to-end workflow for adding a new CRUD module in this repo, chaining the reader, tester, and crud-generator agents with a human plan-approval gate in between. Use when the user asks to "generate a new CRUD", "add CRUD for <entity>", or "build the <feature> feature" and wants the full pipeline run, not just one agent invoked manually.
---

# generate-crud

Orchestrates the three project agents (`reader`, `tester`, `crud-generator`)
around one required checkpoint: **the human must approve the plan before any
test or implementation file is written.** This skill is followed by the
orchestrating conversation itself (the agents don't call each other) —
launch one `Agent` call, wait for its completion notification, act on the
result, then launch the next.

```
request
  → reader (plan or questions)
      ↺ clarify / revise until approved   [human gate]
  → tester, write mode      (tests, before implementation exists)
  → crud-generator          (implement)
  → tester, run mode        (verify)
  → report result
```

## Steps

### 1. Kick off `reader`

Launch `Agent({ subagent_type: "reader", prompt: "<the user's request>" })`.
Wait for its notification. Two possible outcomes:

- **Clarifying questions** — relay them to the user (use `AskUserQuestion`
  if they're multiple-choice-shaped, otherwise ask directly in chat).
  Once answered, re-launch `reader` with the original request plus the
  answers appended. Repeat until `reader` returns a plan file path instead
  of questions.
- **Plan file path** (`docs/plans/<feature>.md`) — go to step 2.

### 2. Plan approval gate (loop until approved)

1. Read the plan file and summarize it for the user in chat (scope,
   business rules, API surface, test spec) — don't just paste the raw file.
2. Ask for approval with `AskUserQuestion`:
   - Option: "Approve" — proceed to step 3.
   - Option: "Request changes" — ask the user in plain chat what to change,
     then re-launch `reader` with the original request + the plan file path
     + the requested changes, and go back to step 2.1 with the revised plan.

**Never proceed past this gate without an explicit "Approve."** This is the
one hard checkpoint in the pipeline — everything before it can loop
indefinitely, nothing after it starts until the user says yes.

### 3. `tester`, write mode

Launch `Agent({ subagent_type: "tester", prompt: "write tests for docs/plans/<feature>.md" })`.
Wait for completion. These tests are expected to fail or fail to compile —
the module doesn't exist yet. Report which test files were created and
which plan scenarios they cover; don't treat red tests as a problem here.

### 4. `crud-generator`

Launch `Agent({ subagent_type: "crud-generator", prompt: "implement <entity> per docs/plans/<feature>.md" })`.
Wait for completion. Report the files it created/edited.

### 5. `tester`, run mode

Launch `Agent({ subagent_type: "tester", prompt: "run tests for <entity>" })`.
Wait for completion.

- **All pass** — report success to the user with a summary of what was
  built (plan → tests → implementation → green suite).
- **Failures** — report the specific failures to the user (assertion vs.
  expected, or compile errors indicating a plan/implementation mismatch)
  and ask via `AskUserQuestion` whether to let `crud-generator` attempt one
  fix pass (re-launch it with the failure details in the prompt, then
  re-run `tester` in run mode once more) or stop here for manual
  intervention. Only one automatic retry — don't loop fix attempts
  indefinitely.

## Notes

- Each `Agent` launch in this pipeline is sequential and blocking on its
  result (later steps depend on earlier output) — never launch the next
  step in parallel with the previous one.
- Don't read an agent's task output file directly; wait for its completion
  notification as usual.
- If the request implies a schema change (`reader` will flag this in its
  questions or plan), that's a manual edit to `src/db/schema.ts` + a
  `pnpm db:generate`/`pnpm db:migrate` step for the human to confirm before
  this pipeline continues — none of the three agents modify the schema.
