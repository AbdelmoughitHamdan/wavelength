import { db, GameRow, OptionRow, PlayerRow, QuestionRow, RoundRow } from "./supabase";
import { hashToken, newPlayerToken } from "./auth";
import { generateQuestions } from "./gemini";
import { GameError } from "./errors";
import { GeneratedQuestion } from "./validation";
import { randomInt } from "crypto";

const CODE = /^[A-Z2-9]{6}$/;
const check = <T>(result: { data: T | null; error: { message: string } | null }, message: string): T => {
  if (result.error) throw new GameError(`${message}: ${result.error.message}`, 500);
  if (!result.data) throw new GameError(message, 404);
  return result.data;
};
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const code = () => Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
async function findGame(input: string) {
  const normalized = input.trim().toUpperCase();
  if (!CODE.test(normalized)) throw new GameError("That game code is not valid.", 404);
  const result = await db().from("games").select("*").eq("code", normalized).maybeSingle();
  if (result.error) throw new GameError(`Could not load game: ${result.error.message}`, 500);
  if (!result.data || new Date(result.data.expires_at).getTime() < Date.now()) throw new GameError("This game link has expired or does not exist.", 404);
  return result.data as GameRow;
}
async function playerFor(gameId: string, token?: string): Promise<PlayerRow | null> {
  if (!token) return null;
  const result = await db().from("players").select("*").eq("game_id", gameId).eq("token_hash", hashToken(token)).maybeSingle();
  if (result.error) throw new GameError(`Could not authenticate player: ${result.error.message}`, 500);
  return result.data as PlayerRow | null;
}
async function requirePlayer(game: GameRow, token: string | undefined) {
  const player = await playerFor(game.id, token);
  if (!player) throw new GameError("Join this game before playing.", 401);
  return player;
}
async function players(gameId: string) {
  const result = await db().from("players").select("id,game_id,name,role,score,token_hash").eq("game_id", gameId).order("joined_at");
  return check(result, "Could not load players") as PlayerRow[];
}
export async function createGame(name: string) {
  const token = newPlayerToken();
  const g = await db().from("games").insert({ code: code(), phase: "waiting", expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString() }).select("*").single();
  if (g.error) throw new GameError(`Could not create game: ${g.error.message}`, 500);
  const game = g.data as GameRow;
  const p = await db().from("players").insert({ game_id: game.id, name, role: "creator", token_hash: hashToken(token) }).select("id").single();
  const creator = check(p, "Could not create player") as { id: string };
  const moved = await db().from("games").update({ creator_player_id: creator.id }).eq("id", game.id);
  if (moved.error) throw new GameError(`Could not attach player: ${moved.error.message}`, 500);
  return { code: game.code, token };
}
export async function joinGame(input: string, name: string) {
  const game = await findGame(input);
  if (game.phase !== "waiting") throw new GameError("This game is no longer accepting players.", 409);
  const count = await db().from("players").select("id", { count: "exact", head: true }).eq("game_id", game.id);
  if (count.error) throw new GameError(`Could not check game capacity: ${count.error.message}`, 500);
  if ((count.count ?? 0) >= 2) throw new GameError("This game already has two players.", 409);
  const token = newPlayerToken();
  const result = await db().from("players").insert({ game_id: game.id, name, role: "joiner", token_hash: hashToken(token) }).select("id").single();
  check(result, "Could not join game");
  return { token };
}
async function currentRound(game: GameRow) {
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
export async function startRound(input: string, token: string | undefined) {
  const game = await findGame(input);
  const creator = await requirePlayer(game, token);
  if (creator.role !== "creator") throw new GameError("Only the creator can start a round.", 403);
  if (game.phase !== "waiting" && game.phase !== "reveal") throw new GameError("This game is already in a round.", 409);
  const allPlayers = await players(game.id);
  if (allPlayers.length !== 2) throw new GameError("Waiting for one more player.", 409);
  const subject = allPlayers.find((p) => p.id === (game.current_round % 2 === 0 ? creator.id : allPlayers.find((p) => p.role === "joiner")?.id));
  const fallbackSubject = allPlayers[game.current_round % 2];
  const subjectPlayer = subject ?? fallbackSubject;
  const predictor = allPlayers.find((p) => p.id !== subjectPlayer.id)!;
  const generated = await generateQuestions(subjectPlayer.name);
  const roundNumber = game.phase === "waiting" ? 1 : game.current_round + 1;
  const round = await db().from("rounds").insert({ game_id: game.id, round_number: roundNumber, subject_player_id: subjectPlayer.id, predictor_player_id: predictor.id, status: "predicting" }).select("*").single();
  const roundData = check(round, "Could not create round") as RoundRow;
  try {
    for (let i = 0; i < generated.length; i += 1) {
      const questionResult = await db().from("questions").insert({ round_id: roundData.id, position: i, prompt: generated[i].prompt }).select("id").single();
      const question = check(questionResult, "Could not save question") as { id: string };
      const optionResult = await db().from("options").insert(generated[i].options.map((label, position) => ({ question_id: question.id, position, label })));
      if (optionResult.error) throw new GameError(`Could not save options: ${optionResult.error.message}`, 500);
    }
    const updated = await db().from("games").update({ phase: "predicting", current_round: roundNumber }).eq("id", game.id).eq("phase", game.phase).select("id").maybeSingle();
    check(updated, "The round changed while starting; refresh and try again");
  } catch (error) {
    const cleanup = await db().from("rounds").delete().eq("id", roundData.id);
    if (cleanup.error) console.error("failed to clean up incomplete round", cleanup.error);
    throw error;
  }
  return { ok: true };
}
function validChoices(choices: Array<{ questionId: string; optionId: string }>, questions: Array<QuestionRow & { options: OptionRow[] }>) {
  if (new Set(choices.map((c) => c.questionId)).size !== 3) throw new GameError("Answer each question exactly once.");
  for (const choice of choices) {
    const q = questions.find((item) => item.id === choice.questionId);
    if (!q || !q.options.some((option) => option.id === choice.optionId)) throw new GameError("One of those options is not valid.");
  }
}
export async function submitPredictions(input: string, token: string | undefined, predictions: Array<{ questionId: string; optionId: string }>) {
  const game = await findGame(input);
  const predictor = await requirePlayer(game, token);
  const round = await currentRound(game);
  if (!round || game.phase !== "predicting" || round.predictor_player_id !== predictor.id) throw new GameError("It is not your prediction turn.", 403);
  const questions = await questionsFor(round.id);
  validChoices(predictions, questions);
  const existing = await db().from("predictions").select("id").eq("round_id", round.id).limit(1).maybeSingle();
  if (existing.data) throw new GameError("Predictions are already submitted.", 409);
  const inserted = await db().from("predictions").insert(predictions.map((choice) => ({ round_id: round.id, question_id: choice.questionId, player_id: predictor.id, option_id: choice.optionId })));
  if (inserted.error) throw new GameError(`Could not save predictions: ${inserted.error.message}`, 500);
  const moved = await db().from("games").update({ phase: "answering" }).eq("id", game.id).eq("phase", "predicting").select("id").maybeSingle();
  check(moved, "The game changed while saving; refresh");
  const roundMoved = await db().from("rounds").update({ status: "answering" }).eq("id", round.id).eq("status", "predicting");
  if (roundMoved.error) throw new GameError(`Could not advance round: ${roundMoved.error.message}`, 500);
  return { ok: true };
}
export async function submitAnswers(input: string, token: string | undefined, answers: Array<{ questionId: string; optionId: string }>) {
  const game = await findGame(input);
  const subject = await requirePlayer(game, token);
  const round = await currentRound(game);
  if (!round || game.phase !== "answering" || round.subject_player_id !== subject.id) throw new GameError("It is not your answer turn.", 403);
  const questions = await questionsFor(round.id);
  validChoices(answers, questions);
  const existing = await db().from("answers").select("id").eq("round_id", round.id).limit(1).maybeSingle();
  if (existing.data) throw new GameError("Answers are already submitted.", 409);
  const inserted = await db().from("answers").insert(answers.map((choice) => ({ round_id: round.id, question_id: choice.questionId, player_id: subject.id, option_id: choice.optionId })));
  if (inserted.error) throw new GameError(`Could not save answers: ${inserted.error.message}`, 500);
  const predictionResult = await db().from("predictions").select("question_id,option_id").eq("round_id", round.id);
  const predictionRows = check(predictionResult, "Could not load predictions") as Array<{ question_id: string; option_id: string }>;
  const resultRows = answers.map((answer) => {
    const prediction = predictionRows.find((row) => row.question_id === answer.questionId);
    const matched = prediction?.option_id === answer.optionId;
    return { round_id: round.id, question_id: answer.questionId, prediction_option_id: prediction?.option_id, answer_option_id: answer.optionId, matched, points: matched ? 1 : 0 };
  });
  const savedResults = await db().from("round_results").insert(resultRows);
  if (savedResults.error) throw new GameError(`Could not save score: ${savedResults.error.message}`, 500);
  const points = resultRows.reduce((sum, row) => sum + row.points, 0);
  const predictor = (await players(game.id)).find((player) => player.id === round.predictor_player_id);
  if (!predictor) throw new GameError("The predicting player is no longer available.", 409);
  const scoreUpdate = await db().from("players").update({ score: predictor.score + points }).eq("id", predictor.id);
  if (scoreUpdate.error) throw new GameError(`Could not update score: ${scoreUpdate.error.message}`, 500);
  const moved = await db().from("games").update({ phase: "reveal" }).eq("id", game.id).eq("phase", "answering").select("id").maybeSingle();
  check(moved, "The game changed while revealing; refresh");
  const roundMoved = await db().from("rounds").update({ status: "reveal" }).eq("id", round.id).eq("status", "answering");
  if (roundMoved.error) throw new GameError(`Could not advance round: ${roundMoved.error.message}`, 500);
  return { ok: true };
}
export async function nextRound(input: string, token: string | undefined) {
  const game = await findGame(input);
  const player = await requirePlayer(game, token);
  if (game.phase !== "reveal") throw new GameError("The reveal is not finished.", 409);
  const all = await players(game.id);
  if (all.length !== 2 || !all.some((p) => p.id === player.id)) throw new GameError("Invalid game players.", 403);
  const moved = await db().from("games").update({ phase: "waiting" }).eq("id", game.id).eq("phase", "reveal").select("id").maybeSingle();
  check(moved, "Another player is already continuing this round");
  return { ok: true };
}
export async function getGameView(input: string, token?: string) {
  const game = await findGame(input);
  const allPlayers = await players(game.id);
  const me = await playerFor(game.id, token);
  const view: Record<string, unknown> = {
    code: game.code, phase: game.phase, currentRound: game.current_round,
    me: me ? { id: me.id, name: me.name, role: me.role, score: me.score } : null,
    players: allPlayers.map((p) => ({ id: p.id, name: p.name, role: p.role, score: p.score }))
  };
  const round = await currentRound(game);
  if (!round || !me) return view;
  const canSeeQuestions = game.phase === "reveal" || (game.phase === "predicting" && me.id === round.predictor_player_id) || (game.phase === "answering" && me.id === round.subject_player_id);
  view.round = { number: round.round_number, subject: round.subject_player_id, predictor: round.predictor_player_id, questions: canSeeQuestions ? await questionsFor(round.id) : [] };
  if (game.phase === "reveal") {
    const [pred, ans, results] = await Promise.all([
      db().from("predictions").select("question_id,option_id").eq("round_id", round.id),
      db().from("answers").select("question_id,option_id").eq("round_id", round.id),
      db().from("round_results").select("question_id,matched,points").eq("round_id", round.id)
    ]);
    view.reveal = { predictions: check(pred, "Could not load reveal") , answers: check(ans, "Could not load reveal"), results: check(results, "Could not load reveal") };
  }
  return view;
}
