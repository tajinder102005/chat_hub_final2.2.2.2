import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface UploadedFile {
  url: string;
  name: string;
  type: string;
  size: number;
}

export function useFileUpload() {
  const [uploading, setUploading] = useState(false);

  const uploadFile = async (file: File): Promise<UploadedFile | null> => {
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage
        .from('chat-attachments')
        .upload(path, file, { upsert: false });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(path);

      return { url: publicUrl, name: file.name, type: file.type, size: file.size };
    } catch {
      return null;
    } finally {
      setUploading(false);
    }
  };

  return { uploadFile, uploading };
}
