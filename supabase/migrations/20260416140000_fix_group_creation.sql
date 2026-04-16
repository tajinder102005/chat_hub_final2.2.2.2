-- Fix group_members INSERT policy: allow users to add themselves (for group creation)
-- and allow admins to add others
DROP POLICY IF EXISTS "Group admins can add members" ON public.group_members;

CREATE POLICY "Group admins can add members" ON public.group_members
FOR INSERT TO authenticated
WITH CHECK (
  -- Allow inserting yourself (needed when creating a group)
  auth.uid() = user_id
  OR
  -- Allow admins to add others
  EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = group_members.group_id
      AND gm.user_id = auth.uid()
      AND gm.role = 'admin'
  )
);
