export type MemberRole = 'owner' | 'editor' | 'viewer';
export type TripVisibility = 'private' | 'link' | 'public';

export interface User {
  id: string;
  email: string;
  display_name: string;
  is_admin: boolean;
  created_at: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_at: string;
}

export interface Trip {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  cover_photo_id: string | null;
  start_date: string | null;
  end_date: string | null;
  visibility: TripVisibility;
  role: MemberRole;
  created_at: string;
  updated_at: string;
}

export interface TripMember {
  user_id: string;
  email: string;
  display_name: string;
  role: MemberRole;
}

export interface ApiErrorBody {
  error: {
    code: number;
    type: string;
    message: string;
    details?: unknown;
  };
}
