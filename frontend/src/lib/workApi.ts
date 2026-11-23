/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

import { api } from "@/lib/api";

export type AssignmentStrategy = "manual" | "round_robin" | "least_loaded" | "skill_based";
export type SlaState = "ok" | "at_risk" | "breached" | "paused";

export interface WorkItem {
  kind: "ticket" | "task" | "approval";
  id: string;
  ref: string;
  title: string;
  status: string;
  priority: string;
  category?: string | null;
  sla_state: SlaState;
  due_at?: string | null;
  bucket: "overdue" | "today" | "this_week" | "later";
  relationship: string;
  team_id?: string | null;
  assignee_id?: string | null;
  ticket_id?: string | null;
  related_ticket_id?: string | null;
  url: string;
  created_at?: string | null;
}

export interface MyWorkResponse {
  items: WorkItem[];
  grouped: {
    overdue: WorkItem[];
    today: WorkItem[];
    this_week: WorkItem[];
    later: WorkItem[];
  };
  counts: {
    total: number;
    overdue: number;
    today: number;
    this_week: number;
    later: number;
    tickets: number;
    tasks: number;
    approvals: number;
    sla_breached: number;
    sla_at_risk: number;
  };
  total: number;
  limit: number;
  offset: number;
  permissions: string[];
}

export interface TeamItem {
  id: string;
  company_id: string;
  branch_id?: string | null;
  name: string;
  description?: string | null;
  default_strategy: AssignmentStrategy;
  is_active: boolean;
  lead_user_id?: string | null;
  lead_user_name?: string | null;
  member_count: number;
}

export interface TeamMemberItem {
  id: string;
  team_id: string;
  user_id: string;
  username?: string | null;
  full_name?: string | null;
  email?: string | null;
  skills: string[];
  max_open_items: number;
  is_available: boolean;
  weight: number;
  open_count: number;
  is_eligible: boolean;
  ineligible_reason?: string | null;
  last_assigned_at?: string | null;
}

export interface AssignmentRuleItem {
  id: string;
  entity_type: "ticket" | "task";
  position: number;
  name: string;
  conditions: Record<string, unknown>;
  team_id: string;
  team_name?: string | null;
  strategy?: AssignmentStrategy | null;
  is_active: boolean;
  stop_on_match: boolean;
}

export interface DryRunResult {
  matched_rule_id?: string | null;
  matched_rule_name?: string | null;
  team_id?: string | null;
  team_name?: string | null;
  strategy_used: string;
  assignee_user_id?: string | null;
  assignee_name?: string | null;
  reason: string;
  trace: {
    rule_id: string;
    rule_name: string;
    position: number;
    matched: boolean;
    stopped: boolean;
    team_id: string;
    strategy?: string | null;
  }[];
  candidates: {
    user_id: string;
    username: string;
    skills: string[];
    open_count: number;
    max_open_items: number;
    weight: number;
    is_available: boolean;
    is_eligible: boolean;
    ineligible_reason?: string | null;
  }[];
}

export interface SlaPolicyItem {
  id: string;
  name: string;
  priority: string;
  first_response_minutes: number;
  resolution_minutes: number;
  escalation_notify_minutes: number;
  business_hours_only: boolean;
  business_hours: {
    timezone: string;
    working_days: string[];
    start: string;
    end: string;
    holidays?: string[];
  };
  is_default: boolean;
  escalate_on_breach: boolean;
  bump_priority_on_breach: boolean;
  is_active: boolean;
}

export interface WorkflowTransitionItem {
  id: string;
  entity_type: "ticket" | "task";
  from_status: string;
  to_status: string;
  required_permission?: string | null;
  requires_comment: boolean;
  is_active: boolean;
}

export interface TicketCategoryItem {
  id: string;
  name: string;
  name_ar?: string | null;
  description?: string | null;
  default_priority: string;
  default_team_id?: string | null;
  default_team_name?: string | null;
  required_skills: string[];
  is_active: boolean;
}

