export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" }) : "";

export const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString("sv-SE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";