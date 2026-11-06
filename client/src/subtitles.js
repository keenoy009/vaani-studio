// Movie-style subtitles: a long line is split into short pieces that each fit on ONE row,
// and each piece is shown for its share of the line's time (split by character count).

const MAX_CHARS = 38; // characters per subtitle row (Indic scripts are wide, so keep it short)

export function chunkText(text, max = MAX_CHARS) {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  // 1) break at sentence / clause punctuation (including the Hindi danda), 2) pack words into rows
  const parts = clean.match(/[^.!?।,;:]+[.!?।,;:]*/g) || [clean];
  const rows = [];
  for (const part of parts) {
    let cur = "";
    for (const word of part.trim().split(" ")) {
      if (cur && (cur + " " + word).length > max) { rows.push(cur); cur = word; }
      else cur = cur ? `${cur} ${word}` : word;
    }
    if (cur) rows.push(cur);
  }
  // 3) merge tiny leftovers (e.g. a lone "है।") into the previous row when it still fits reasonably
  const merged = [];
  for (const r of rows) {
    const prev = merged[merged.length - 1];
    if (prev && r.length < 9 && (prev + " " + r).length <= max + 8) merged[merged.length - 1] = `${prev} ${r}`;
    else merged.push(r);
  }
  return merged;
}

/** The row to show at time t for a line that runs from `start` for `span` seconds. */
export function rowAt(rows, start, span, t) {
  if (rows.length === 0) return "";
  const total = rows.reduce((n, r) => n + r.length, 0) || 1;
  const p = Math.min(0.999, Math.max(0, (t - start) / (span || 1)));
  let acc = 0;
  for (const r of rows) {
    acc += r.length / total;
    if (p < acc) return r;
  }
  return rows[rows.length - 1];
}
