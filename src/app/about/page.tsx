import { BoardApp } from "@/components/board-app";
import { getBoardState } from "@/lib/board";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AboutPage() {
  const board = await getBoardState();
  return <BoardApp initial={board} view="about" />;
}
