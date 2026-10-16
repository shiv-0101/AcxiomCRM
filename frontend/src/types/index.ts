// User & Auth types
export interface User {
  userId: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'Admin' | 'Manager' | 'SalesExecutive';
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

// Customer types
export interface Customer {
  customer_id: string;
  customer_code: string;
  customer_name: string;
  email: string;
  phone: string;
  company_name?: string;
  address?: string;
  city?: string;
  state?: string;
  status: 'Active' | 'Inactive' | 'Prospect';
  owner_id?: string;
  owner_name?: string;
  notes?: string;
  created_date: string;
  modified_date: string;
}

// Lead types
export type LeadStatus = 'New' | 'Contacted' | 'Qualified' | 'Unqualified' | 'Converted' | 'Lost';
export type LeadPriority = 'Low' | 'Medium' | 'High';
export type LeadSource = 'Website' | 'Referral' | 'Cold Call' | 'Email' | 'LinkedIn' | 'Trade Show' | 'Other';

export interface Lead {
  lead_id: string;
  lead_code: string;
  lead_name: string;
  email?: string;
  phone?: string;
  company_name?: string;
  source?: LeadSource;
  status: LeadStatus;
  priority: LeadPriority;
  expected_value: number;
  assigned_to?: string;
  assigned_name?: string;
  notes?: string;
  converted_customer_id?: string;
  converted_date?: string;
  created_date: string;
  modified_date: string;
}

// Opportunity types
export type OppStage = 'Qualification' | 'Proposal' | 'Negotiation' | 'Won' | 'Lost';
export type OppStatus = 'Open' | 'Won' | 'Lost' | 'Cancelled';

export interface Opportunity {
  opportunity_id: string;
  opportunity_name: string;
  customer_id?: string;
  customer_name?: string;
  lead_id?: string;
  amount: number;
  stage: OppStage;
  probability: number;
  expected_close_date: string;
  status: OppStatus;
  source?: string;
  notes?: string;
  assigned_to?: string;
  assigned_name?: string;
  weighted_value?: number;
  created_date: string;
  modified_date: string;
}

// Follow-Up types
export type FollowUpStatus = 'Planned' | 'Completed' | 'Missed' | 'Cancelled';
export type FollowUpType = 'Call' | 'Meeting' | 'Email' | 'Task';

export interface FollowUp {
  follow_up_id: string;
  customer_id?: string;
  customer_name?: string;
  lead_id?: string;
  lead_name?: string;
  opportunity_id?: string;
  follow_up_date: string;
  follow_up_type: FollowUpType;
  subject: string;
  remarks?: string;
  status: FollowUpStatus;
  assigned_to?: string;
  assigned_name?: string;
  is_overdue?: number;
  created_date: string;
}

// Activity types
export interface Activity {
  activity_id: string;
  activity_type: 'Call' | 'Meeting' | 'Email' | 'Task';
  subject: string;
  description?: string;
  activity_date: string;
  customer_id?: string;
  customer_name?: string;
  lead_id?: string;
  lead_name?: string;
  assigned_to?: string;
  assigned_name?: string;
  status: 'Planned' | 'Completed' | 'Cancelled';
  created_date: string;
}

// Audit Log
export interface AuditLog {
  audit_log_id: string;
  user_id?: string;
  username?: string;
  action: string;
  entity_name: string;
  record_id?: string;
  old_value?: string;
  new_value?: string;
  ip_address?: string;
  details?: string;
  result: 'Success' | 'Failure';
  created_date: string;
}

// User management
export interface UserRecord {
  user_id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: number;
  failed_login_count: number;
  lockout_end?: string;
  created_date: string;
  role_name: string;
  role_id: string;
}

export interface Role {
  role_id: string;
  role_name: string;
  description?: string;
}

// Pagination
export interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  pagination?: Pagination;
  errors?: Array<{ field: string; message: string }>;
}

// Dashboard KPIs
export interface DashboardData {
  kpis: {
    totalCustomers: number;
    totalLeads: number;
    openLeads: number;
    totalOpportunities: number;
    openOpportunities: number;
    wonOpportunities: number;
    lostOpportunities: number;
    pipelineValue: number;
    weightedPipelineValue: number;
    pendingFollowUps: number;
    overdueFollowUps: number;
  };
  charts: {
    leadsByStatus: Array<{ status: string; count: number }>;
    opportunitiesByStage: Array<{ stage: string; count: number; total_amount: number }>;
    monthlySales: Array<{ month: string; count: number; total_amount: number }>;
  };
  recentFollowUps: FollowUp[];
  adminStats?: {
    totalUsers: number;
    lockedAccounts: number;
    recentAuditLogs: AuditLog[];
  };
}
