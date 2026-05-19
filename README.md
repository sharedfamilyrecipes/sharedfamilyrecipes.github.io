# Shared Family Recipes

Shared Family Recipes is a shared family recipe board designed for easy browsing, simple contributions, and lightweight account-based permissions.

## Overview

This site gives a family one place to collect favorite meals, browse recipes quickly, and rate dishes over time. The experience is intentionally simple: clean filters, fast search, and straightforward forms.

## Profile And Navigation

The public page, admin page, and profile settings page all load the same shared navbar from [shared/navbar.html](shared/navbar.html) through [shared/navbar.js](shared/navbar.js). Profile identity rendering and preset avatar helpers live in [shared/profile-utils.js](shared/profile-utils.js).

The profile settings page is available at [profile/index.html](profile/index.html). It lets signed-in users:

- Update their display name
- Choose a preset avatar icon
- Upload a profile image
- Change their password

## Supabase Migration Notes

Run the additive SQL migration in [supabase/migrations/20260519_add_profile_fields.sql](supabase/migrations/20260519_add_profile_fields.sql) before relying on display names or avatar metadata in production. The migration is designed to preserve existing `user_profiles` rows and only adds nullable fields and policies.

The frontend expects a Storage bucket named `profile-avatars`. Create it before enabling uploads. The current implementation uses public URLs for uploaded avatars, so the bucket should allow public reads if that matches your deployment model.

Run [supabase/migrations/20260519_profile_avatar_bucket.sql](supabase/migrations/20260519_profile_avatar_bucket.sql) to create the bucket and apply upload/read policies.

Run [supabase/migrations/20260519_public_profile_reads.sql](supabase/migrations/20260519_public_profile_reads.sql) if signed-out users should still see recipe author display names and avatar images.

Run [supabase/migrations/20260519_recipe_comments.sql](supabase/migrations/20260519_recipe_comments.sql) to add recipe comments. This migration also allows users with can_add=true in recipe_editors to remove any comment for moderation.

If recipe comments are already deployed, run [supabase/migrations/20260519_recipe_comment_replies.sql](supabase/migrations/20260519_recipe_comment_replies.sql) to add parent comment support for threaded replies.
