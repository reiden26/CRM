export type DealStage =
  | 'new'
  | 'qualified'
  | 'proposal'
  | 'negotiation'
  | 'closed_won'
  | 'closed_lost';

export interface Deal {
  id: string;
  title: string;
  contactId: string;
  stage: DealStage;
  value: number;
  currency: string;
  probability: number;
  expectedCloseDate?: string;
  assignedTo?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
