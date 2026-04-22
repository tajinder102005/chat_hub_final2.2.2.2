-- ============================================
-- CHATHUB COMPLETE DATABASE SETUP
-- Run this entire script in Supabase SQL Editor
-- ============================================

-- Enums
CREATE TYPE public.user_status AS ENUM ('online', 'busy', 'offline');
CREATE TYPE public.group_role AS ENUM ('admin', 'member', 'owner');

-- Timestamp function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============================================
-- PROFILES
-- ============================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  status user_status NOT NULL DEFAULT 'offline',
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can view profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup (with email)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)), NEW.email)
  ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- CONVERSATIONS (1-on-1)
-- ============================================
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id UUID NOT NULL,
  user2_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user1_id, user2_id)
);
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants can view conversations" ON public.conversations FOR SELECT TO authenticated USING (auth.uid() = user1_id OR auth.uid() = user2_id);
CREATE POLICY "Authenticated users can create conversations" ON public.conversations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user1_id OR auth.uid() = user2_id);

-- ============================================
-- DIRECT MESSAGES
-- ============================================
CREATE TABLE public.direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  read_at TIMESTAMP WITH TIME ZONE,
  attachment_url TEXT,
  attachment_name TEXT,
  attachment_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants can view messages" ON public.direct_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())));
CREATE POLICY "Users can send messages" ON public.direct_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id AND EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())));
CREATE POLICY "Users can update read status" ON public.direct_messages FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())));

-- ============================================
-- GROUPS
-- ============================================
CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  icon_url TEXT,
  description TEXT DEFAULT '',
  invite_code TEXT UNIQUE DEFAULT gen_random_uuid()::text,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON public.groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role group_role NOT NULL DEFAULT 'member',
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- Group policies
CREATE POLICY "allow_insert_groups" ON public.groups FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "allow_select_groups" ON public.groups FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = groups.id AND gm.user_id = auth.uid()));
CREATE POLICY "allow_update_groups" ON public.groups FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = groups.id AND gm.user_id = auth.uid() AND gm.role IN ('admin','owner')));

-- ============================================
-- GROUP HELPER FUNCTIONS (no recursion)
-- ============================================
CREATE OR REPLACE FUNCTION public.is_group_member(_group_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = _group_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_group_admin(_group_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = _group_id AND user_id = _user_id AND role IN ('admin','owner'));
$$;

CREATE OR REPLACE FUNCTION public.is_group_owner(_group_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = _group_id AND user_id = _user_id AND role = 'owner');
$$;

-- Group members policies (using functions to avoid recursion)
CREATE POLICY "Group members can view members" ON public.group_members FOR SELECT TO authenticated
  USING (public.is_group_member(group_id, auth.uid()));
CREATE POLICY "Group admins can add members" ON public.group_members FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.is_group_admin(group_id, auth.uid()));
CREATE POLICY "Group admins can update roles" ON public.group_members FOR UPDATE TO authenticated
  USING (public.is_group_admin(group_id, auth.uid()));
CREATE POLICY "Group admins can remove members" ON public.group_members FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_group_admin(group_id, auth.uid()));

-- ============================================
-- GROUP MESSAGES
-- ============================================
CREATE TABLE public.group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  is_system BOOLEAN DEFAULT false,
  attachment_url TEXT,
  attachment_name TEXT,
  attachment_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Group members can view messages" ON public.group_messages FOR SELECT TO authenticated
  USING (public.is_group_member(group_id, auth.uid()));
CREATE POLICY "Group members can send messages" ON public.group_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id AND public.is_group_member(group_id, auth.uid()));

-- ============================================
-- SAVED CONTACTS
-- ============================================
CREATE TABLE public.saved_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, contact_user_id)
);
ALTER TABLE public.saved_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own saved contacts" ON public.saved_contacts FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Users can insert own saved contacts" ON public.saved_contacts FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own saved contacts" ON public.saved_contacts FOR UPDATE TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete own saved contacts" ON public.saved_contacts FOR DELETE TO authenticated USING (auth.uid() = owner_id);

