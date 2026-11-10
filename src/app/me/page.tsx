import { BoardApp } from "@/components/board-app";
import { getBoardState } from "@/lib/board";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function MePage() {
  const board = await getBoardState();
  return <BoardApp initial={board} view="me" />;
}
