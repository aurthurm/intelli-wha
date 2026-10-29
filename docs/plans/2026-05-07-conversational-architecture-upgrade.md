# Intelli-Wha Generic Pluggable Agent Runtime Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Upgrade Intelli-Wha from a seller-studio-specific conversational flow into a **generic, pluggable, stateful agent runtime** that can be reused across many chat use cases while keeping seller-studio as the first concrete installed module.

**Architecture:** Build a reusable orchestration core in `packages/chat-runtime` and `packages/core`, then let domain agents plug into it through explicit contracts for perception, slot schemas, readiness rules, planning, execution, memory, and response composition. Keep seller-studio as the anchor implementation, but design the runtime so future modules like shopping assistant, support bot, booking bot, catalog bot, or lead-capture bot can all share the same conversation engine.

**Tech Stack:** TypeScript monorepo, pnpm, Fastify, BullMQ, Redis, Drizzle ORM, PostgreSQL, Sharp, existing AI provider abstractions.

---

## Current grounded baseline

This plan is grounded in the current repo:

- `packages/chat-runtime/src/index.ts`
  - loads short-term state and long-term memory
  - executes actions from a single `AgentModule`
  - has no explicit stages for perception, query rewrite, readiness, or tool governance
- `packages/core/src/types.ts`
  - has messages, seller memory, jobs, agent input/output
  - does not yet model tasks, topic stack, slot state, readiness, tool calls, or pluggable agent capabilities
- `packages/agents/src/index.ts`
  - currently exports only seller-studio
  - there is no registry or installable multi-agent module system yet
- `packages/agents/src/seller-studio/agent.ts`
  - combines parsing, memory extraction, readiness checks, planning, and job enqueueing in one file
- `packages/db/src/schema.ts`
  - stores contacts, conversations, products, assets, generation jobs
  - does not yet store message logs, checkpoints, structured memory facts, or reusable task traces
- `packages/ai/src/router.ts`
  - still chooses the first provider supporting a task rather than routing by complexity/policy

So the main missing piece is not storage or transport. It is the **generic conversation orchestration layer**.

---

## Design direction

The right design is:

- a **generic main bot/runtime**
- plus **pluggable domain agents**
- plus **domain-specific schemas/rules**
- plus **shared memory, readiness, and tool governance**

That means seller-studio should stop being “the bot” and become “one installed agent module”.

---

## Core principles for Intelli-Wha

### 1. Separate understanding from execution
The runtime should first:
- interpret the message
- track topic/task state
- rewrite the request into an internal task object
- check readiness
- then decide whether to ask, retrieve, compare, act, or resume

### 2. Separate session memory from durable profile memory
Do not let temporary campaign choices overwrite stable seller preferences.

Examples:
- “use black and gold for this poster” -> session/task-specific
- “my brand colors are black and gold” -> durable preference
- “this campaign is for a church youth event” -> session/task-specific
- “my default platform is WhatsApp Status” -> durable preference

### 3. Treat the runtime as a state machine with memory
The runtime should explicitly track:
- active topic
- topic stack
- active task id
- suspended tasks
- open slots
- asked questions
- selected asset or selected generated draft
- pending actions
- last readiness state

### 4. Enforce readiness before tool/job execution
No queue job, asset generation, or delivery action should run until the runtime says the task is ready.

### 5. Keep the runtime generic and the agent modules pluggable
The orchestration engine should not be seller-studio-specific.
Seller-studio should plug into a standard contract.

---

## Target architecture

### Shared generic runtime
Build the main reusable runtime around these layers:

1. **Conversation router**
   - identify installed agent or active agent context
2. **Perception layer**
   - classify intent, detect topic, extract entities, detect interruptions, extract memory candidates
3. **State manager**
   - update task stack, topic stack, slot state, selected context
4. **Memory manager**
   - pull durable memory, write promoted facts, keep session memory separate
5. **Query rewrite layer**
   - turn vague chat into a structured internal task object
6. **Readiness engine**
   - determine if enough information exists to call a tool/job or whether a clarification is needed
7. **Planner**
   - decide: ask / retrieve / compare / enqueue / deliver / resume / switch agent
8. **Tool gateway**
   - validate and authorize job/tool calls
