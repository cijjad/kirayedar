-- Private bucket for founder uploads. No storage.objects policies are created
-- for anon/authenticated, so clients cannot list, read or write objects
-- directly. The server issues short-lived signed upload/download URLs with
-- the service-role key after its own authorization checks.
--
-- Supabase Storage encrypts objects at rest (AES-256, per Supabase's
-- security documentation). Size/type limits are enforced here AND in app code.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'idea-files',
  'idea-files',
  false,
  26214400, -- 25 MB
  array[
    'image/jpeg',
    'image/png',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'video/mp4'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
