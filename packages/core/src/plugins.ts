import type { AgentInput, AgentResult, ReadinessState } from "./types.js";

export interface AgentCapability {
  kind: string;
  action: string;
}

export interface AgentSchema {
  topics?: string[];
  slotNames?: string[];
  actions?: string[];
  capabilities?: AgentCapability[];
}

export interface AgentPlugin {
  id: string;
  canHandle(input: AgentInput): Promise<boolean> | boolean;
  handle(input: AgentInput): Promise<AgentResult>;
  defineSchema?(): AgentSchema;
  checkReadiness?(input: AgentInput): Promise<ReadinessState> | ReadinessState;
}
