// ─────────────────────────────────────────────────────────────────────────────
// Deal domain model — mirrors the `deals` + `deal_stages` tables
// ─────────────────────────────────────────────────────────────────────────────

export type DealStageType =
  | 'new' | 'qualified' | 'proposal'
  | 'negotiation' | 'closed_won' | 'closed_lost';

// ── Deal Stage (from deal_stages table) ──────────────────────────────────────

export interface DealStage {
  id:            string;
  name:          string;
  orderPosition: number;
  color:         string;
  isDefault:     boolean;
}

export interface DealStageRow {
  id:             string;
  name:           string;
  order_position: number;
  color:          string;
  is_default:     boolean;
}

export function mapDealStageRow(r: DealStageRow): DealStage {
  return {
    id:            r.id,
    name:          r.name,
    orderPosition: r.order_position,
    color:         r.color,
    isDefault:     r.is_default,
  };
}

// ── Deal ──────────────────────────────────────────────────────────────────────

export interface Deal {
  id:                string;
  tenantId:          string;
  title:             string;
  contactId:         string | null;
  contactName:       string | null;   // joined
  companyId:         string | null;
  companyName:       string | null;   // joined
  stage:             DealStageType;
  value:             number;
  currency:          string;
  probability:       number;          // 0–100
  expectedCloseDate: string | null;
  assignedTo:        string | null;
  assignedToName:    string | null;   // joined
  assignedToAvatar:  string | null;   // joined
  createdBy:         string | null;
  createdAt:         string;
  updatedAt:         string;
  // Computed
  daysUntilClose:    number | null;
  isOverdue:         boolean;
  isUrgent:          boolean;         // < 7 days
}

export interface DealRow {
  id:                   string;
  tenant_id:            string;
  title:                string;
  contact_id:           string | null;
  company_id:           string | null;
  stage:                DealStageType;
  value:                number;
  currency:             string;
  probability:          number;
  expected_close_date:  string | null;
  assigned_to:          string | null;
  created_by:           string | null;
  created_at:           string;
  updated_at:           string;
  // Joined
  contacts?:  { first_name: string; last_name: string } | null;
  companies?: { name: string } | null;
  profiles?:  { full_name: string | null; avatar_url: string | null } | null;
}

export function mapDealRow(r: DealRow): Deal {
  const closeDate = r.expected_close_date
    ? new Date(r.expected_close_date)
    : null;
  const now = new Date();
  const daysUntilClose = closeDate
    ? Math.ceil((closeDate.getTime() - now.getTime()) / 86_400_000)
    : null;

  return {
    id:                r.id,
    tenantId:          r.tenant_id,
    title:             r.title,
    contactId:         r.contact_id,
    contactName:       r.contacts
      ? `${r.contacts.first_name} ${r.contacts.last_name}`.trim()
      : null,
    companyId:         r.company_id,
    companyName:       r.companies?.name ?? null,
    stage:             r.stage,
    value:             r.value,
    currency:          r.currency,
    probability:       r.probability,
    expectedCloseDate: r.expected_close_date,
    assignedTo:        r.assigned_to,
    assignedToName:    r.profiles?.full_name ?? null,
    assignedToAvatar:  r.profiles?.avatar_url ?? null,
    createdBy:         r.created_by,
    createdAt:         r.created_at,
    updatedAt:         r.updated_at,
    daysUntilClose,
    isOverdue:         daysUntilClose !== null && daysUntilClose < 0,
    isUrgent:          daysUntilClose !== null && daysUntilClose >= 0 && daysUntilClose < 7,
  };
}

// ── Filters ───────────────────────────────────────────────────────────────────

export interface DealFilters {
  stage:      DealStageType | null;
  assignedTo: string | null;
  minValue:   number | null;
  maxValue:   number | null;
  dateFrom:   string | null;
  dateTo:     string | null;
  search:     string;
}

export const DEFAULT_DEAL_FILTERS: DealFilters = {
  stage:      null,
  assignedTo: null,
  minValue:   null,
  maxValue:   null,
  dateFrom:   null,
  dateTo:     null,
  search:     '',
};

// ── Stage stats ───────────────────────────────────────────────────────────────

export interface StageStats {
  stageId:    string;
  stageName:  string;
  count:      number;
  totalValue: number;
  currency:   string;
}

// ── Form value ────────────────────────────────────────────────────────────────

export interface DealFormValue {
  title:             string;
  contactId:         string | null;
  companyId:         string | null;
  stage:             DealStageType;
  value:             number;
  currency:          string;
  probability:       number;
  expectedCloseDate: string | null;
  description:       string | null;
  assignedTo:        string | null;
}

// ── Probability helpers ───────────────────────────────────────────────────────

export function getProbabilityColor(probability: number): string {
  if (probability < 30) return '#ef4444';   // red
  if (probability < 70) return '#f59e0b';   // amber
  return '#22c55e';                          // green
}

export function getProbabilityLabel(probability: number): string {
  if (probability < 30) return 'Low';
  if (probability < 70) return 'Medium';
  return 'High';
}

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'MXN', 'COP', 'ARS', 'BRL', 'CLP'];
