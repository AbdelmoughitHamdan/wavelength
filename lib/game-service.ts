import type { User } from "@supabase/supabase-js";
import { randomInt } from "crypto";
import { GameError } from "./errors";
import { generateQuestions } from "./gemini";
import { db, GameRow, OptionRow, PlayerRow, QuestionRow, RoundRow } from "./supabase";

const CODE = /^[A-Z2-9]{6}$/;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type Profile = { id: string; display_name: string };
type Choice = { questionId: string; optionId: string };

const check = <T>(result: { data: T | null; error: { message: string } | null }, message: string): T => {
  if (result.error) throw new GameError(`${message}: ${result.error.message}`, 500);
  if (!result.data) throw new GameError(message, 404);
  return result.data;
};

const code = () => Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");

function fallbackDisplayName(user: User) {
  const candidate = typeof user.user_metadata.display_name === "string" ? user.user_metadata.display_name.trim() : "";
  if (candidate.length >= 2 && candidate.length <= 24) return candidate;
  const emailName = user.email?.split("@")[0]?.trim() ?? "";
  return emailName.length >= 2 && emailName.length <= 24 ? emailName : "Player";
}

export async function getProfileForUser(user: User): Promise<Profile> {
  const existing = await db().from("profiles").select("id,display_name").eq("id", user.id).maybeSingle();
  if (existing.error) throw new GameError(`Could not load your profile: ${existing.error.message}`, 500);
  if (existing.data) return existing.data as Profile;

  const profile = { id: user.id, display_name: fallbackDisplayName(user) };
  const inserted = await db().from("profiles").upsert(profile, { onConflict: "id", ignoreDuplicates: true }).select("id,display_name").maybeSingle();
  if (inserted.error) throw new GameError(`Could not create your profile: ${inserted.error.message}`, 500);
  if (inserted.data) return inserted.data as Profile;
  const racedProfile = await db().from("profiles").select("id,display_name").eq("id", user.id).single();
  return check(racedProfile, "Could not load your profile") as Profile;
}

async function findGame(input: string) {
  const normalized = input.trim().toUpperCase();
  if (!CODE.test(normalized)) throw new GameError("That game code is not valid.", 404);
  const result = await db().from("games").select("*").eq("code", normalized).maybeSingle();
  if (result.error) throw new GameError(`Could not load game: ${result.error.message}`, 500);
  if (!result.data || new Date(result.data.expires_at).getTime() < Date.now()) {
    throw new GameError("This game link has expired or does not exist.", 404);
  }
  return result.data as GameRow;
}

async function playerFor(gameId: string, userId: string): Promise<PlayerRow | null> {
  const result = await db()
    .from("players")
    .select("id,game_id,auth_user_id,name,role,score")
    .eq("game_id", gameId)
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (result.error) throw new GameError(`Could not authenticate player: ${result.error.message}`, 500);
  return result.data as PlayerRow | null;
}

async function requirePlayer(game: GameRow, user: User) {
  const player = await playerFor(game.id, user.id);
  if (!player) throw new GameError("Join this game before playing.", 403);
  return player;
}

async function players(gameId: string) {
  const result = await db()
    .from("players")
    .select("id,game_id,auth_user_id,name,role,score")
    .eq("game_id", gameId)
    .order("joined_at");
  return check(result, "Could not load players") as PlayerRow[];
}

async function currentRound(game: GameRow) {
  if (game.current_round === 0) return null;
  const result = await db().from("rounds").select("*").eq("game_id", game.id).eq("round_number", game.current_round).maybeSingle();
  if (result.error) throw new GameError(`Could not load round: ${result.error.message}`, 500);
  return result.data as RoundRow | null;
}

async function questionsFor(roundId: string) {
  const q = await db().from("questions").select("*").eq("round_id", roundId).order("position");
  const questions = check(q, "Could not load questions") as QuestionRow[];
  const result: Array<QuestionRow & { options: OptionRow[] }> = [];
  for (const question of questions) {
    const options = await db().from("options").select("*").eq("question_id", question.id).order("position");
    result.push({ ...question, options: check(options, "Could not load options") as OptionRow[] });
  }
  return result;
}

export async function createGame(user: User) {
  const profile = await getProfileForUser(user);
  let game: GameRow | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await db()
      .from("games")
      .insert({ code: code(), phase: "waiting", expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString() })
      .select("*")
      .single();
    if (!result.error) {
      game = result.data as GameRow;
      break;
    }
    if (result.error.code !== "23505") throw new GameError(`Could not create game: ${result.error.message}`, 500);
  }
  if (!game) throw new GameError("Could not reserve a game code. Please try again.", 503);

  const player = await db()
    .from("players")
    .insert({ game_id: game.id, auth_user_id: user.id, name: profile.display_name, role: "creator" })
    .select("id")
    .single();
  const creator = check(player, "Could not create player") as { id: string };
  const moved = await db().from("games").update({ creator_player_id: creator.id }).eq("id", game.id);
  if (moved.error) throw new GameError(`Could not attach player: ${moved.error.message}`, 500);
  return { code: game.code };
}

