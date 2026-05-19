begin;

insert into storage.buckets (id, name, public, file_size_limit)
values ('profile-avatars', 'profile-avatars', true, 2097152)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Profile avatars are publicly readable'
  ) then
    create policy "Profile avatars are publicly readable"
      on storage.objects
      for select
      to public
      using (bucket_id = 'profile-avatars');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can upload own profile avatars'
  ) then
    create policy "Users can upload own profile avatars"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'profile-avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can update own profile avatars'
  ) then
    create policy "Users can update own profile avatars"
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'profile-avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
      with check (
        bucket_id = 'profile-avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can delete own profile avatars'
  ) then
    create policy "Users can delete own profile avatars"
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'profile-avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;

commit;
