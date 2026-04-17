-- Add description to groups
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';

-- Add invite_code for invite links
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE DEFAULT gen_random_uuid()::text;

-- System messages in group_messages (for join/leave/rename events)
ALTER TABLE public.group_messages ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false;

-- Function to join group via invite code (bypasses RLS)
CREATE OR REPLACE FUNCTION public.join_group_by_invite(code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gid UUID;
BEGIN
  SELECT id INTO gid FROM public.groups WHERE invite_code = code;
  IF gid IS NULL THEN RAISE EXCEPTION 'Invalid invite code'; END IF;
  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (gid, auth.uid(), 'member')
  ON CONFLICT DO NOTHING;
  RETURN gid;
END;
$$;

-- Function to update group info (admin only, bypasses RLS)
CREATE OR REPLACE FUNCTION public.update_group_info(
  gid UUID, new_name TEXT, new_description TEXT, new_icon_url TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_group_admin(gid, auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can update group info';
  END IF;
  UPDATE public.groups
  SET name = COALESCE(new_name, name),
      description = COALESCE(new_description, description),
      icon_url = COALESCE(new_icon_url, icon_url)
  WHERE id = gid;
END;
$$;

-- Function to toggle admin role
CREATE OR REPLACE FUNCTION public.toggle_group_admin(gid UUID, target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_role TEXT;
BEGIN
  IF NOT public.is_group_admin(gid, auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can change roles';
  END IF;
  SELECT role INTO current_role FROM public.group_members
  WHERE group_id = gid AND user_id = target_user_id;
  IF current_role = 'admin' THEN
    UPDATE public.group_members SET role = 'member'
    WHERE group_id = gid AND user_id = target_user_id;
  ELSE
    UPDATE public.group_members SET role = 'admin'
    WHERE group_id = gid AND user_id = target_user_id;
  END IF;
END;
$$;

-- Function to remove member (admin only)
CREATE OR REPLACE FUNCTION public.remove_group_member(gid UUID, target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_group_admin(gid, auth.uid()) AND auth.uid() != target_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM public.group_members WHERE group_id = gid AND user_id = target_user_id;
END;
$$;

-- Function to add member by email (admin only)
CREATE OR REPLACE FUNCTION public.add_group_member_by_email(gid UUID, member_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_uid UUID;
BEGIN
  IF NOT public.is_group_admin(gid, auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can add members';
  END IF;
  SELECT user_id INTO target_uid FROM public.profiles WHERE email = member_email;
  IF target_uid IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (gid, target_uid, 'member')
  ON CONFLICT DO NOTHING;
  -- System message
  INSERT INTO public.group_messages (group_id, sender_id, content, is_system)
  VALUES (gid, auth.uid(), member_email || ' was added to the group', true);
END;
$$;