9. **Response composer**
   - generate user-facing reply grounded in state and task outcome
10. **Checkpoint / audit layer**
   - log messages, checkpoints, and tool/job decisions

### Pluggable domain agents
Each agent module should provide contracts like:
- slot schema
- topic taxonomy
- readiness rules
- memory promotion rules
- tool definitions
- response composition hints
- optional domain-specific perception helpers

Examples of future modules:
- seller-studio
- shopping-assistant
- support-desk
- booking-agent
- lead-capture
- catalog-publisher

---

## Critical mechanics that must become first-class

### 1. Query rewriting
This should be a standard runtime stage.

Examples:
- “make it more premium” -> update the active seller-studio task with `style=premium`
- “use the same one but for Instagram” -> keep current task, change `platform=social`
- “back to the shoes” -> resume suspended shopping task if another domain module exists later
- “approve that one” -> map to the active generated preview/draft result context

The rewrite output should be a structured task object, not free text.

### 2. Topic and task tracking
Track:
- `activeTopic`
- `topicStack`
- `activeTaskId`
- `suspendedTaskIds`
- `selectedContext`
- `activeAgentId`

This is what makes the runtime reusable across many domains.

### 3. Entity and slot tracking
Every agent module should define its own slot schema, but the slot container should be generic.

Each slot should track:
- value
- source (`user`, `memory`, `inference`, `tool`)
- confidence
- updatedAt
- whether confirmed

Seller-studio slots might include:
- `productImage`
- `price`
- `style`
- `platform`
- `audience`
- `businessName`
- `contact`
- `brandColors`
- `cta`

### 4. Readiness tracking
Before any tool/job call, compute readiness explicitly.

Suggested shape:
```ts
export interface ReadinessState {
  action: string;
  ready: boolean;
  requiredSlots: string[];
  missingSlots: string[];
  ambiguousSlots: string[];
  nextQuestion?: string;
  reason?: string;
}
```

Rules:
- if the task is not clear -> ask
- if required slots are missing -> ask one best question
- if the action is expensive or irreversible -> require confirmation
- if the request can be answered from current context -> do not enqueue a job
- if constraints conflict -> ask before acting

### 5. Clarification policy
Ask the smallest useful question.

Examples for seller-studio:
- image present, no price -> “What price should appear on the poster?”
- style missing but memory has one -> use memory unless the user overrides it
- no platform -> “Is this for WhatsApp Status, group post, or Instagram/Facebook?”
- user says “make it elegant” -> ask only if that is not enough to map to an internal style

### 6. Tool/job argument validation
The runtime should never enqueue raw planner output directly.
It should validate:
- required slots
- job payload schema
- approval requirements
- asset references
- media availability
- platform constraints

### 7. Agent pluggability
A new module should be installable without rewriting the runtime.

A generic contract should support something like:
```ts
export interface AgentPlugin {
  id: string;
  canHandle(input: AgentInput): Promise<boolean> | boolean;
  defineSchema(): AgentSchema;
  perceive(context: RuntimeContext): Promise<PerceptionResult>;
  checkReadiness(context: RuntimeContext): Promise<ReadinessState>;
  plan(context: RuntimeContext): Promise<PlannerDecision>;
  execute(context: RuntimeContext, decision: PlannerDecision): Promise<AgentResult>;
}
```

---

## Implementation roadmap

## Phase 1 — Introduce generic conversation/task state

