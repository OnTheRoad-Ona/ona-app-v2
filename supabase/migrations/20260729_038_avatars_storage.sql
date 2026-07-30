-- Avatar storage bucket for user profile pictures
-- Public bucket so avatar URLs are directly accessible (no signed URL needed for viewing)

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload their own avatar
create policy "Users upload own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to update their own avatar
create policy "Users update own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow public read access to all avatars (public bucket)
create policy "Public read avatars"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

-- Allow service role full access
create policy "Service role manage avatars"
  on storage.objects for all
  to service_role
  using (bucket_id = 'avatars')
  with check (bucket_id = 'avatars');
