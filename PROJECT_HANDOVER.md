# Pattaya Dinosaur Kingdom — Project Handover

Last verified: 2026-11-17

This file is the durable project reference for future maintenance. Read it before changing Owner, Staff, Event Staff, authentication, ticketing, payroll, or synchronization.

## Canonical repository

- GitHub repository: https://github.com/1987zinwaimin-afk/pattaya-dinosaur-ticket-control
- Default branch: `main`
- Current maintenance branch: `staff-account-upgrade-20261117`
- Current draft PR: https://github.com/1987zinwaimin-afk/pattaya-dinosaur-ticket-control/pull/3
- PR #3 status at last check: OPEN, DRAFT, not merged. Do not merge or deploy without explicit user approval.

## Permanent production URLs — do not change

- Owner: https://pattaya-dinosaur-ticket-control-eight.vercel.app/
- Staff: https://pattaya-dinosaur-ticket-control.vercel.app/staff.html
- Event Staff: https://pattaya-dinosaur-ticket-control-eight.vercel.app/event-staff.html

These URLs are established production endpoints. Do not rename projects, change domains, recreate projects, or replace URLs as part of routine maintenance.

## Vercel reference

- Project name shown in the user's Vercel Settings screenshot: `pattaya-dinosaur-ticket-control`
- Project ID supplied and reconfirmed by the user: `prj_owIUDer7XnZnbOC6MkY8BTP4tFWn`
- Team slug: `pattayadinosourkingdom-9376`
- Team ID: `team_3ofgYZvQq3XJM7x5Sc4uNAse`
- Git integration shown in the user's screenshot: `1987zinwaimin-afk/pattaya-dinosaur-ticket-control`, connected Oct 31.

Important access note (2026-11-17): the Vercel connection could list the Team but returned an empty `linkedProjects` list and project lookup returned 404, even after the user approved the one-time Team access request. This is an integration/API visibility issue; it does not prove that the user's Vercel project is missing. The Project ID above is the exact ID supplied and reconfirmed by the user; do not silently alter or regenerate it. Before Vercel operations, retry project lookup with the same ID and Team. If still unavailable, ask the user to verify the Vercel connection's team/project scope; never create a replacement project.

## Shared database

- Supabase project ID: `tlefnqzpilajeuyysujb`
- Owner and Staff clients use the shared project with role-based access.
- Never replace the Supabase project or reset its data during routine UI/account work.

### Staff login activity security

Migration: `supabase/migrations/20261117154329_restrict_staff_login_activity_owner_reads.sql`

Applied to the live Supabase project and committed on the maintenance branch.

- Owner can read the global `staff_login_activity` feed.
- Staff can read and maintain only their own login-state row.
- The old permissive authenticated all-rows upsert policy was removed.
- Existing activity rows were preserved at the time of verification (8 rows).
- Event staff activity already had Owner-only read/delete policies; no changes were made there.

## Current Owner-only Staff Activity implementation

- Owner navigation shows Staff Activity.
- Direct page navigation and activity loading check the Owner role.
- Staff must not be able to read the global activity feed.
- Staff Activity is available from Owner > Staff Database > Staff Login Activity.
- Database RLS is the security boundary; hiding a menu item alone is not sufficient.

## PR #3 — current work, not yet in production

PR #3 contains:
- Owner-only Staff Activity UI access guards.
- Owner-only global staff activity read policy and staff self-row policy.
- Staff device/connection health diagnostics.
- Staff dashboard and department-scoped shortcuts.
- POS quantity draft recovery.
- Durable pending Cloud Sync queue and conflict preservation.

Validation recorded in PR #3:
- Owner RLS test returned all 8 existing staff activity rows.
- Staff RLS test returned only that staff member's own activity row.
- Owner page inline JavaScript syntax check: 8/8 scripts passed.
- No complete live Android offline/reconnect, multi-device conflict, or end-to-end browser test has been completed.

Keep PR #3 in Draft until testing is complete. Do not merge/deploy without explicit approval.

## Data and compatibility rules

- Preserve existing Owner, Staff, and Event Staff accounts and authentication.
- Preserve payroll, tickets, customer visits, departments, activity history, and all existing database records.
- Do not reset Firebase/Supabase, local storage, or production data.
- Do not change established production URLs.
- Do not expose, commit, or request passwords, API tokens, service-role keys, or other secrets.
- Make changes on a feature branch, review the diff, test, and only then request approval before production release.

## Future maintenance checklist

1. Read this handover first.
2. Confirm the exact repository and branch; do not guess.
3. Inspect existing code, schema, and related PRs before editing.
4. Preserve the three production URLs and shared Supabase project.
5. Keep Owner-only data protected by database RLS as well as UI checks.
6. Validate the change and report what was tested and what was not.
7. Do not merge, deploy, rename projects, or change production settings without explicit user approval.
