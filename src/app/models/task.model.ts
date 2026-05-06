export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type TaskType = 'call' | 'email' | 'meeting' | 'follow_up' | 'other';

export interface Task {
  id: string;
  title: string;
  description?: string;
  type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate?: string;
  contactId?: string;
  dealId?: string;
  assignedTo?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
