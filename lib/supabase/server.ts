import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { GameError } from "../errors";
import { getSupabasePublishableKey, getSupabaseUrl } from "./config";

export type AuthCookie = { name: string; value: string; options: CookieOptions };

export function createServerSupabaseClient() {
  const cookieStore = cookies();
  return createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items) => {
        try {
          items.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot set cookies; middleware refreshes the session instead.
        }
      }
    }
  });
}

export function createRequestSupabaseClient(request: NextRequest) {
  return createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: () => {}
    }
  });
}

export function createAuthRouteSupabaseClient(
  request: NextRequest,
  onCookies: (items: AuthCookie[], headers: Record<string, string>) => void
) {
  return createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: onCookies
    }
  });
}

export async function getOptionalUser(): Promise<User | null> {
  const { data, error } = await createServerSupabaseClient().auth.getUser();
  return error ? null : data.user;
}

export async function getAuthenticatedUser(request: NextRequest): Promise<User> {
  const { data, error } = await createRequestSupabaseClient(request).auth.getUser();
  if (error || !data.user) throw new GameError("Please log in to play.", 401);
  return data.user;
}
