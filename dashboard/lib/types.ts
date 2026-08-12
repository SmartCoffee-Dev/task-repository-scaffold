import type {
  DefinitionItemType,
  DefinitionItemSource,
  DefinitionItemStatus,
  ExampleType,
  ResponseType,
  TaskStatus,
} from "./types";

export type {
  DefinitionItemType,
  DefinitionItemSource,
  DefinitionItemStatus,
  ExampleType,
  ResponseType,
  TaskStatus,
};

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

export interface SpecDetail extends Spec {
  currentRevision: SpecRevision | null;
  definitionItems: DefinitionItemWithResponses[];
}

export interface SpecListFilters {
  type?: DefinitionItemType;
  source?: DefinitionItemSource;
}

export interface DefinitionItemFilters {
  type?: DefinitionItemType;
  source?: DefinitionItemSource;
  status?: DefinitionItemStatus;
}

export interface DefinitionStatusRow {
  spec_id: number;
  definition_status: "draft" | "defined";
}