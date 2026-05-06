// Matches the user_role ENUM in Supabase (migration 001 + 003)
export type UserRole = 'super_admin' | 'admin' | 'manager' | 'agent' | 'viewer';

// Matches the profiles table (public schema)
export interface Profile {
  id: string;           // FK → auth.users.id
  fullName: string;     // full_name
  avatarUrl: string | null;
  role: UserRole;
  companyId: string | null;  // company_id
  tenantId: string | null;   // tenant_id
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Supabase auth.users shape (subset we care about)
export interface AuthUser {
  id: string;
  email: string;
  emailConfirmedAt: string | null;
  createdAt: string;
}

// Combined view used throughout the app
export interface CurrentUser {
  auth: AuthUser;
  profile: Profile;
}

// Raw DB row (snake_case) returned by Supabase queries
export interface ProfileRow {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  company_id: string | null;
  tenant_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Mapper: DB row → domain model
export function mapProfileRow(row: ProfileRow): Profile {
  return {
    id:        row.id,
    fullName:  row.full_name ?? '',
    avatarUrl: row.avatar_url,
    role:      row.role,
    companyId: row.company_id,
    tenantId:  row.tenant_id,
    isActive:  row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Typed error returned by auth operations
export interface AuthError {
  code: string;
  message: string;
}
