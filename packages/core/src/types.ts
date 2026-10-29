export type ChatChannel = "whatsapp" | "telegram";

export type MediaKind = "image" | "video" | "audio" | "document";
export type SlotValueSource = "user" | "memory" | "inference" | "tool";
export type ConversationTopicStatus = "active" | "suspended" | "completed";
export type ConversationTaskStatus = "active" | "suspended" | "completed";

export interface IncomingMedia {
  kind: MediaKind;
  mimeType?: string;
  fileName?: string;
  url?: string;
  buffer?: Uint8Array;
  caption?: string;
}

export interface IncomingMessage {
  id: string;
  channel: ChatChannel;
  tenantId?: string;
  userId: string;
  chatId: string;
  text?: string;
  media?: IncomingMedia[];
  receivedAt: Date;
  raw?: unknown;
}

export interface SellerMemory {
  businessName?: string;
  contact?: string;
  location?: string;
  preferredStyles?: string[];
  preferredPlatforms?: string[];
  brandColors?: string[];
  audienceNotes?: string[];
  language?: string;
}

export interface SlotValue<TValue = unknown> {
  value?: TValue;
  source: SlotValueSource;
  confidence?: number;
  updatedAt: string;
  confirmed?: boolean;
}

export interface ReadinessState {
  action: string;
  ready: boolean;
  requiredSlots: string[];
  missingSlots: string[];
  ambiguousSlots: string[];
  nextQuestion?: string;
  reason?: string;
}

export interface ConversationTopicState {
  id: string;
  status: ConversationTopicStatus;
  updatedAt: string;
  parentTopicId?: string;
}

export interface ConversationTaskState {
  id: string;
  status: ConversationTaskStatus;
  updatedAt: string;
  agentId?: string;
  topicId?: string;
  slotValues?: Record<string, SlotValue>;
}

export interface SelectedContextState {
  kind: string;
  id: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationCheckpoint {
  at: string;
  summary?: string;
  taskId?: string;
  topicId?: string;
  readiness?: ReadinessState;
}

export interface ConversationRuntimeState {
  activeAgentId?: string;
  activeTopic?: ConversationTopicState;
  topicStack?: ConversationTopicState[];
  activeTaskId?: string;
  tasks?: Record<string, ConversationTaskState>;
  suspendedTaskIds?: string[];
  selectedContext?: SelectedContextState;
  readiness?: ReadinessState;
  checkpoints?: ConversationCheckpoint[];
  askedQuestions?: string[];
  pendingActions?: string[];
}

export interface ConversationMemory {
  shortTerm: Record<string, unknown>;
  longTerm?: SellerMemory;
  runtime?: ConversationRuntimeState;
}

export interface OutgoingMessage {
  channel: ChatChannel;
  chatId: string;
  text?: string;
  media?: {
    kind: MediaKind;
    buffer?: Uint8Array;
    bufferBase64?: string;
    url?: string;
    mimeType?: string;
    fileName?: string;
    caption?: string;
  }[];
}

export type AgentAction =
  | { type: "reply"; message: OutgoingMessage }
  | { type: "enqueueJob"; job: JobRequest }
  | { type: "statePatch"; patch: Record<string, unknown> }
  | { type: "runtimePatch"; patch: Partial<ConversationRuntimeState> }
  | { type: "remember"; memory: Partial<SellerMemory> };

export interface AgentResult {
  actions: AgentAction[];
}

export interface AgentInput {
  message: IncomingMessage;
  state: Record<string, unknown>;
  runtime: ConversationRuntimeState;
  memory?: ConversationMemory;
}

export interface AgentModule {
  id: string;
  handle(input: AgentInput): Promise<AgentResult>;
}

export type JobName =
  | "seller.analyzeProduct"
  | "seller.generatePreview"
  | "seller.generateFinalPack"
  | "seller.generateVideoClip"
  | "chat.deliverMessage";

export interface JobRequest<TPayload = Record<string, unknown>> {
  name: JobName;
  payload: TPayload;
}

export interface DeliverMessageJobPayload {
  message: OutgoingMessage;
}

export type GenerationQuality = "draft" | "final";

export type AiTask =
  | "chat"
  | "vision"
  | "background-removal"
  | "image-edit"
  | "layout"
  | "video"
  | "translation"
  | "voice";
