-- Auth identities replace anonymous browser tokens. Existing anonymous players
-- remain as historical rows, but all new rows must have an auth.users identity.
alter table public.players add column if not exists auth_user_id uuid references auth.users(id) on delete cascade;
alter table public.players alter column token_hash drop not null;
alter table public.players drop constraint if exists players_game_id_token_hash_key;
alter table public.players drop column if exists token_hash;
alter table public.players add constraint players_auth_identity_required check (auth_user_id is not null) not valid;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 24),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  name_value text := trim(coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), 'Player'));
begin
  if char_length(name_value) < 2 or char_length(name_value) > 24 then
    name_value := 'Player';
  end if;
  insert into public.profiles (id, display_name) values (new.id, name_value)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.create_profile_for_auth_user();

insert into public.profiles (id, display_name)
select
  id,
  case
    when char_length(trim(coalesce(raw_user_meta_data ->> 'display_name', split_part(email, '@', 1), ''))) between 2 and 24
      then trim(coalesce(raw_user_meta_data ->> 'display_name', split_part(email, '@', 1)))
    else 'Player'
  end
from auth.users
on conflict (id) do nothing;

alter table public.players add column if not exists updated_at timestamptz not null default now();
alter table public.rounds add column if not exists points_awarded integer not null default 0 check (points_awarded between 0 and 3);
alter table public.rounds add column if not exists scored_at timestamptz;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_games_updated_at on public.games;
create trigger set_games_updated_at before update on public.games
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_players_updated_at on public.players;
create trigger set_players_updated_at before update on public.players
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles
  for each row execute procedure public.set_updated_at();

alter table public.games drop constraint if exists games_phase_check;
alter table public.games add constraint games_phase_check
  check (phase in ('waiting', 'generating', 'predicting', 'answering', 'scoring', 'reveal'));
alter table public.rounds drop constraint if exists rounds_status_check;
alter table public.rounds add constraint rounds_status_check
  check (status in ('generating', 'predicting', 'answering', 'scoring', 'reveal'));

create unique index if not exists players_game_auth_user_unique
  on public.players(game_id, auth_user_id) where auth_user_id is not null;
create index if not exists players_auth_user_game_idx on public.players(auth_user_id, game_id);
create index if not exists games_active_updated_idx on public.games(expires_at, updated_at desc);
create index if not exists rounds_scoring_idx on public.rounds(game_id, status);

-- The service-role game API owns all mutations. Authenticated clients receive
-- direct read access only to games in which their auth identity is a member.
alter table public.profiles enable row level security;

create or replace function public.is_game_member(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.players
    where game_id = p_game_id and auth_user_id = auth.uid()
  );
$$;

revoke all on function public.is_game_member(uuid) from public;
grant execute on function public.is_game_member(uuid) to authenticated, service_role;

create or replace function public.can_view_round_content(p_round_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.rounds round_row
    join public.games game_row on game_row.id = round_row.game_id
    left join public.players predictor on predictor.id = round_row.predictor_player_id
    left join public.players subject on subject.id = round_row.subject_player_id
    where round_row.id = p_round_id
      and public.is_game_member(game_row.id)
      and (
        game_row.phase = 'reveal'
        or (game_row.phase = 'predicting' and predictor.auth_user_id = auth.uid())
        or (game_row.phase = 'answering' and subject.auth_user_id = auth.uid())
      )
  );
$$;

revoke all on function public.can_view_round_content(uuid) from public;
grant execute on function public.can_view_round_content(uuid) to authenticated, service_role;

drop policy if exists profiles_read_own on public.profiles;
create policy profiles_read_own on public.profiles for select to authenticated
  using (id = auth.uid());

drop policy if exists games_read_membership on public.games;
create policy games_read_membership on public.games for select to authenticated
  using (public.is_game_member(games.id));

drop policy if exists players_read_membership on public.players;
create policy players_read_membership on public.players for select to authenticated
  using (public.is_game_member(players.game_id));

drop policy if exists rounds_read_membership on public.rounds;
create policy rounds_read_membership on public.rounds for select to authenticated
  using (public.is_game_member(rounds.game_id));

drop policy if exists questions_read_membership on public.questions;
create policy questions_read_membership on public.questions for select to authenticated
  using (public.can_view_round_content(questions.round_id));

drop policy if exists options_read_membership on public.options;
create policy options_read_membership on public.options for select to authenticated
  using (exists (
    select 1 from public.questions question_row
    where question_row.id = options.question_id
      and public.can_view_round_content(question_row.round_id)
  ));

drop policy if exists predictions_read_reveal_membership on public.predictions;
create policy predictions_read_reveal_membership on public.predictions for select to authenticated
  using (exists (
    select 1
    from public.rounds round_row
    join public.games game_row on game_row.id = round_row.game_id
    where round_row.id = predictions.round_id
      and game_row.phase = 'reveal'
      and public.is_game_member(game_row.id)
  ));

drop policy if exists answers_read_reveal_membership on public.answers;
create policy answers_read_reveal_membership on public.answers for select to authenticated
  using (exists (
    select 1
    from public.rounds round_row
    join public.games game_row on game_row.id = round_row.game_id
    where round_row.id = answers.round_id
      and game_row.phase = 'reveal'
      and public.is_game_member(game_row.id)
  ));

drop policy if exists results_read_reveal_membership on public.round_results;
create policy results_read_reveal_membership on public.round_results for select to authenticated
  using (exists (
    select 1
    from public.rounds round_row
    join public.games game_row on game_row.id = round_row.game_id
    where round_row.id = round_results.round_id
      and game_row.phase = 'reveal'
      and public.is_game_member(game_row.id)
  ));

create or replace function public.award_round_score(p_round_id uuid, p_points integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  predictor_id uuid;
  game_id_value uuid;
begin
  update public.rounds
  set status = 'reveal', points_awarded = p_points, scored_at = now()
  where id = p_round_id and status = 'scoring' and scored_at is null
  returning predictor_player_id, game_id into predictor_id, game_id_value;

  if not found then
    return false;
  end if;

  update public.players set score = score + p_points where id = predictor_id;
  if not found then
    raise exception 'Predictor does not exist for round %', p_round_id;
  end if;

  update public.games set phase = 'reveal' where id = game_id_value and phase = 'scoring';
  if not found then
    raise exception 'Game was not ready to reveal for round %', p_round_id;
  end if;

  return true;
end;
$$;

revoke all on function public.award_round_score(uuid, integer) from public, anon, authenticated;
grant execute on function public.award_round_score(uuid, integer) to service_role;