export async function joinGame(input: string, user: User) {
  const game = await findGame(input);
  if (game.phase !== "waiting") throw new GameError("This game is no longer accepting players.", 409);
  if (await playerFor(game.id, user.id)) throw new GameError("You are already in this game.", 409);

  const count = await db().from("players").select("id", { count: "exact", head: true }).eq("game_id", game.id);
  if (count.error) throw new GameError(`Could not check game capacity: ${count.error.message}`, 500);
  if ((count.count ?? 0) >= 2) throw new GameError("This game already has two players.", 409);

  const profile = await getProfileForUser(user);
  const joined = await db()
    .from("players")
    .insert({ game_id: game.id, auth_user_id: user.id, name: profile.display_name, role: "joiner" })
    .select("id")
    .single();
  if (joined.error) {
    if (joined.error.code === "23505") {
      if (await playerFor(game.id, user.id)) throw new GameError("You are already in this game.", 409);
      throw new GameError("This game already has two players.", 409);
    }
    throw new GameError(`Could not join game: ${joined.error.message}`, 500);
  }
  return { code: game.code };
}

export type MyGame = {
  code: string;
  phase: GameRow["phase"];
  currentRound: number;
  role: PlayerRow["role"];
};

export async function listGames(user: User): Promise<MyGame[]> {
  const memberships = await db().from("players").select("game_id,role").eq("auth_user_id", user.id);
  if (memberships.error) throw new GameError(`Could not load your games: ${memberships.error.message}`, 500);
  if (!memberships.data?.length) return [];

  const games = await db()
    .from("games")
    .select("id,code,phase,current_round,updated_at")
    .in("id", memberships.data.map((membership) => membership.game_id))
    .gt("expires_at", new Date().toISOString())
    .order("updated_at", { ascending: false });
  if (games.error) throw new GameError(`Could not load your games: ${games.error.message}`, 500);
  const roleByGame = new Map(memberships.data.map((membership) => [membership.game_id, membership.role]));
  return games.data.map((game) => ({
    code: game.code,
    phase: game.phase as GameRow["phase"],
    currentRound: game.current_round,
    role: roleByGame.get(game.id) as PlayerRow["role"]
  }));
}

export async function startRound(input: string, user: User) {
  const game = await findGame(input);
  const creator = await requirePlayer(game, user);
  if (creator.role !== "creator") throw new GameError("Only the creator can start a round.", 403);
  if (game.phase === "generating") throw new GameError("The next round is already being prepared.", 409);
  if (game.phase !== "waiting" && game.phase !== "reveal") throw new GameError("This game is already in a round.", 409);

  const allPlayers = await players(game.id);
  if (allPlayers.length !== 2) throw new GameError("Waiting for one more player.", 409);
  const claimed = await db()
    .from("games")
    .update({ phase: "generating" })
    .eq("id", game.id)
    .eq("phase", game.phase)
    .select("id")
    .maybeSingle();
  if (claimed.error) throw new GameError(`Could not prepare the round: ${claimed.error.message}`, 500);
  if (!claimed.data) throw new GameError("Another player is already preparing this round.", 409);

  const roundNumber = game.current_round + 1;
  const subjectPlayer = allPlayers[game.current_round % 2];
  const predictor = allPlayers.find((player) => player.id !== subjectPlayer.id);
  if (!predictor) throw new GameError("Invalid game players.", 409);
  let roundId: string | undefined;
  try {
    const insertedRound = await db()
      .from("rounds")
      .insert({
        game_id: game.id,
        round_number: roundNumber,
        subject_player_id: subjectPlayer.id,
        predictor_player_id: predictor.id,
        status: "generating"
      })
      .select("*")
      .single();
    const round = check(insertedRound, "Could not create round") as RoundRow;
    roundId = round.id;
    const generated = await generateQuestions(subjectPlayer.name);

    for (let position = 0; position < generated.length; position += 1) {
      const questionResult = await db()
        .from("questions")
        .insert({ round_id: round.id, position, prompt: generated[position].prompt })
        .select("id")
        .single();
      const question = check(questionResult, "Could not save question") as { id: string };
      const optionResult = await db()
        .from("options")
        .insert(generated[position].options.map((label, optionPosition) => ({
          question_id: question.id,
          position: optionPosition,
          label
        })));
      if (optionResult.error) throw new GameError(`Could not save options: ${optionResult.error.message}`, 500);
    }

    const roundMoved = await db().from("rounds").update({ status: "predicting" }).eq("id", round.id).eq("status", "generating");
    if (roundMoved.error) throw new GameError(`Could not advance round: ${roundMoved.error.message}`, 500);
    const gameMoved = await db()
      .from("games")
      .update({ phase: "predicting", current_round: roundNumber })
      .eq("id", game.id)
      .eq("phase", "generating")
      .select("id")
      .maybeSingle();
    if (gameMoved.error) throw new GameError(`Could not start round: ${gameMoved.error.message}`, 500);
    if (!gameMoved.data) throw new GameError("The game changed while starting; refresh and try again.", 409);
  } catch (error) {
    if (roundId) {
      const cleanup = await db().from("rounds").delete().eq("id", roundId);
      if (cleanup.error) console.error("failed to clean up incomplete round", cleanup.error);
    }
    const reset = await db().from("games").update({ phase: game.phase }).eq("id", game.id).eq("phase", "generating");
    if (reset.error) console.error("failed to reset game after generation error", reset.error);
    throw error;
  }
  return { ok: true };
}

