import GameClient from "../components/GameClient";
import { getProfileForUser, listGames } from "../lib/game-service";
import { getOptionalUser } from "../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getOptionalUser();
  if (!user) return <GameClient />;

  const [profile, games] = await Promise.all([getProfileForUser(user), listGames(user)]);
  return <GameClient session={{ displayName: profile.display_name, games }} />;
}
