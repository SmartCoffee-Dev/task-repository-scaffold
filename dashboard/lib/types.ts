export type DefinitionItemType = "clarification" | "tension" | "impact" | "example";

export type DefinitionItemSource = "description" | "spec" | "base_branch";

export type DefinitionItemStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "incorporated";

export type ExampleType = "happy-path" | "edge-case";

export type ResponseType = "answer" | "accept" | "reject" | "observation";

export type TaskStatus = "blocked" | "pending" | "wip" | "in_review" | "done";

export interface Spec {
  id: number;
  title: string;
  slug: string;
  description: string;
  currentRevisionId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SpecRevision {
  id: number;
  specId: number;
  revisionNumber: number;
  content: string;
  createdAt: string;
}

export interface DefinitionItem {
  id: number;
  specId: number;
  type: DefinitionItemType;
  source: DefinitionItemSource;
  title: string;
  description: string;
  question: string | null;
  suggestedResolution: string | null;
  exampleType: ExampleType | null;
  fingerprint: string;
  status: DefinitionItemStatus;
  acceptedRevisionNumber: number;
  incorporatedInRevisionId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface DefinitionResponse {
  id: number;
  definitionItemId: number;
  responseType: ResponseType;
  content: string;
  createdAt: string;
}

export interface Task {
  id: number;
  specId: number;
  title: string;
  description: string;
  status: TaskStatus;
  parentId: number | null;
  branch: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDependency {
  taskId: number;
  requiredTaskId: number;
}

export interface SessionLog {
  id: number;
  taskId: number;
  sessionId: string;
  overview: string;
  takenDecisions: unknown[];
  filesChanged: unknown[];
  createdAt: string;
}

export interface DefinitionItemWithResponses extends DefinitionItem {
  responses: DefinitionResponse[];
}

export interface SpecWithCounts extends Spec {
  pendingItems: number;
  totalItems: number;
  pendingTasks: number;
  totalTasks: number;
}