**Objective:** Replace ad hoc state blobs with reusable runtime state that works for any installed agent.

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/schemas.ts`
- Modify: `packages/chat-runtime/src/index.ts`
- Create: `packages/chat-runtime/src/state.ts`
- Test: `packages/chat-runtime/src/index.test.ts`

**Add:**
- `ConversationTaskState`
- `ConversationTopicState`
- `SlotValue`
- `ReadinessState`
- `PlannerDecision`
- `ConversationCheckpoint`
- `SelectedContextState`

**Verification:**
- runtime stores active task, suspended task, selected context, and readiness result
- old memory separation tests still pass

---

## Phase 2 — Create a generic plugin contract for agents

**Objective:** Make the runtime pluggable so seller-studio becomes one plugin rather than the hard-coded default behavior.

**Files:**
- Modify: `packages/core/src/types.ts`
- Create: `packages/core/src/plugins.ts`
- Modify: `packages/chat-runtime/src/index.ts`
- Create: `packages/chat-runtime/src/registry.ts`
- Modify: `packages/agents/src/index.ts`
- Test: `packages/chat-runtime/src/index.test.ts`

**Add concepts:**
- `AgentPlugin`
- `AgentSchema`
- `AgentCapability`
- `AgentRegistry`
- `activeAgentId`

**Verification:**
- runtime can resolve seller-studio via registry
- a fake second plugin can be registered in tests
- runtime no longer depends on seller-studio-specific logic

---

## Phase 3 — Split seller-studio into plugin stages

**Objective:** Refactor seller-studio to use the generic plugin contract and explicit internal stages.

**Files:**
- Modify: `packages/agents/src/seller-studio/agent.ts`
- Create: `packages/agents/src/seller-studio/schema.ts`
- Create: `packages/agents/src/seller-studio/perception.ts`
- Create: `packages/agents/src/seller-studio/rewrite.ts`
- Create: `packages/agents/src/seller-studio/readiness.ts`
- Create: `packages/agents/src/seller-studio/planner.ts`
- Create: `packages/agents/src/seller-studio/executor.ts`
- Create: `packages/agents/src/seller-studio/questions.ts`
- Test: `packages/agents/src/seller-studio/agent.test.ts`

**Responsibilities:**
- `schema.ts` defines seller-studio slots and task types
- `perception.ts` extracts approval, memory hints, brief fields, topic switches
- `rewrite.ts` converts user text into internal task updates
- `readiness.ts` decides if preview/final generation is ready
- `planner.ts` chooses ask / preview / final / resume / remember
- `executor.ts` produces replies, memory writes, and validated jobs

**Verification:**
- tests cover no image, partial brief, preview-ready, final approval, memory defaults, and resume behavior

---

## Phase 4 — Add a generic readiness engine and clarification rules

**Objective:** Move readiness and question selection into shared runtime concepts reusable by all agents.

**Files:**
- Create: `packages/chat-runtime/src/readiness.ts`
- Create: `packages/chat-runtime/src/questions.ts`
- Modify: `packages/core/src/types.ts`
- Modify: `packages/agents/src/seller-studio/readiness.ts`
- Test: `packages/chat-runtime/src/index.test.ts`

**Shared rules:**
- ask one smallest useful question
- never call a tool/job when required slots are missing
- distinguish missing vs ambiguous vs conflicting slots
- let plugins supply required slot sets per action

**Verification:**
- generic readiness helper works with seller-studio slot requirements
- ambiguous or conflicting state returns a question instead of action execution

---

## Phase 5 — Add a generic query rewrite layer

**Objective:** Make query rewriting a first-class stage for all agents.

**Files:**
- Create: `packages/chat-runtime/src/rewrite.ts`
- Modify: `packages/core/src/types.ts`
- Modify: `packages/agents/src/seller-studio/rewrite.ts`
- Test: `packages/agents/src/seller-studio/agent.test.ts`

**Rewrite examples for seller-studio:**
- “make it bolder” -> update style slot
- “post for WhatsApp status” -> set platform slot
- “use my usual colors” -> pull brand color preference into slot state
- “approve it” -> map to active generated preview task

**Verification:**
- rewrite results are structured task updates, not brittle inline regex decisions scattered across the agent

---

## Phase 6 — Add generic tool/job governance

**Objective:** Introduce a runtime-level gateway that validates and authorizes tool/job execution for all plugins.

**Files:**
- Create: `packages/core/src/tools.ts`
- Create: `packages/chat-runtime/src/tool-gateway.ts`
- Modify: `packages/core/src/types.ts`
- Modify: `packages/agents/src/seller-studio/planner.ts`
- Modify: `packages/queues/src/index.ts`
- Test: `packages/chat-runtime/src/index.test.ts`

**Add concepts:**
- `ToolCallRequest`
- `ToolPolicyDecision`
- `requiresConfirmation`
- `payloadValidation`
- `idempotencyKey`

**Initial wrapped actions:**
- `seller.generatePreview`
- `seller.generateFinalPack`
- `seller.generateVideoClip`
- `chat.deliverMessage`

**Verification:**
- preview blocked when image or required brief slots are missing
- final pack blocked without preview approval
- invalid payloads never reach queue insertion

---

## Phase 7 — Add messages, checkpoints, and structured memory facts in Postgres

**Objective:** Make the runtime inspectable, resumable, and reusable across multiple domains.

**Files:**
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/db/src/index.ts`
- Create: `packages/db/src/migrations/*`
- Modify: `apps/api/src/index.ts`