function validChoices(choices: Choice[], questions: Array<QuestionRow & { options: OptionRow[] }>) {
  if (choices.length !== 3 || new Set(choices.map((choice) => choice.questionId)).size !== 3) {
    throw new GameError("Answer each question exactly once.");
  }
  for (const choice of choices) {
    const question = questions.find((item) => item.id === choice.questionId);
    if (!question || !question.options.some((option) => option.id === choice.optionId)) {
      throw new GameError("One of those options is not valid.");
    }
  }
}

export async function submitPredictions(input: string, user: User, predictions: Choice[]) {
  const game = await findGame(input);
  const predictor = await requirePlayer(game, user);
  const round = await currentRound(game);
  if (!round || game.phase !== "predicting" || round.predictor_player_id !== predictor.id) {
    throw new GameError("It is not your prediction turn.", 403);
  }
  const questions = await questionsFor(round.id);
  validChoices(predictions, questions);
  const existing = await db().from("predictions").select("id").eq("round_id", round.id).limit(1).maybeSingle();
  if (existing.error) throw new GameError(`Could not check predictions: ${existing.error.message}`, 500);
  if (existing.data) throw new GameError("Predictions are already submitted.", 409);

  const inserted = await db().from("predictions").insert(predictions.map((choice) => ({
    round_id: round.id,
    question_id: choice.questionId,
    player_id: predictor.id,
    option_id: choice.optionId
  })));
  if (inserted.error) {
    if (inserted.error.code === "23505") throw new GameError("Predictions are already submitted.", 409);
    throw new GameError(`Could not save predictions: ${inserted.error.message}`, 500);
  }
  const moved = await db().from("games").update({ phase: "answering" }).eq("id", game.id).eq("phase", "predicting").select("id").maybeSingle();
  if (moved.error) throw new GameError(`Could not advance game: ${moved.error.message}`, 500);
  if (!moved.data) throw new GameError("The game changed while saving; refresh.", 409);
  const roundMoved = await db().from("rounds").update({ status: "answering" }).eq("id", round.id).eq("status", "predicting");
  if (roundMoved.error) throw new GameError(`Could not advance round: ${roundMoved.error.message}`, 500);
  return { ok: true };
}

async function awardScore(round: RoundRow, points: number) {
  const awarded = await db().rpc("award_round_score", { p_round_id: round.id, p_points: points });
  if (awarded.error) throw new GameError(`Could not award score: ${awarded.error.message}`, 500);
  return { ok: true };
}

