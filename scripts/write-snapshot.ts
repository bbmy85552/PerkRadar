import { getBoardState } from "../src/lib/board";
import { writeDealSnapshot } from "../src/lib/snapshot";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(".env");
  } catch {
    // A missing local .env is fine; DATABASE_URL may already be in the environment.
  }
}

const board = await getBoardState();
const target = writeDealSnapshot(board);
if (!target) {
  console.error("snapshot directory is off or missing");
  process.exit(1);
}
console.log(target);
