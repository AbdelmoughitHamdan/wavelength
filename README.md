# How Well Do You Know Me?

A no-auth, two-player, mobile-first party game built with Next.js App Router, TypeScript, Tailwind, Supabase/PostgreSQL, Gemini, and Zod.

## Run locally

1. Copy `.env.example` to `.env.local` and fill in Supabase and Gemini credentials.
2. Run `npm install`, then `npm run dev`.
3. Apply [`supabase/migrations/001_initial.sql`](supabase/migrations/001_initial.sql) in the Supabase SQL editor.

The service-role key and Gemini key are only read by server modules. A signed, random player token is stored in an HttpOnly cookie; the database validates every mutation and phase transition.

## Admin question generator

Set both `ADMIN_EMAILS` (comma-separated, or a JSON array such as `["one@example.com","two@example.com"]`) and `ADMIN_PASSWORD` to enable the private `/admin/questions` developer tool. It uses HTTP Basic Auth and denies access when either setting is missing. Use a long, unique password and HTTPS in every shared or production environment: Basic Auth credentials are only safe in transit over TLS. Gemini credentials and the admin allowlist/password remain server-only. Generated suggestions are never inserted into live games; the browser-only Save action stores an approved suggestion set in local storage.

## Game flow

The creator shares a six-character code. A second player joins, then each round chooses a subject: the other player predicts three generated four-option questions, the subject answers privately, and the server reveals matches and scores. Players can start another round after every reveal.
