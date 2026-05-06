export type ContactType = 'lead' | 'client' | 'prospect';
export type ContactStatus = 'active' | 'inactive' | 'archived';

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  company?: string;
  position?: string;
  type: ContactType;
  status: ContactStatus;
  assignedTo?: string;
  tags?: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
