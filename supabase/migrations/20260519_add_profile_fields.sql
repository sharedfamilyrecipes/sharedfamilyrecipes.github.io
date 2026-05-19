begin;

create table if not exists public.user_profiles (
  user_id uuid primary key,
  email text
);

alter table public.user_profiles
  add column if not exists display_name text,
  add column if not exists avatar_kind text,
  add column if not exists avatar_icon text,
  add column if not exists avatar_path text,
  add column if not exists avatar_updated_at timestamptz,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

update public.user_profiles
set avatar_kind = coalesce(nullif(avatar_kind, ''), 'initials')
where avatar_kind is null or avatar_kind = '';

alter table public.user_profiles
  alter column avatar_kind set default 'initials';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_avatar_kind_check'
  ) then
    alter table public.user_profiles
      add constraint user_profiles_avatar_kind_check
      check (avatar_kind in ('initials', 'preset', 'upload'));
  end if;
end $$;

create or replace function public.set_user_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_user_profiles_updated_at on public.user_profiles;
create trigger set_user_profiles_updated_at
before update on public.user_profiles
for each row
execute function public.set_user_profiles_updated_at();

alter table public.user_profiles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_profiles'
      and policyname = 'Users can read their own profile'
  ) then
    create policy "Users can read their own profile"
      on public.user_profiles
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_profiles'
      and policyname = 'Users can upsert their own profile'
  ) then
    create policy "Users can upsert their own profile"
      on public.user_profiles
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_profiles'
      and policyname = 'Users can update their own profile'
  ) then
    create policy "Users can update their own profile"
      on public.user_profiles
      for update
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_profiles'
      and policyname = 'Admins can read profile identities'
  ) then
    create policy "Admins can read profile identities"
      on public.user_profiles
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.recipe_editors
          where recipe_editors.user_id = auth.uid()
            and recipe_editors.can_add = true
        )
      );
  end if;
end $$;

commit;

-- Storage setup is intentionally separate from the table migration.
-- Create a bucket named profile-avatars and apply policies similar to:
-- 1. Authenticated users can upload/update objects where the first folder segment equals auth.uid().
-- 2. Public read only if your site should expose avatar images directly.