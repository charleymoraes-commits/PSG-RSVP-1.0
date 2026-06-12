-- Supabase Database Schema for Perth Soccer Group (Fresh and Clean Setup)
-- INSTRUCTIONS FOR THE USER: 
-- 1. Log in to your Supabase Dashboard (https://supabase.com).
-- 2. Select your project ("Perth Soccer Group" or equivalent).
-- 3. Click on the "SQL Editor" tab in the left sidebar menu.
-- 4. Click "+ New Query".
-- 5. Delete any text in the editor, and PASTE the entire contents of this file.
-- 6. Click the "RUN" button at the bottom right.

-- ================================================================
-- PHASE 1: CLEANING UP ANY EXISTING TRIGGERS & TABLES
-- ================================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_rsvp_change ON rsvps;

DROP TABLE IF EXISTS msp_votes CASCADE;
DROP TABLE IF EXISTS votes CASCADE;
DROP TABLE IF EXISTS rsvps CASCADE;
DROP TABLE IF EXISTS games CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- ================================================================
-- PHASE 2: CREATING TABLES
-- ================================================================

-- 1. Profiles Table
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  phone_number TEXT,
  is_admin BOOLEAN DEFAULT FALSE,
  is_approved BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Games Table
CREATE TABLE public.games (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  time TIME DEFAULT '18:45' NOT NULL,
  location TEXT DEFAULT 'Rivervale' NOT NULL,
  status TEXT CHECK (status IN ('open', 'closed', 'voting', 'finished')) DEFAULT 'open' NOT NULL,
  team_a JSONB DEFAULT '[]'::jsonb,
  team_b JSONB DEFAULT '[]'::jsonb,
  mvp_winner TEXT,
  msp_winner TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. RSVPs Table
CREATE TABLE public.rsvps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID REFERENCES public.games(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT CHECK (status IN ('confirmed', 'waiting', 'declined')) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(game_id, user_id)
);

-- 4. Votes Table
CREATE TABLE public.votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID REFERENCES public.games(id) ON DELETE CASCADE NOT NULL,
  voter_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  candidate_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(game_id, voter_id)
);

-- 5. MSP Votes Table
CREATE TABLE public.msp_votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID REFERENCES public.games(id) ON DELETE CASCADE NOT NULL,
  voter_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  candidate_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(game_id, voter_id)
);

-- ================================================================
-- PHASE 3: DATABASE TRIGGERS
-- ================================================================

-- A. Auto-Promotion Trigger: Moves next player from 'waiting' to 'confirmed' if someone leaves
CREATE OR REPLACE FUNCTION public.handle_rsvp_change()
RETURNS TRIGGER AS $$
DECLARE
  next_waiting_id UUID;
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.status = 'confirmed') OR 
     (TG_OP = 'UPDATE' AND OLD.status = 'confirmed' AND NEW.status = 'declined') THEN
    
    SELECT id INTO next_waiting_id
    FROM public.rsvps
    WHERE game_id = OLD.game_id AND status = 'waiting'
    ORDER BY created_at ASC
    LIMIT 1;

    IF next_waiting_id IS NOT NULL THEN
      UPDATE public.rsvps
      SET status = 'confirmed'
      WHERE id = next_waiting_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_rsvp_change
AFTER DELETE OR UPDATE ON public.rsvps
FOR EACH ROW EXECUTE FUNCTION public.handle_rsvp_change();


-- B. Auto-Profile Creation Trigger & Admin Assigner
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  is_first_user BOOLEAN;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first_user;
  INSERT INTO public.profiles (id, full_name, is_admin, is_approved)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, 'Player'), 
    CASE WHEN NEW.email = 'charley.moraes@gmail.com' THEN true ELSE is_first_user END, 
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ================================================================
-- PHASE 4: ENABLING ROW LEVEL SECURITY (RLS) POLICIES
-- ================================================================

-- Helper function to check if user is an admin without causing policy recursion
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND is_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.msp_votes ENABLE ROW LEVEL SECURITY;

-- 1. Profiles Table Policies
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins can manage all profiles" ON public.profiles FOR ALL USING (
  public.check_is_admin() OR
  (auth.jwt() ->> 'email') = 'charley.moraes@gmail.com'
);

-- 2. Games Table Policies
CREATE POLICY "Games are viewable by everyone" ON public.games FOR SELECT USING (true);
CREATE POLICY "Admins can manage games" ON public.games FOR ALL USING (
  public.check_is_admin() OR
  (auth.jwt() ->> 'email') = 'charley.moraes@gmail.com'
) WITH CHECK (
  public.check_is_admin() OR
  (auth.jwt() ->> 'email') = 'charley.moraes@gmail.com'
);

-- 3. RSVPs Table Policies
CREATE POLICY "RSVPs are viewable by everyone" ON public.rsvps FOR SELECT USING (true);
CREATE POLICY "Users can manage own RSVPs" ON public.rsvps FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can manage all RSVPs" ON public.rsvps FOR ALL USING (
  public.check_is_admin() OR
  (auth.jwt() ->> 'email') = 'charley.moraes@gmail.com'
) WITH CHECK (
  public.check_is_admin() OR
  (auth.jwt() ->> 'email') = 'charley.moraes@gmail.com'
);

-- 4. Votes Table Policies
CREATE POLICY "Votes are viewable by everyone" ON public.votes FOR SELECT USING (true);
CREATE POLICY "Users can vote once per game" ON public.votes FOR INSERT WITH CHECK (auth.uid() = voter_id);
CREATE POLICY "Admins can delete/reset votes" ON public.votes FOR DELETE USING (
  public.check_is_admin() OR
  (auth.jwt() ->> 'email') = 'charley.moraes@gmail.com'
);

-- 5. MSP Votes Table Policies
CREATE POLICY "MSP Votes are viewable by everyone" ON public.msp_votes FOR SELECT USING (true);
CREATE POLICY "Users can vote once for MSP per game" ON public.msp_votes FOR INSERT WITH CHECK (auth.uid() = voter_id);
CREATE POLICY "Admins can delete/reset msp votes" ON public.msp_votes FOR DELETE USING (
  public.check_is_admin() OR
  (auth.jwt() ->> 'email') = 'charley.moraes@gmail.com'
);

-- ================================================================
-- PHASE 5: REALTIME SUBSCRIPTIONS
-- ================================================================
ALTER TABLE public.rsvps REPLICA IDENTITY FULL;
ALTER TABLE public.games REPLICA IDENTITY FULL;
ALTER TABLE public.votes REPLICA IDENTITY FULL;
ALTER TABLE public.msp_votes REPLICA IDENTITY FULL;

BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime FOR TABLE public.rsvps, public.games, public.votes, public.msp_votes;
COMMIT;

-- ================================================================
-- PHASE 6: SYNCING REGISTERED USERS INTO PROFILES TABLE & SETTING ADMINS
-- ================================================================

-- Step 1: Insert missing profiles safely
INSERT INTO public.profiles (id, full_name, is_admin, is_approved)
SELECT 
  id, 
  COALESCE(raw_user_meta_data->>'full_name', email, 'Soccer Player'), 
  (email = 'charley.moraes@gmail.com'),
  true
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- Step 2: Set admin permissions directly without triggering parser errors
UPDATE public.profiles
SET is_admin = true, is_approved = true
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'charley.moraes@gmail.com'
);
