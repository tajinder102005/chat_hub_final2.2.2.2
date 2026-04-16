-- Add attachment columns directly to direct_messages and group_messages tables
-- This simplifies the implementation by storing attachment metadata on the message itself

-- Add attachment columns to direct_messages
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'direct_messages' AND column_name = 'attachment_url'
  ) THEN
    ALTER TABLE direct_messages ADD COLUMN attachment_url text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'direct_messages' AND column_name = 'attachment_name'
  ) THEN
    ALTER TABLE direct_messages ADD COLUMN attachment_name text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'direct_messages' AND column_name = 'attachment_type'
  ) THEN
    ALTER TABLE direct_messages ADD COLUMN attachment_type text;
  END IF;
END $$;

-- Add attachment columns to group_messages
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'group_messages' AND column_name = 'attachment_url'
  ) THEN
    ALTER TABLE group_messages ADD COLUMN attachment_url text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'group_messages' AND column_name = 'attachment_name'
  ) THEN
    ALTER TABLE group_messages ADD COLUMN attachment_name text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'group_messages' AND column_name = 'attachment_type'
  ) THEN
    ALTER TABLE group_messages ADD COLUMN attachment_type text;
  END IF;
END $$;
