import { useEffect, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { messageMediaUrl } from "../../api";
import { useAuthStore } from "../../store/auth";
import { cn } from "./utils";

type Props = {
  messageId: string;
  mimeType?: string | null;
  filename?: string | null;
  contentType?: string;
  incoming?: boolean;
};

export function MessageMedia({ messageId, mimeType, filename, contentType, incoming }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setError(false);
    setSrc(null);

    (async () => {
      try {
        const res = await fetch(messageMediaUrl(messageId), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error("load failed");
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch {
        if (!cancelled) setError(true);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [messageId, token]);

  if (error) {
    return (
      <p className="text-xs opacity-80">
        Attachment unavailable{filename ? `: ${filename}` : ""}
      </p>
    );
  }

  if (!src) {
    return (
      <div className="flex items-center gap-2 py-1.5 text-xs opacity-70">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading…
      </div>
    );
  }

  const type = mimeType ?? "";
  const isImage = type.startsWith("image/") || contentType === "image";
  const isVideo = type.startsWith("video/") || contentType === "video";
  const isAudio = type.startsWith("audio/") || contentType === "audio";

  if (isImage) {
    return (
      <a href={src} target="_blank" rel="noreferrer" className="block max-w-[220px]">
        <img
          src={src}
          alt={filename ?? "Image"}
          className="max-h-52 w-full rounded-lg object-cover"
        />
      </a>
    );
  }

  if (isVideo) {
    return (
      <video src={src} controls className="max-h-52 max-w-[260px] rounded-lg" />
    );
  }

  if (isAudio) {
    return <audio src={src} controls className="max-w-[260px]" preload="metadata" />;
  }

  return (
    <a
      href={src}
      download={filename ?? "attachment"}
      className={cn(
        "inline-flex max-w-[240px] items-center gap-2 rounded-md border px-2.5 py-2 text-xs font-medium",
        incoming
          ? "border-border bg-background"
          : "border-primary-foreground/25 bg-primary-foreground/10",
      )}
    >
      <FileText className="h-4 w-4 shrink-0" />
      <span className="truncate">{filename ?? "Download file"}</span>
    </a>
  );
}
