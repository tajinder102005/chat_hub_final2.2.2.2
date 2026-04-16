-- Create storage bucket for chat attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: Public can view chat attachments
CREATE POLICY "Chat attachments are publicly accessible"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'chat-attachments');

-- Policy: Authenticated users can upload chat attachments
CREATE POLICY "Authenticated users can upload chat attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND auth.role() = 'authenticated'
);

-- Policy: Users can update their own chat attachments
CREATE POLICY "Users can update their own chat attachments"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Users can delete their own chat attachments
CREATE POLICY "Users can delete their own chat attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
