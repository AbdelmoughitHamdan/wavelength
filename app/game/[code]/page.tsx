import GameClient from "../../../components/GameClient";

export default function GamePage({ params }: { params: { code: string } }) {
  return <GameClient initialCode={params.code.toUpperCase()} />;
}
