import type { ConversationRuntimeState } from "@intelli-wha/core";

export const RUNTIME_STATE_KEY = "__runtime";

export function splitRuntimeState(state: Record<string, unknown>) {
  const runtime = normalizeRuntimeState(state[RUNTIME_STATE_KEY]);
  const shortTerm = { ...state };
  delete shortTerm[RUNTIME_STATE_KEY];
  return { runtime, shortTerm };
}

export function buildStoredState(
  shortTermState: Record<string, unknown>,
  runtimePatch: Partial<ConversationRuntimeState> | undefined,
  currentRuntime: ConversationRuntimeState
) {
  if (!runtimePatch) return shortTermState;
  return {
    ...shortTermState,
    [RUNTIME_STATE_KEY]: mergeRuntimeState(currentRuntime, runtimePatch)
  };
}

export function mergeRuntimeState(
  current: ConversationRuntimeState,
  patch: Partial<ConversationRuntimeState>
): ConversationRuntimeState {
  return {
    ...current,
    ...patch,
    activeTopic: patch.activeTopic ?? current.activeTopic,
    topicStack: patch.topicStack ?? current.topicStack,
    tasks: patch.tasks ? { ...(current.tasks ?? {}), ...patch.tasks } : current.tasks,
    suspendedTaskIds: patch.suspendedTaskIds ?? current.suspendedTaskIds,
    selectedContext: patch.selectedContext ?? current.selectedContext,
    readiness: patch.readiness ?? current.readiness,
    checkpoints: patch.checkpoints ?? current.checkpoints,
    askedQuestions: patch.askedQuestions ?? current.askedQuestions,
    pendingActions: patch.pendingActions ?? current.pendingActions
  };
}

function normalizeRuntimeState(value: unknown): ConversationRuntimeState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as ConversationRuntimeState;
}
