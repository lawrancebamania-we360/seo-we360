-- SEO · we360.ai: Supabase Storage bucket for blog reference images
-- Public read, admin/member write. Uploaded URLs go into tasks.reference_images JSONB array.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'blog-images',
  'blog-images',
  true,
  5242880,  -- 5MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Anyone can read images (they're referenced from public blogs)
drop policy if exists "blog_images_public_read" on storage.objects;
create policy "blog_images_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'blog-images');

-- Authenticated users can upload
drop policy if exists "blog_images_auth_upload" on storage.objects;
create policy "blog_images_auth_upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'blog-images');

-- Authenticated users can delete (UI-level check restricts to admins/owners)
drop policy if exists "blog_images_auth_delete" on storage.objects;
create policy "blog_images_auth_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'blog-images');
