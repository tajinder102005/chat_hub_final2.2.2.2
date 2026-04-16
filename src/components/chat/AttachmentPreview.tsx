import { FileText, Download, Image } from 'lucide-react';

interface Attachment {
  file_url: string;
  file_name: string;
  file_type: string;
  file_size: number;
}

interface Props {
  attachment: Attachment;
  isOwn: boolean;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function AttachmentPreview({ attachment, isOwn }: Props) {
  const isImage = attachment.file_type.startsWith('image/');

  if (isImage) {
    return (
      <a
        href={attachment.file_url}
        target="_blank"
        rel="noopener noreferrer"
        className="block mt-1"
      >
        <img
          src={attachment.file_url}
          alt={attachment.file_name}
          className="max-w-[240px] max-h-[200px] rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
        />
      </a>
    );
  }

  return (
    <a
      href={attachment.file_url}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-2 mt-1 p-2 rounded-lg border transition-colors ${
        isOwn
          ? 'border-primary-foreground/20 hover:bg-primary-foreground/10'
          : 'border-border hover:bg-accent'
      }`}
    >
      <FileText className="h-8 w-8 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-medium truncate ${isOwn ? 'text-primary-foreground' : 'text-foreground'}`}>
          {attachment.file_name}
        </p>
        <p className={`text-[10px] ${isOwn ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
          {formatBytes(attachment.file_size)}
        </p>
      </div>
      <Download className={`h-4 w-4 shrink-0 ${isOwn ? 'text-primary-foreground/60' : 'text-muted-foreground'}`} />
    </a>
  );
}