export async function submitAnswers(input: string, user: User, answers: Choice[]) {
  const game = await findGame(input);
  const subject = await requirePlayer(game, user);
  const round = await currentRound(game);
  if (!round || round.subject_player_id !== subject.id) throw new GameError("It is not your answer turn.", 403);
  if (game.phase === "scoring") {
    const savedResults = await db().from("round_results").select("points").eq("round_id", round.id);
    if (savedResults.error || !savedResults.data?.length) throw new GameError("The reveal is still being prepared. Try again shortly.", 409);
    return awardScore(round, savedResults.data.reduce((total, result) => total + result.points, 0));
  }
  if (game.phase !== "answering") throw new GameError("It is not your answer turn.", 403);

  const questions = await questionsFor(round.id);
  validChoices(answers, questions);
  const existing = await db().from("answers").select("id").eq("round_id", round.id).limit(1).maybeSingle();
  if (existing.error) throw new GameError(`Could not check answers: ${existing.error.message}`, 500);
  if (existing.data) throw new GameError("Answers are already submitted.", 409);

  const claimed = await db()
    .from("games")
    .update({ phase: "scoring" })
    .eq("id", game.id)
    .eq("phase", "answering")
    .select("id")
    .maybeSingle();
  if (claimed.error) throw new GameError(`Could not prepare the reveal: ${claimed.error.message}`, 500);
  if (!claimed.data) throw new GameError("The reveal is already being prepared.", 409);

  let points: number;
  try {
    const roundClaim = await db().from("rounds").update({ status: "scoring" }).eq("id", round.id).eq("status", "answering").select("id").maybeSingle();
    if (roundClaim.error) throw new GameError(`Could not prepare round scoring: ${roundClaim.error.message}`, 500);
    if (!roundClaim.data) throw new GameError("The round changed while saving; refresh.", 409);

    const inserted = await db().from("answers").insert(answers.map((choice) => ({
      round_id: round.id,
      question_id: choice.questionId,
      player_id: subject.id,
      option_id: choice.optionId
    })));
    if (inserted.error) throw new GameError(`Could not save answers: ${inserted.error.message}`, 500);

    const predictionResult = await db().from("predictions").select("question_id,option_id").eq("round_id", round.id);
    const predictionRows = check(predictionResult, "Could not load predictions") as Array<{ question_id: string; option_id: string }>;
    const results = answers.map((answer) => {
      const prediction = predictionRows.find((row) => row.question_id === answer.questionId);
      const matched = prediction?.option_id === answer.optionId;
      return {
        round_id: round.id,
        question_id: answer.questionId,
        prediction_option_id: prediction?.option_id,
        answer_option_id: answer.optionId,
        matched,
        points: matched ? 1 : 0
      };
    });
    const savedResults = await db().from("round_results").insert(results);
    if (savedResults.error) throw new GameError(`Could not save score: ${savedResults.error.message}`, 500);
    points = results.reduce((total, result) => total + result.points, 0);
  } catch (error) {
    const [resultsCleanup, answersCleanup] = await Promise.all([
      db().from("round_results").delete().eq("round_id", round.id),
      db().from("answers").delete().eq("round_id", round.id)
    ]);
    if (resultsCleanup.error || answersCleanup.error) console.error("failed to clean up incomplete reveal", resultsCleanup.error ?? answersCleanup.error);
    const [roundReset, gameReset] = await Promise.all([
      db().from("rounds").update({ status: "answering" }).eq("id", round.id).eq("status", "scoring"),
      db().from("games").update({ phase: "answering" }).eq("id", game.id).eq("phase", "scoring")
    ]);
    if (roundReset.error || gameReset.error) console.error("failed to reset incomplete reveal", roundReset.error ?? gameReset.error);
    throw error;
  }
  return awardScore(round, points);
}

export async function nextRound(input: string, user: User) {
  const game = await findGame(input);
  await requirePlayer(game, user);
  if (game.phase !== "reveal") throw new GameError("The reveal is not finished.", 409);
  const moved = await db().from("games").update({ phase: "waiting" }).eq("id", game.id).eq("phase", "reveal").select("id").maybeSingle();
  if (moved.error) throw new GameError(`Could not continue: ${moved.error.message}`, 500);
  if (!moved.data) throw new GameError("Another player is already continuing this round.", 409);
  return { ok: true };
}

export async function getGameView(input: string, user: User) {
  const game = await findGame(input);
  const me = await requirePlayer(game, user);
  const allPlayers = await players(game.id);
  const view: Record<string, unknown> = {
    code: game.code,
    phase: game.phase,
    currentRound: game.current_round,
    me: { id: me.id, name: me.name, role: me.role, score: me.score },
    players: allPlayers.map((player) => ({ id: player.id, name: player.name, role: player.role, score: player.score }))
  };
  const round = await currentRound(game);
  if (!round) return view;

  const canSeeQuestions = game.phase === "reveal"
    || (game.phase === "predicting" && me.id === round.predictor_player_id)
    || (game.phase === "answering" && me.id === round.subject_player_id);
  view.round = {
    number: round.round_number,
    subject: round.subject_player_id,
    predictor: round.predictor_player_id,
    questions: canSeeQuestions ? await questionsFor(round.id) : []
  };
  if (game.phase === "reveal") {
    const [predictions, answers, results] = await Promise.all([
      db().from("predictions").select("question_id,option_id").eq("round_id", round.id),
      db().from("answers").select("question_id,option_id").eq("round_id", round.id),
      db().from("round_results").select("question_id,matched,points").eq("round_id", round.id)
    ]);
    view.reveal = {
      predictions: check(predictions, "Could not load reveal"),
      answers: check(answers, "Could not load reveal"),
      results: check(results, "Could not load reveal")
    };
  }
  return view;
}
