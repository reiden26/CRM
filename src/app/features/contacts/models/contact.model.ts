// ─────────────────────────────────────────────────────────────────────────────
// Contact domain model — mirrors the `contacts` table (migration 001 + 002)
// ─────────────────────────────────────────────────────────────────────────────

// ── Enums (match Supabase ENUM types) ────────────────────────────────────────

export type ContactStatus = 'lead' | 'prospect' | 'active' | 'inactive' | 'archived';
export type ContactSource =
  | 'website' | 'referral' | 'social_media'
  | 'cold_outreach' | 'event' | 'other';

// ── Domain model (camelCase) ──────────────────────────────────────────────────

export interface Contact {
  id:          string;
  tenantId:    string;
  companyId:   string | null;
  companyName: string | null;   // joined from companies.name
  firstName:   string;
  lastName:    string;
  fullName:    string;          // computed: firstName + lastName
  email:       string | null;
  phone:       string | null;
  position:    string | null;
  source:      ContactSource | null;
  status:      ContactStatus;
  assignedTo:  string | null;   // UUID → profiles.id
  assignedToName: string | null; // joined from profiles.full_name
  createdBy:   string | null;
  createdAt:   string;
  updatedAt:   string;
  tags:        ContactTag[];
}

export interface ContactTag {
  id:    string;
  name:  string;
  color: string;
}

// ── Raw DB row (snake_case) ───────────────────────────────────────────────────

export interface ContactRow {
  id:          string;
  tenant_id:   string;
  company_id:  string | null;
  first_name:  string;
  last_name:   string;
  email:       string | null;
  phone:       string | null;
  position:    string | null;
  source:      ContactSource | null;
  status:      ContactStatus;
  assigned_to: string | null;
  created_by:  string | null;
  created_at:  string;
  updated_at:  string;
  // Joined fields
  companies?:  { name: string } | null;
  profiles?:   { full_name: string } | null;
  contact_tags?: { tags: { id: string; name: string; color: string } }[];
}

// ── Mapper ────────────────────────────────────────────────────────────────────

export function mapContactRow(row: ContactRow): Contact {
  return {
    id:             row.id,
    tenantId:       row.tenant_id,
    companyId:      row.company_id,
    companyName:    row.companies?.name ?? null,
    firstName:      row.first_name,
    lastName:       row.last_name,
    fullName:       `${row.first_name} ${row.last_name}`.trim(),
    email:          row.email,
    phone:          row.phone,
    position:       row.position,
    source:         row.source,
    status:         row.status,
    assignedTo:     row.assigned_to,
    assignedToName: row.profiles?.full_name ?? null,
    createdBy:      row.created_by,
    createdAt:      row.created_at,
    updatedAt:      row.updated_at,
    tags:           (row.contact_tags ?? []).map(ct => ct.tags),
  };
}

// ── Form value (used by ContactFormComponent) ─────────────────────────────────

export interface ContactFormValue {
  firstName:  string;
  lastName:   string;
  email:      string | null;
  phone:      string | null;
  companyId:  string | null;
  position:   string | null;
  source:     ContactSource | null;
  status:     ContactStatus;
  assignedTo: string | null;
  notes:      string | null;
}

// ── Filters (used by ContactsListComponent) ───────────────────────────────────

export interface ContactFilters {
  search:     string;
  status:     ContactStatus | null;
  assignedTo: string | null;
  companyId:  string | null;
  tagIds:     string[];
  dateFrom:   string | null;
  dateTo:     string | null;
}

export const DEFAULT_FILTERS: ContactFilters = {
  search:     '',
  status:     null,
  assignedTo: null,
  companyId:  null,
  tagIds:     [],
  dateFrom:   null,
  dateTo:     null,
};

// ── Pagination ────────────────────────────────────────────────────────────────

export interface ContactPage {
  data:       Contact[];
  total:      number;
  page:       number;
  pageSize:   number;
}

export interface PaginationParams {
  page:     number;
  pageSize: number;
  sortBy:   keyof ContactRow;
  sortDir:  'asc' | 'desc';
}

export const DEFAULT_PAGINATION: PaginationParams = {
  page:     0,
  pageSize: 25,
  sortBy:   'created_at',
  sortDir:  'desc',
};

// ── Status display helpers ────────────────────────────────────────────────────

export const STATUS_LABELS: Record<ContactStatus, string> = {
  lead:     'Lead',
  prospect: 'Prospect',
  active:   'Active',
  inactive: 'Inactive',
  archived: 'Archived',
};

export const STATUS_COLORS: Record<ContactStatus, string> = {
  lead:     '#6366f1',
  prospect: '#0288d1',
  active:   '#22c55e',
  inactive: '#9ca3af',
  archived: '#6b7280',
};

export const SOURCE_LABELS: Record<ContactSource, string> = {
  website:       'Website',
  referral:      'Referral',
  social_media:  'Social Media',
  cold_outreach: 'Cold Outreach',
  event:         'Event',
  other:         'Other',
};
