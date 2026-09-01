import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseSecretKey, getSupabaseUrl } from "./supabase/config";

let client: SupabaseClient | undefined;

export function db(): SupabaseClient {
  if (!client) {
    client = createClient(getSupabaseUrl(), getSupabaseSecretKey(), {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return client;
}

export type GameRow = {
  id: string; code: string; phase: "waiting" | "generating" | "predicting" | "answering" | "scoring" | "reveal";
  current_round: number; creator_player_id: string | null; expires_at: string;
};
export type PlayerRow = {
  id: string; game_id: string; auth_user_id: string; name: string; role: "creator" | "joiner"; score: number;
};
export type RoundRow = {
  id: string; game_id: string; round_number: number; subject_player_id: string; predictor_player_id: string; status: string;
};
export type QuestionRow = { id: string; round_id: string; position: number; prompt: string };
export type OptionRow = { id: string; question_id: string; position: number; label: string };
