# Family Kitchen Atlas (GitHub Pages + Supabase)

A family recipe site where everyone can view recipes, but only approved accounts can add recipes.

## What This Version Does

- Public recipe browsing with filters (meal type, ingredient, allergies/dietary, audience)
- Account sign-up/sign-in (Supabase Auth)
- Add recipe form with `Added By`
- Shared recipe storage in Supabase table
- Permission gate so only approved users can insert recipes

## 1) Create Supabase Project

1. Go to Supabase and create a new project.
2. In project settings, copy:
   - Project URL
   - Anon public key
3. Put values into `supabase-config.js`:

```js
window.SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
window.SUPABASE_ANON_KEY = "YOUR_ANON_KEY";
```

## 2) Create Tables and Security Policies

Run this SQL in Supabase SQL Editor:

```sql
create extension if not exists pgcrypto;

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  added_by text not null,
  description text not null,
  meal_type text not null,
  ingredient_tags text[] not null default '{}',
  allergy_tags text[] not null default '{}',
  audience_tags text[] not null default '{}',
  ingredients text[] not null default '{}',
  steps text[] not null default '{}',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.recipe_editors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  can_add boolean not null default true,
  approved_by text,
  approved_at timestamptz not null default now()
);

create table if not exists public.recipe_ratings (
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (recipe_id, user_id)
);

alter table public.recipes enable row level security;
alter table public.recipe_editors enable row level security;
alter table public.recipe_ratings enable row level security;

-- Anyone can read recipes
create policy "recipes_select_public"
on public.recipes
for select
using (true);

-- Only approved accounts can insert recipes
create policy "recipes_insert_approved"
on public.recipes
for insert
to authenticated
with check (
  exists (
    select 1
    from public.recipe_editors e
    where e.user_id = auth.uid()
      and e.can_add = true
  )
);

-- Users can only read their own approval row
create policy "editors_read_own"
on public.recipe_editors
for select
to authenticated
using (user_id = auth.uid());

-- Anyone can read recipe ratings (average stars are shown publicly)
create policy "ratings_select_public"
on public.recipe_ratings
for select
using (true);

-- Signed-in users can create their own rating row
create policy "ratings_insert_own"
on public.recipe_ratings
for insert
to authenticated
with check (user_id = auth.uid());

-- Signed-in users can update only their own rating row
create policy "ratings_update_own"
on public.recipe_ratings
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
```

Optional (recommended) trigger to save the creator automatically:

```sql
create or replace function public.set_recipe_creator()
returns trigger
language plpgsql
security definer
as $$
begin
  new.created_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists recipes_set_creator on public.recipes;
create trigger recipes_set_creator
before insert on public.recipes
for each row
execute function public.set_recipe_creator();
```

## 3) Approve Family Members

When someone creates an account, approve them by inserting their auth user id into `recipe_editors`.

1. In Supabase, open Authentication -> Users.
2. Copy the user UUID.
3. Run SQL:

```sql
insert into public.recipe_editors (user_id, can_add, approved_by)
values ('USER_UUID_HERE', true, 'Owner Name')
on conflict (user_id)
do update set can_add = excluded.can_add, approved_by = excluded.approved_by, approved_at = now();
```

To remove posting permission:

```sql
update public.recipe_editors
set can_add = false, approved_at = now(), approved_by = 'Owner Name'
where user_id = 'USER_UUID_HERE';
```

## 4) Publish On GitHub Pages

1. Push these files to your GitHub repo root:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `supabase-config.js`
   - `recipes.json`
   - `.nojekyll`
2. Repo Settings -> Pages
3. Source: Deploy from a branch
4. Branch: `main` and `/ (root)`

## Notes

- Your anon key is safe to expose in frontend code. Never place your service role key in the website.
- If Supabase is not configured, the app falls back to starter recipes from `recipes.json` in read-only mode.