export interface MacroItem {
  id: string;
  title: string;
  body: string;
  visibility: "public" | "internal";
  is_shared: boolean;
  created_by_id?: string | null;
}

export interface SavedViewItem {
  id: string;
  scope: "tickets" | "tasks" | "my_work";
  name: string;
  filters: Record<string, unknown>;
  sort: Record<string, unknown>;
  columns: string[];
  is_shared: boolean;
}

export interface TicketEventItem {
  id: string;
  ticket_id: string;
  actor_id?: string | null;
  actor_name?: string | null;
  kind: string;
  payload: Record<string, unknown>;
  visibility: "public" | "internal";
  created_at: string;
}

export interface TicketInboxItem {
  id: string;
  ticket_number: string;
  issue_title: string;
  issue_description: string;
  priority: string;
  status: string;
  category: string;
  team_id?: string | null;
  team_name?: string | null;
  requester_name?: string | null;
  assigned_technician_id?: string | null;
  assigned_technician_name?: string | null;
  sla_state: SlaState;
  first_response_due_at?: string | null;
  resolution_due_at?: string | null;
  merged_into_ticket_id?: string | null;
  require_tasks_done_to_close?: boolean;
  comments_count: number;
  watchers_count?: number;
  linked_tasks_count?: number;
  created_at: string;
}

export interface TicketInboxDetail extends TicketInboxItem {
  requester_email?: string | null;
  notes?: string | null;
  linked_tasks?: {
    id: string;
    title: string;
    status: string;
    priority: string;
    assignee_id?: string | null;
    assigned_to_name?: string | null;
    due_date?: string | null;
  }[];
  watchers?: { user_id: string; username?: string | null; full_name?: string | null }[];
  allowed_transitions?: { to_status: string; requires_comment: boolean; required_permission?: string | null }[];
}

export interface WorkloadResponse {
  teams: {
    team_id: string;
    name: string;
    default_strategy: string;
    open_tickets: number;
    unassigned_tickets: number;
    open_tasks: number;
    unassigned_tasks: number;
    breached_tickets: number;
  }[];
  technicians: {
    user_id: string;
    username: string;
    full_name: string;
    team_ids: string[];
    skills: string[];
    open_tickets: number;
    open_tasks: number;
    total_open: number;
    overdue_count: number;
    sla_breached_count: number;
    max_open_items: number;
    utilization_pct: number;
    is_available: boolean;
    on_leave: boolean;
    avg_resolution_hours_30d?: number | null;
  }[];
  unassigned_tickets_total: number;
  unassigned_tasks_total: number;
}

export interface HelpDeskSlaReport {
  window_days: number;
  summary: {
    total_tickets: number;
    open_tickets: number;
    open_tasks: number;
    breached_tickets: number;
    at_risk_tickets: number;
    sla_compliance_pct: number;
    avg_first_response_minutes?: number | null;
    avg_resolution_hours?: number | null;
  };
  backlog_aging: { lt_24h: number; d1_3: number; d3_7: number; gt_7d: number };
  by_priority: Record<string, { total: number; breached: number; resolved: number }>;
  team_workload: {
    team_id: string;
    team_name: string;
    open_tickets: number;
    open_tasks: number;
    breached_tickets: number;
  }[];
}

export interface TaskChecklistItem {
  id: string;
  task_id?: string;
  title: string;
  is_completed: boolean;
  position: number;
  completed_at?: string | null;
}

export function makeIdempotencyKey(prefix: string): Record<string, string> {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return { "Idempotency-Key": `${prefix}-${rand}` };
}

