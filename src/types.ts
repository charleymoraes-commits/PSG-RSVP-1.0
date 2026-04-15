export interface Profile {
  id: string;
  full_name: string;
  phone_number?: string;
  is_admin: boolean;
  is_approved: boolean;
  created_at: string;
}

export interface Game {
  id: string;
  date: string;
  time: string;
  location: string;
  status: 'open' | 'closed' | 'voting' | 'finished';
  team_a: Profile[];
  team_b: Profile[];
  mvp_winner?: string;
  created_at: string;
}

export interface RSVP {
  id: string;
  game_id: string;
  user_id: string;
  status: 'confirmed' | 'waiting';
  created_at: string;
  profiles?: Profile;
}

export interface Vote {
  id: string;
  game_id: string;
  voter_id: string;
  candidate_id: string;
  created_at: string;
}
