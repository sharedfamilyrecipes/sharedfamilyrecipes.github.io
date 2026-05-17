# Family Kitchen Atlas

Family Kitchen Atlas is a shared family recipe board designed for easy browsing, simple contributions, and lightweight account-based permissions.

## Overview

This site gives a family one place to collect favorite meals, browse recipes quickly, and rate dishes over time. The experience is intentionally simple: clean filters, fast search, and straightforward forms.

## Core Experience

- Browse recipes in a responsive card layout
- Filter by meal type, ingredient tags, allergy or dietary tags, and audience
- Search across recipe names, descriptions, tags, ingredients, and steps
- Open each recipe in a detail dialog with full ingredients and directions

## Accounts And Permissions

- Anyone can view recipes and ratings
- Family members can create accounts and sign in
- Only approved accounts can add new recipes
- Approval status is managed through a separate permissions list

## Ratings

- Signed-in users can vote recipes from 1 to 5 stars
- Each user keeps a single vote per recipe and can update it anytime
- Recipe cards show average score and total number of ratings

## Data Model

The app uses three main data areas:

- Recipes: core recipe content and tags
- Editors: account approval records for add access
- Ratings: per-user star votes for recipes

## Technology

- Static frontend: HTML, CSS, and vanilla JavaScript
- Hosting target: GitHub Pages
- Backend services: Supabase Auth + Supabase Postgres with row-level security

## Design Direction

The interface uses a warm, kitchen-inspired visual style with soft gradients, rounded cards, and compact controls. It is optimized for both desktop and mobile layouts.