export const workApi = {
  // My Work & Workload
  getMyWork: (params?: Record<string, string | number | boolean | null | undefined>) =>
    api.get<MyWorkResponse>("/me/work", { params }),
  getWorkload: (teamId?: string) =>
    api.get<WorkloadResponse>("/workload", { params: teamId ? { team_id: teamId } : undefined }),

  // Teams & Members
  listTeams: (includeInactive = false) =>
    api.get<TeamItem[]>("/teams", { params: { include_inactive: includeInactive } }),
  createTeam: (body: Partial<TeamItem>) => api.post<TeamItem>("/teams", body),
  updateTeam: (id: string, body: Partial<TeamItem>) => api.patch<TeamItem>(`/teams/${id}`, body),
  deleteTeam: (id: string) => api.delete(`/teams/${id}`),
  listTeamMembers: (teamId: string) => api.get<TeamMemberItem[]>(`/teams/${teamId}/members`),
  upsertTeamMember: (
    teamId: string,
    body: { user_id: string; skills: string[]; max_open_items: number; is_available: boolean; weight: number }
  ) => api.post(`/teams/${teamId}/members`, body),
  updateTeamMember: (
    teamId: string,
    memberId: string,
    body: Partial<{ skills: string[]; max_open_items: number; is_available: boolean; weight: number }>
  ) => api.patch(`/teams/${teamId}/members/${memberId}`, body),
  removeTeamMember: (teamId: string, memberId: string) => api.delete(`/teams/${teamId}/members/${memberId}`),

  // Assignment Rules
  listRules: (entityType?: "ticket" | "task") =>
    api.get<AssignmentRuleItem[]>("/assignment-rules", {
      params: entityType ? { entity_type: entityType } : undefined,
    }),
  createRule: (body: Record<string, unknown>) => api.post<AssignmentRuleItem>("/assignment-rules", body),
  updateRule: (id: string, body: Record<string, unknown>) =>
    api.patch<AssignmentRuleItem>(`/assignment-rules/${id}`, body),
  deleteRule: (id: string) => api.delete(`/assignment-rules/${id}`),
  reorderRules: (entity_type: "ticket" | "task", rule_ids: string[]) =>
    api.post("/assignment-rules/reorder", { entity_type, rule_ids }),
  dryRunRules: (body: Record<string, unknown>) => api.post<DryRunResult>("/assignment-rules/dry-run", body),

  // SLA Policies
  listSlaPolicies: (includeInactive = false) =>
    api.get<SlaPolicyItem[]>("/sla-policies", { params: { include_inactive: includeInactive } }),
  createSlaPolicy: (body: Record<string, unknown>) => api.post<SlaPolicyItem>("/sla-policies", body),
  updateSlaPolicy: (id: string, body: Record<string, unknown>) =>
    api.patch<SlaPolicyItem>(`/sla-policies/${id}`, body),
  deleteSlaPolicy: (id: string) => api.delete(`/sla-policies/${id}`),
  runSlaEscalationNow: () => api.post<Record<string, unknown>>("/system/run-sla-escalation"),

  // Workflows, Categories, Macros, Saved Views
  listWorkflowTransitions: (entityType?: "ticket" | "task") =>
    api.get<WorkflowTransitionItem[]>("/workflows/transitions", {
      params: entityType ? { entity_type: entityType } : undefined,
    }),
  createWorkflowTransition: (body: Record<string, unknown>) =>
    api.post<WorkflowTransitionItem>("/workflows/transitions", body),
  updateWorkflowTransition: (id: string, body: Record<string, unknown>) =>
    api.patch<WorkflowTransitionItem>(`/workflows/transitions/${id}`, body),
  deleteWorkflowTransition: (id: string) => api.delete(`/workflows/transitions/${id}`),

  listCategories: () => api.get<TicketCategoryItem[]>("/ticket-categories"),
  createCategory: (body: Record<string, unknown>) => api.post<TicketCategoryItem>("/ticket-categories", body),
  updateCategory: (id: string, body: Record<string, unknown>) =>
    api.patch<TicketCategoryItem>(`/ticket-categories/${id}`, body),
  deleteCategory: (id: string) => api.delete(`/ticket-categories/${id}`),

  listMacros: () => api.get<MacroItem[]>("/macros"),
  createMacro: (body: Record<string, unknown>) => api.post<MacroItem>("/macros", body),
  updateMacro: (id: string, body: Record<string, unknown>) => api.patch<MacroItem>(`/macros/${id}`, body),
  deleteMacro: (id: string) => api.delete(`/macros/${id}`),

  listSavedViews: (scope?: "tickets" | "tasks" | "my_work") =>
    api.get<SavedViewItem[]>("/saved-views", { params: scope ? { scope } : undefined }),
  createSavedView: (body: Record<string, unknown>) => api.post<SavedViewItem>("/saved-views", body),
  deleteSavedView: (id: string) => api.delete(`/saved-views/${id}`),

  // Ticket Operations
  listTickets: (params?: Record<string, string | number | boolean | null | undefined>) =>
    api.get<TicketInboxItem[]>("/tickets", { params }),
  getTicket: (id: string) => api.get<TicketInboxDetail>(`/tickets/${id}`),
  listTicketEvents: (id: string) => api.get<TicketEventItem[]>(`/tickets/${id}/events`),
  postTicketEvent: (
    id: string,
    body: { content?: string; visibility: "public" | "internal"; macro_id?: string | null }
  ) => api.post<TicketEventItem>(`/tickets/${id}/events`, body, makeIdempotencyKey("tck-ev")),
  assignTicket: (
    id: string,
    body: { team_id?: string | null; assignee_id?: string | null; auto_assign?: boolean; clear_assignee?: boolean; reason?: string }
  ) => api.post(`/tickets/${id}/assign`, body, makeIdempotencyKey("tck-asgn")),
  transitionTicket: (id: string, body: { to_status: string; comment?: string; visibility?: "public" | "internal" }) =>
    api.post(`/tickets/${id}/transition`, body, makeIdempotencyKey("tck-tr")),
  bulkTickets: (body: Record<string, unknown>) =>
    api.post<{ succeeded: string[]; failed: { id: string; error: unknown }[]; succeeded_count: number; failed_count: number }>(
      "/tickets/bulk",
      body,
      makeIdempotencyKey("tck-bulk")
    ),
  mergeTicket: (id: string, target_ticket_id: string, comment?: string) =>
    api.post(`/tickets/${id}/merge`, { target_ticket_id, comment }),
  createTaskFromTicket: (id: string, body: Record<string, unknown>) =>
    api.post(`/tickets/${id}/tasks`, body, makeIdempotencyKey("tck-task")),
  watchTicket: (id: string, user_id?: string) => api.post(`/tickets/${id}/watchers`, user_id ? { user_id } : {}),
  unwatchTicket: (id: string, userId: string) => api.delete(`/tickets/${id}/watchers/${userId}`),

  // Task Operations
  assignTask: (
    id: string,
    body: { team_id?: string | null; assignee_id?: string | null; employee_id?: string | null; auto_assign?: boolean }
  ) => api.post(`/tasks/${id}/assign`, body, makeIdempotencyKey("tsk-asgn")),
  transitionTask: (id: string, body: { to_status: string; comment?: string }) =>
    api.post(`/tasks/${id}/transition`, body, makeIdempotencyKey("tsk-tr")),
  bulkTasks: (body: Record<string, unknown>) =>
    api.post<{ succeeded: string[]; failed: { id: string; error: unknown }[]; succeeded_count: number; failed_count: number }>(
      "/tasks/bulk",
      body,
      makeIdempotencyKey("tsk-bulk")
    ),
  listChecklist: (taskId: string) => api.get<TaskChecklistItem[]>(`/tasks/${taskId}/checklist`),
  addChecklistItem: (taskId: string, title: string) => api.post<TaskChecklistItem>(`/tasks/${taskId}/checklist`, { title }),
  updateChecklistItem: (taskId: string, itemId: string, body: Partial<{ title: string; is_completed: boolean }>) =>
    api.patch<TaskChecklistItem>(`/tasks/${taskId}/checklist/${itemId}`, body),
  deleteChecklistItem: (taskId: string, itemId: string) => api.delete(`/tasks/${taskId}/checklist/${itemId}`),

  // Reports
  getHelpDeskSlaReport: (days = 30) => api.get<HelpDeskSlaReport>("/reports/helpdesk-sla", { params: { days } }),
};
