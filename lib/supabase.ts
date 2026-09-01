import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Supabase is not configured.");
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

export type GameRow = {
  id: string; code: string; phase: "waiting" | "predicting" | "answering" | "reveal";
  current_round: number; creator_player_id: string | null; expires_at: string;
};
export type PlayerRow = { id: string; game_id: string; name: string; token_hash: string; role: "creator" | "joiner"; score: number };
export type RoundRow = { id: string; game_id: string; round_number: number; subject_player_id: string; predictor_player_id: string; status: string };
export type QuestionRow = { id: string; round_id: string; position: number; prompt: string };
export type OptionRow = { id: string; question_id: string; position: number; label: string };
