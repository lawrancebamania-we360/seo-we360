"use client";

import { useRef, useState, useTransition } from "react";
import { ImageUp, Loader2, X, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { updateTask } from "@/lib/actions/tasks";

interface Props {
  taskId: string;
  projectId: string;
  images: string[];
  onChange: (next: string[]) => void;
  canEdit: boolean;
}

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

export function BlogImageUploader({ taskId, projectId, images, onChange, canEdit }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingDelete, startDelete] = useTransition();

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const supabase = createClient();
    const newUrls: string[] = [];
    let failed = 0;

    for (const file of Array.from(files)) {
      if (!ACCEPTED.includes(file.type)) {
        toast.error(`Skipped ${file.name} — unsupported format`);
        failed++;
        continue;
      }
      if (file.size > MAX_BYTES) {
        toast.error(`Skipped ${file.name} — larger than 5MB`);
        failed++;
        continue;
      }
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${projectId}/${taskId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("blog-images").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });
      if (error) {
        toast.error(`Upload failed: ${error.message}`);
        failed++;
        continue;
      }
      const { data: { publicUrl } } = supabase.storage.from("blog-images").getPublicUrl(path);
      newUrls.push(publicUrl);
    }

    if (newUrls.length > 0) {
      const next = [...images, ...newUrls];
      try {
        await updateTask(taskId, { reference_images: next });
        onChange(next);
        toast.success(`Uploaded ${newUrls.length} image${newUrls.length === 1 ? "" : "s"}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Saved images but failed to link them");
      }
    }
    if (failed === files.length && newUrls.length === 0) {
      toast.error("No images uploaded");
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const remove = (url: string) => {
    startDelete(async () => {
      const supabase = createClient();
      // Strip the public URL to get the storage path
      try {
        const match = url.match(/\/storage\/v1\/object\/public\/blog-images\/(.+)$/);
        const path = match?.[1];
        if (path) {
          await supabase.storage.from("blog-images").remove([path]);
        }
      } catch {
        // ignore storage errors — still remove from the task
      }
      const next = images.filter((u) => u !== url);
      try {
        await updateTask(taskId, { reference_images: next });
        onChange(next);
        toast.success("Image removed");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Remove failed");
      }
    });
  };

  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {images.map((url) => (
            <div key={url} className="relative group aspect-square rounded-md border overflow-hidden bg-muted">
              <Image src={url} alt="Blog reference" fill className="object-cover" sizes="120px" unoptimized />
              {canEdit && (
                <button
                  type="button"
                  onClick={() => remove(url)}
                  disabled={pendingDelete}
                  className={cn(
                    "absolute top-1 right-1 size-6 rounded-full bg-rose-600 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-md",
                    "hover:bg-rose-700 disabled:opacity-50"
                  )}
                  title="Remove image"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED.join(",")}
            multiple
            className="hidden"
            onChange={(e) => upload(e.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="w-full"
          >
            {uploading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : images.length === 0 ? (
              <ImageIcon className="size-3.5" />
            ) : (
              <ImageUp className="size-3.5" />
            )}
            {uploading ? "Uploading..." : images.length === 0 ? "Upload images" : "Add more"}
          </Button>
          {images.length === 0 && (
            <p className="text-[10px] text-muted-foreground text-center">
              JPG / PNG / WebP / AVIF · max 5MB each · public URLs
            </p>
          )}
        </>
      )}
    </div>
  );
}
