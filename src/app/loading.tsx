import "../components/deal-board.css";

export default function Loading() {
  return (
    <div className="perk-board pr-app">
      <div className="board-loading pr-loading" role="status" data-testid="loading">正在读取服务器上的真实结果…</div>
    </div>
  );
}
