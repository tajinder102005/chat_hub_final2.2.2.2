import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Paperclip, X, Image, FileText } from 'lucide-react';
import { useFileUpload, UploadedFile } from '@/hooks/useFileUpload';
import { toast } from 'sonner';

interface Props {
  onSend: (content: string, attachment?: UploadedFile) => Promise<void>;
  onTyping?: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function MessageInput({ onSend, onTyping, disabled, placeholder = 'Type a message...' }: Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, uploading } = useFileUpload();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 52428800) {
      toast.error('File too large (max 50MB)');
      return;
    }
    setPendingFile(file);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setPendingPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setPendingPreview(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const clearFile = () => {
    setPendingFile(null);
    setPendingPreview(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!text.trim() && !pendingFile) || sending) return;

    setSending(true);
    try {
      let attachment: UploadedFile | undefined;
      if (pendingFile) {
        const uploaded = await uploadFile(pendingFile);
        if (!uploaded) {
          toast.error('Failed to upload file');
          setSending(false);
          return;
        }
        attachment = uploaded;
      }
      await onSend(text.trim(), attachment);
      setText('');
      setPendingFile(null);
      setPendingPreview(null);
    } finally {
      setSending(false);
    }
  };

  const isLoading = sending || uploading;

  return (
    <div className="border-t border-border bg-card px-4 py-3">
      {pendingFile && (
        <div className="mx-auto max-w-3xl mb-2">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-accent/50 border border-border">
            {pendingPreview ? (
              <img src={pendingPreview} alt="preview" className="h-12 w-12 rounded object-cover" />
            ) : (
              <div className="h-12 w-12 rounded bg-primary/10 flex items-center justify-center">
                <FileText className="h-6 w-6 text-primary" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{pendingFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {(pendingFile.size / 1024).toFixed(1)} KB
              </p>
            </div>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={clearFile}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
      <form onSubmit={handleSubmit} className="mx-auto flex max-w-3xl items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,application/pdf,.doc,.docx,.txt"
          onChange={handleFileSelect}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
        >
          <Paperclip className="h-5 w-5" />
        </Button>
        <Input
          value={text}
          onChange={(e) => { setText(e.target.value); onTyping?.(); }}
          placeholder={placeholder}
          className="h-11 flex-1"
          disabled={isLoading}
        />
        <Button
          type="submit"
          size="icon"
          className="h-11 w-11 shrink-0"
          disabled={isLoading || (!text.trim() && !pendingFile)}
        >
          {isLoading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>
    </div>
  );
}
