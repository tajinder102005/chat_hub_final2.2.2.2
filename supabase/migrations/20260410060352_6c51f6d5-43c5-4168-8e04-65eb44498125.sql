
-- Fix group_members policies (self-referencing bug: gm.group_id = gm.group_id)
DROP POLICY IF EXISTS "Group members can view members" ON public.group_members;
DROP POLICY IF EXISTS "Group admins can add members" ON public.group_members;
DROP POLICY IF EXISTS "Group admins can remove members" ON public.group_members;
DROP POLICY IF EXISTS "Group admins can update member roles" ON public.group_members;

CREATE POLICY "Group members can view members" ON public.group_members
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.group_members gm2
  WHERE gm2.group_id = group_members.group_id AND gm2.user_id = auth.uid()
));

CREATE POLICY "Group admins can add members" ON public.group_members
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid() AND gm.role = 'admin'
  )
  OR (auth.uid() = user_id)
);

CREATE POLICY "Group admins can remove members" ON public.group_members
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid() AND gm.role = 'admin'
  )
  OR (auth.uid() = user_id)
);

CREATE POLICY "Group admins can update member roles" ON public.group_members
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid() AND gm.role = 'admin'
  )
);

-- Fix group_messages policies
DROP POLICY IF EXISTS "Group members can view group messages" ON public.group_messages;
DROP POLICY IF EXISTS "Group members can send messages" ON public.group_messages;

CREATE POLICY "Group members can view group messages" ON public.group_messages
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.group_members gm
  WHERE gm.group_id = group_messages.group_id AND gm.user_id = auth.uid()
));

CREATE POLICY "Group members can send messages" ON public.group_messages
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = group_messages.group_id AND gm.user_id = auth.uid()
  )
);

-- Fix groups policies
DROP POLICY IF EXISTS "Group members can view groups" ON public.groups;
DROP POLICY IF EXISTS "Group admins can update groups" ON public.groups;

CREATE POLICY "Group members can view groups" ON public.groups
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.group_members gm
  WHERE gm.group_id = groups.id AND gm.user_id = auth.uid()
));

CREATE POLICY "Group admins can update groups" ON public.groups
FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.group_members gm
  WHERE gm.group_id = groups.id AND gm.user_id = auth.uid() AND gm.role = 'admin'
));

-- Re-create the handle_new_user trigger if missing
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Add unique constraint on connections to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_connections_unique_pair 
ON public.connections (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));

-- Add unique constraint on group_members
CREATE UNIQUE INDEX IF NOT EXISTS idx_group_members_unique 
ON public.group_members (group_id, user_id);

-- Add unique constraint on conversations
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_unique_pair 
ON public.conversations (LEAST(user1_id, user2_id), GREATEST(user1_id, user2_id));
