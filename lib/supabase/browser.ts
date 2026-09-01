"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublishableKey, getSupabaseUrl } from "./config";

let client: ReturnType<typeof createBrowserClient> | undefined;

export function createBrowserSupabaseClient() {
  if (!client) client = createBrowserClient(getSupabaseUrl(), getSupabasePublishableKey());
  return client;
}
