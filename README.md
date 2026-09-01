# How Well Do You Know Me?

A two-player, mobile-first party game built with Next.js App Router, TypeScript, Tailwind, Supabase Auth/PostgreSQL, Gemini, and Zod.

## Run locally

1. Copy `.env.example` to `.env.local` and fill in Supabase and Gemini credentials.
2. Run `npm install`, then `npm run dev`.
3. Apply the SQL migrations in order: [`001_initial.sql`](supabase/migrations/001_initial.sql), then [`002_supabase_auth.sql`](supabase/migrations/002_supabase_auth.sql).
4. In Supabase Auth, enable Email/Password and set the Site URL/allowed redirect URL to `NEXT_PUBLIC_APP_URL` (for example, `http://localhost:3000/auth/callback`).

The browser receives only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or the legacy anon key). The game service and Gemini code run only on the server. Set `SUPABASE_SECRET_KEY` to the current Supabase `sb_secret_…` key; `SUPABASE_SERVICE_ROLE_KEY` is accepted only for legacy projects. Never put either server key in a `NEXT_PUBLIC_` variable.

### `Invalid API key`

This means Supabase rejected the URL/key pair. In production it is usually a stale/placeholder environment value, a publishable/anon key being used for server writes, or a key copied from a different Supabase project. Copy the project’s **Secret key** (`sb_secret_…`) into `SUPABASE_SECRET_KEY`, copy its matching **Publishable key** into `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, remove stale overrides, then restart the deployment. The legacy `SUPABASE_SERVICE_ROLE_KEY` fallback remains for JWT-era projects.

The auth migration preserves historical anonymous game rows but cannot securely associate an anonymous token with an email account. Those old rows remain for retention; players must create or join a new game after signing in. New game membership is bound to `auth.users`, and rejoining from any signed-in device restores the persisted game state and scores.

## Admin question generator

Set both `ADMIN_EMAILS` (comma-separated, or a JSON array such as `["one@example.com","two@example.com"]`) and `ADMIN_PASSWORD` to enable the private `/admin/questions` developer tool. It uses HTTP Basic Auth and denies access when either setting is missing. Use a long, unique password and HTTPS in every shared or production environment: Basic Auth credentials are only safe in transit over TLS. Gemini credentials and the admin allowlist/password remain server-only. Generated suggestions are never inserted into live games; the browser-only Save action stores an approved suggestion set in local storage.

## Game flow

Sign up or log in with an email/password account first. The creator shares a six-character code, and a second authenticated player joins. Each round chooses a subject: the other player predicts three generated four-option questions, the subject answers privately, and the server reveals matches and scores. The landing page lists active games so either player can continue from any signed-in device. Answers and predictions are withheld until reveal.
