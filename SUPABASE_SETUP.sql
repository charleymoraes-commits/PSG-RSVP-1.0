-- Supabase Database Schema for Perth Soccer Group (Clean Setup)

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  phone_number TEXT,
  is_admin BOOLEAN DEFAULT FALSE,
  is_approved BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Games Table
CREATE TABLE IF NOT EXISTS games (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  time TIME DEFAULT '18:45' NOT NULL,
  location TEXT DEFAULT 'Rivervale' NOT NULL,
  status TEXT CHECK (status IN ('open', 'closed', 'voting', 'finished')) DEFAULT 'open' NOT NULL,
  team_a JSONB DEFAULT '[]'::jsonb,
  team_b JSONB DEFAULT '[]'::jsonb,
  mvp_winner TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. RSVPs Table
CREATE TABLE IF NOT EXISTS rsvps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT CHECK (status IN ('confirmed', 'waiting')) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(game_id, user_id)
);

-- 4. Votes Table
CREATE TABLE IF NOT EXISTS votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE NOT NULL,
  voter_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  candidate_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(game_id, voter_id)
);

-- 5. Auto-Promotion Trigger
CREATE OR REPLACE FUNCTION handle_rsvp_deletion()
RETURNS TRIGGER AS $$
DECLARE
  next_waiting_id UUID;
BEGIN
  IF OLD.status = 'confirmed' THEN
    SELECT id INTO next_waiting_id
    FROM rsvps
    WHERE game_id = OLD.game_id AND status = 'waiting'
    ORDER BY created_at ASC
    LIMIT 1;

    IF next_waiting_id IS NOT NULL THEN
      UPDATE rsvps
      SET status = 'confirmed'
      WHERE id = next_waiting_id;
    END IF;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_rsvp_deleted ON rsvps;
CREATE TRIGGER on_rsvp_deleted
AFTER DELETE ON rsvps
FOR EACH ROW EXECUTE FUNCTION handle_rsvp_deletion();

-- 6. RLS Policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
CREATE POLICY "Public profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles 
FOR UPDATE USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id AND 
  is_admin = (SELECT is_admin FROM profiles WHERE id = auth.uid()) AND
  is_approved = (SELECT is_approved FROM profiles WHERE id = auth.uid())
);
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
CREATE POLICY "Admins can update all profiles" ON profiles FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
);

ALTER TABLE games ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Games are viewable by everyone" ON games;
CREATE POLICY "Games are viewable by everyone" ON games FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can manage games" ON games;
CREATE POLICY "Admins can manage games" ON games ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
);

ALTER TABLE rsvps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "RSVPs are viewable by everyone" ON rsvps;
CREATE POLICY "RSVPs are viewable by everyone" ON rsvps FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can manage own RSVPs" ON rsvps;
CREATE POLICY "Users can manage own RSVPs" ON rsvps ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins can manage all RSVPs" ON rsvps;
CREATE POLICY "Admins can manage all RSVPs" ON rsvps ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
) WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
);

ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Votes are viewable by everyone" ON votes;
CREATE POLICY "Votes are viewable by everyone" ON votes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can vote once per game" ON votes;
CREATE POLICY "Users can vote once per game" ON votes FOR INSERT WITH CHECK (auth.uid() = voter_id);

-- 7. Profile Creation Trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  is_first_user BOOLEAN;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first_user;
  INSERT INTO public.profiles (id, full_name, is_admin, is_approved)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', is_first_user, is_first_user);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 8. Enable Realtime
ALTER TABLE rsvps REPLICA IDENTITY FULL;
ALTER TABLE games REPLICA IDENTITY FULL;
ALTER TABLE votes REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'rsvps') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE rsvps;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'games') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE games;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'votes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE votes;
  END IF;
END $$;
