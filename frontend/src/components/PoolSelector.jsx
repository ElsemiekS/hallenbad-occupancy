import { POOL_LIST } from "../pools.js";

// Renders a row of toggle pills — one per pool.
// selectedPools: string[] of active pool IDs
// onChange: (newSelectedPools: string[]) => void
export function PoolSelector({ selectedPools, onChange }) {
  function toggle(id) {
    if (selectedPools.includes(id)) {
      // Don't allow deselecting the last pool
      if (selectedPools.length === 1) return;
      onChange(selectedPools.filter((p) => p !== id));
    } else {
      onChange([...selectedPools, id]);
    }
  }

  return (
    <div className="pool-selector">
      {POOL_LIST.map((pool) => {
        const active = selectedPools.includes(pool.id);
        return (
          <button
            key={pool.id}
            className={`pool-chip ${active ? "active" : ""}`}
            style={active ? { background: pool.color, borderColor: pool.color } : { borderColor: pool.color }}
            onClick={() => toggle(pool.id)}
          >
            <span className="pool-chip-dot" style={{ background: active ? "#fff" : pool.color }} />
            {pool.short}
          </button>
        );
      })}
    </div>
  );
}
