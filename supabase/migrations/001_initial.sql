create extension if not exists pgcrypto;

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  phase text not null default 'waiting' check (phase in ('waiting','predicting','answering','reveal')),
  current_round integer not null default 0 check (current_round >= 0),
  creator_player_id uuid,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 24),
  role text not null check (role in ('creator','joiner')),
  token_hash text not null,
  score integer not null default 0 check (score >= 0),
  joined_at timestamptz not null default now(),
  unique (game_id, role),
  unique (game_id, token_hash)
);
alter table public.games add constraint games_creator_fk foreign key (creator_player_id) references public.players(id) deferrable initially deferred;

create table if not exists public.rounds (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  round_number integer not null check (round_number > 0),
  subject_player_id uuid not null references public.players(id),
  predictor_player_id uuid not null references public.players(id),
  status text not null check (status in ('predicting','answering','reveal')),
  created_at timestamptz not null default now(),
  unique (game_id, round_number),
  check (subject_player_id <> predictor_player_id)
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  position integer not null check (position between 0 and 2),
  prompt text not null,
  unique (round_id, position)
);

create table if not exists public.options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  position integer not null check (position between 0 and 3),
  label text not null,
  unique (question_id, position)
);

create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  player_id uuid not null references public.players(id),
  option_id uuid not null references public.options(id),
  created_at timestamptz not null default now(),
  unique (round_id, question_id),
  unique (round_id, player_id, question_id)
);

create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  player_id uuid not null references public.players(id),
  option_id uuid not null references public.options(id),
  created_at timestamptz not null default now(),
  unique (round_id, question_id),
  unique (round_id, player_id, question_id)
);

create table if not exists public.round_results (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  prediction_option_id uuid references public.options(id),
  answer_option_id uuid not null references public.options(id),
  matched boolean not null,
  points integer not null check (points in (0,1)),
  created_at timestamptz not null default now(),
  unique (round_id, question_id)
);

create index if not exists players_game_idx on public.players(game_id);
create index if not exists rounds_game_idx on public.rounds(game_id, round_number);
create index if not exists questions_round_idx on public.questions(round_id, position);
alter table public.games enable row level security;
alter table public.players enable row level security;
alter table public.rounds enable row level security;
alter table public.questions enable row level security;
alter table public.options enable row level security;
alter table public.predictions enable row level security;
alter table public.answers enable row level security;
alter table public.round_results enable row level security;
-- No anon policies: all access goes through server-side service role routes.