-- ============================================
-- GROUP RPC FUNCTIONS
-- ============================================
CREATE OR REPLACE FUNCTION public.create_group(group_name TEXT, member_ids UUID[])
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_group_id UUID; member_id UUID;
BEGIN
  INSERT INTO public.groups (name, created_by) VALUES (group_name, auth.uid()) RETURNING id INTO new_group_id;
  INSERT INTO public.group_members (group_id, user_id, role) VALUES (new_group_id, auth.uid(), 'owner');
  FOREACH member_id IN ARRAY member_ids LOOP
    INSERT INTO public.group_members (group_id, user_id, role) VALUES (new_group_id, member_id, 'member') ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN new_group_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.make_group_admin(gid UUID, target_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_group_owner(gid, auth.uid()) THEN RAISE EXCEPTION 'Only owner can make admins'; END IF;
  UPDATE public.group_members SET role = 'admin' WHERE group_id = gid AND user_id = target_user_id AND role = 'member';
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_group_admin(gid UUID, target_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_group_owner(gid, auth.uid()) THEN RAISE EXCEPTION 'Only owner can remove admins'; END IF;
  UPDATE public.group_members SET role = 'member' WHERE group_id = gid AND user_id = target_user_id AND role = 'admin';
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_group_member(gid UUID, target_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_role TEXT;
BEGIN
  SELECT role INTO target_role FROM public.group_members WHERE group_id = gid AND user_id = target_user_id;
  IF target_role = 'owner' THEN RAISE EXCEPTION 'Owner cannot be removed'; END IF;
  IF target_role = 'admin' AND NOT public.is_group_owner(gid, auth.uid()) THEN RAISE EXCEPTION 'Only owner can remove admins'; END IF;
  IF NOT public.is_group_owner(gid, auth.uid()) AND NOT public.is_group_admin(gid, auth.uid()) AND auth.uid() != target_user_id THEN RAISE EXCEPTION 'Not authorized'; END IF;
  DELETE FROM public.group_members WHERE group_id = gid AND user_id = target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_group_ownership(gid UUID, new_owner_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_group_owner(gid, auth.uid()) THEN RAISE EXCEPTION 'Only owner can transfer ownership'; END IF;
  UPDATE public.group_members SET role = 'admin' WHERE group_id = gid AND user_id = auth.uid();
  UPDATE public.group_members SET role = 'owner' WHERE group_id = gid AND user_id = new_owner_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_group_member_by_email(gid UUID, member_email TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_uid UUID;
BEGIN
  IF NOT public.is_group_admin(gid, auth.uid()) THEN RAISE EXCEPTION 'Only admins can add members'; END IF;
  SELECT user_id INTO target_uid FROM public.profiles WHERE email = member_email;
  IF target_uid IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
  INSERT INTO public.group_members (group_id, user_id, role) VALUES (gid, target_uid, 'member') ON CONFLICT DO NOTHING;
  INSERT INTO public.group_messages (group_id, sender_id, content, is_system) VALUES (gid, auth.uid(), member_email || ' was added to the group', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_group_info(gid UUID, new_name TEXT, new_description TEXT, new_icon_url TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_group_admin(gid, auth.uid()) THEN RAISE EXCEPTION 'Only admins can update group info'; END IF;
  UPDATE public.groups SET
    name = CASE WHEN new_name IS NOT NULL AND new_name != '' THEN new_name ELSE name END,
    description = CASE WHEN new_description IS NOT NULL THEN new_description ELSE description END,
    icon_url = CASE WHEN new_icon_url IS NOT NULL AND new_icon_url != '' THEN new_icon_url ELSE icon_url END
  WHERE id = gid;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_group_by_invite(code TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE gid UUID;
BEGIN
  SELECT id INTO gid FROM public.groups WHERE invite_code = code;
  IF gid IS NULL THEN RAISE EXCEPTION 'Invalid invite code'; END IF;
  INSERT INTO public.group_members (group_id, user_id, role) VALUES (gid, auth.uid(), 'member') ON CONFLICT DO NOTHING;
  RETURN gid;
END;
$$;

-- ============================================
-- REALTIME
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;

-- ============================================
-- STORAGE BUCKETS
-- ============================================
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-attachments', 'chat-attachments', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Avatars public read" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Authenticated upload avatars" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars');
CREATE POLICY "Authenticated update avatars" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars');

CREATE POLICY "Attachments public read" ON storage.objects FOR SELECT USING (bucket_id = 'chat-attachments');
CREATE POLICY "Authenticated upload attachments" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat-attachments');
