export const POOL_LIST = [
  { id: "hallenbad_city",  label: "Hallenbad City",           color: "#2563eb", short: "Hallenbad",   openStart: 6,  openEnd: 22 },
  { id: "mythenquai",      label: "Strandbad Mythenquai",     color: "#16a34a", short: "Mythenquai",  openStart: 7,  openEnd: 21 },
  { id: "enge",            label: "Seebad Enge",              color: "#ea580c", short: "Enge",        openStart: 9,  openEnd: 20 },
  { id: "oberer_letten",   label: "Flussbad Oberer Letten",   color: "#7c3aed", short: "Ob. Letten",  openStart: 9,  openEnd: 21 },
  { id: "unterer_letten",  label: "Flussbad Unterer Letten",  color: "#db2777", short: "Unt. Letten", openStart: 9,  openEnd: 21 },
  { id: "utoquai",         label: "Seebad Utoquai",           color: "#0891b2", short: "Utoquai",     openStart: 7,  openEnd: 21 },
];

export const POOL_BY_ID = Object.fromEntries(POOL_LIST.map((p) => [p.id, p]));
