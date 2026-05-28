export const POOL_LIST = [
  { id: "hallenbad_city",  label: "Hallenbad City",           color: "#2563eb", short: "Hallenbad"   },
  { id: "mythenquai",      label: "Strandbad Mythenquai",     color: "#16a34a", short: "Mythenquai"  },
  { id: "enge",            label: "Seebad Enge",              color: "#ea580c", short: "Enge"        },
  { id: "oberer_letten",   label: "Flussbad Oberer Letten",   color: "#7c3aed", short: "Ob. Letten"  },
  { id: "unterer_letten",  label: "Flussbad Unterer Letten",  color: "#db2777", short: "Unt. Letten" },
];

export const POOL_BY_ID = Object.fromEntries(POOL_LIST.map((p) => [p.id, p]));
