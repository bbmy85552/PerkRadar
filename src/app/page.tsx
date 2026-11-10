import { DealBoard } from "@/components/deal-board";
import { getBoardState } from "@/lib/board";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function HomePage() {
  const board = await getBoardState();
  return <DealBoard initial={board} />;
}