**Add tables:**
- `messages`
- `conversation_checkpoints`
- `memory_facts`
- optional later: `agent_runs`

**Suggested use:**
- inbound/outbound message logs
- checkpoint after each handled turn
- durable preference facts with confidence and provenance

**Verification:**
- each handled turn records inbound/outbound + checkpoint
- seller preference facts can be promoted without overwriting task-specific state

---

## Phase 8 — Improve memory model for generic runtime reuse

**Objective:** Separate session memory, episodic traces, and durable profile memory so future agents can share the same user context safely.

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `packages/agents/src/seller-studio/perception.ts`
- Create: `packages/chat-runtime/src/memory.ts`

**Memory tiers:**
- session memory -> active tasks, temporary constraints, current draft context
- episodic memory -> previous outcomes, checkpoints, prior generated assets
- semantic memory -> business name, contact, preferred platforms, preferred style, brand colors, language

**Verification:**
- one-off campaign details do not pollute durable memory
- repeated or explicit preferences promote correctly

---

## Phase 9 — Add model routing policy

**Objective:** Turn AI routing into a reusable policy layer for generic runtime stages.

**Files:**
- Modify: `packages/ai/src/router.ts`
- Modify: `packages/ai/src/types.ts`
- Create: `packages/ai/src/policies.ts`

**Routing policy v1:**
- cheap model -> classification, slot extraction, rewrite helpers
- medium model -> clarification generation, normal planning
- strong model -> conflict resolution, complex synthesis, multi-step domain reasoning

**Verification:**
- routing decision is based on runtime task type and complexity rather than first supporting provider

---

## Phase 10 — Prepare additional example plugins

**Objective:** Prove that the runtime is truly generic by adding lightweight second/third plugin skeletons.

**Files:**
- Create: `packages/agents/src/catalog-assistant/*`
- Create: `packages/agents/src/lead-capture/*`
- Modify: `packages/agents/src/index.ts`
- Test: `packages/chat-runtime/src/index.test.ts`

**Goal:**
- seller-studio remains the main working module
- but the runtime demonstrates real plug-in extensibility

**Verification:**
- tests can switch installed plugin by message or explicit config
- runtime stays unchanged while new plugin logic is added

---

## Recommended execution order

1. Phase 1 — generic conversation/task state
2. Phase 2 — plugin contract and registry
3. Phase 3 — seller-studio refactor into plugin stages
4. Phase 4 — readiness engine
5. Phase 5 — query rewrite layer
6. Phase 6 — tool/job governance
7. Phase 7 — messages/checkpoints/memory facts
8. Phase 8 — memory tier separation
9. Phase 9 — model routing policy
10. Phase 10 — second plugin skeletons

---

## What to build first

If implementing one serious improvement now, start with:

## Phase 1 + Phase 2

**Build a generic pluggable runtime contract before deepening seller-studio.**

Why:
- avoids baking seller-studio assumptions deeper into the runtime
- creates the reusable contract once
- makes every later improvement portable across future bots/modules
- gives Intelli-Wha a real “main bot is generic” spine

---

## Definition of done for the first meaningful upgrade

The first upgrade is successful when:
- runtime stores explicit task/topic/readiness state
- runtime resolves plugins through a registry instead of a single hardcoded module pattern
- seller-studio can run through the plugin contract
- runtime can register a second fake plugin in tests
- seller-studio no longer owns core orchestration assumptions

---

## Final recommendation

Intelli-Wha should become:

- **one generic conversation runtime**
- **many pluggable domain agents**
- **shared memory/readiness/tool governance**
- **shared message/checkpoint/audit backbone**

Seller-studio should remain the first flagship module, but not the shape of the whole system.
