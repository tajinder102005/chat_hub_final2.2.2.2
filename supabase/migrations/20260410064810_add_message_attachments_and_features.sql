/*
  # Add Message Attachments and Enhanced Features

  1. New Tables
    - `message_attachments` - Stores file/image metadata for direct message attachments
      - `id` (uuid, primary key)
      - `message_id` (uuid, references direct_messages)
      - `file_url` (text) - Public URL of the uploaded file
      - `file_name` (text) - Original file name
      - `file_type` (text) - MIME type (image/jpeg, application/pdf, etc.)
      - `file_size` (int) - File size in bytes
      - `created_at` (timestamptz)
    - `group_message_attachments` - Same for group messages
      - Same columns but references group_messages

  2. Changes to Existing Tables
    - Add `edited_at` column to `direct_messages` for edit tracking
    - Add `deleted_at` column to `direct_messages` for soft delete
    - Add `edited_at` column to `group_messages`
    - Add `deleted_at` column to `group_messages`

  3. Security
    - Enable RLS on new tables
    - Policies: participants can view attachments, senders can insert
*/

-- Add edit/delete tracking to direct_messages
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'direct_messages' AND column_name = 'edited_at'
  ) THEN
    ALTER TABLE direct_messages ADD COLUMN edited_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'direct_messages' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE direct_messages ADD COLUMN deleted_at timestamptz;
  END IF;
END $$;

-- Add edit/delete tracking to group_messages
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'group_messages' AND column_name = 'edited_at'
  ) THEN
    ALTER TABLE group_messages ADD COLUMN edited_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'group_messages' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE group_messages ADD COLUMN deleted_at timestamptz;
  END IF;
END $$;

-- Create message_attachments table
CREATE TABLE IF NOT EXISTS message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES direct_messages(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text NOT NULL DEFAULT '',
  file_type text NOT NULL DEFAULT '',
  file_size int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;

-- Participants of the conversation can view attachments
CREATE POLICY "Conversation participants can view attachments"
  ON message_attachments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM direct_messages dm
      JOIN conversations c ON c.id = dm.conversation_id
      WHERE dm.id = message_attachments.message_id
      AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
    )
  );

-- Senders can insert attachments
CREATE POLICY "Senders can insert attachments"
  ON message_attachments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM direct_messages dm
      WHERE dm.id = message_attachments.message_id
      AND dm.sender_id = auth.uid()
    )
  );

-- Create group_message_attachments table
CREATE TABLE IF NOT EXISTS group_message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES group_messages(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text NOT NULL DEFAULT '',
  file_type text NOT NULL DEFAULT '',
  file_size int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE group_message_attachments ENABLE ROW LEVEL SECURITY;

-- Group members can view group message attachments
CREATE POLICY "Group members can view group attachments"
  ON group_message_attachments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_messages gm
      JOIN group_members mem ON mem.group_id = gm.group_id
      WHERE gm.id = group_message_attachments.message_id
      AND mem.user_id = auth.uid()
    )
  );

-- Group members can insert attachments for their messages
CREATE POLICY "Group members can insert group attachments"
  ON group_message_attachments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_messages gm
      WHERE gm.id = group_message_attachments.message_id
      AND gm.sender_id = auth.uid()
    )
  );

-- Allow senders to update their own direct messages (edit)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'direct_messages' AND policyname = 'Senders can edit own messages'
  ) THEN
    EXECUTE 'CREATE POLICY "Senders can edit own messages"
      ON direct_messages FOR UPDATE
      TO authenticated
      USING (sender_id = auth.uid())
      WITH CHECK (sender_id = auth.uid())';
  END IF;
END $$;

-- Allow senders to update their own group messages (edit)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'group_messages' AND policyname = 'Senders can edit own group messages'
  ) THEN
    EXECUTE 'CREATE POLICY "Senders can edit own group messages"
      ON group_messages FOR UPDATE
      TO authenticated
      USING (sender_id = auth.uid())
      WITH CHECK (sender_id = auth.uid())';
  END IF;
END $$;
