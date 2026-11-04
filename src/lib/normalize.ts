/** Nom normalisé pour la recherche : minuscules, sans accents, espaces uniques. */
export function normalizeName(...parts: (string | null | undefined)[]) {
  return parts.filter(Boolean).join(" ").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9' -]/g, " ").replace(/\s+/g, " ").trim();
}

/** Téléphone : 9 derniers chiffres (0991234567 et +243 991 234 567 donnent le même résultat). */
export function phoneDigits(phone?: string | null) {
  const d = (phone ?? "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : null;
}

/** Bornes de la journée en cours à Goma (UTC+2, sans heure d'été). */
export function todayBounds(now = new Date()) {
  const offset = 2 * 3600e3;
  const local = new Date(now.getTime() + offset);
  const start = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offset);
  return { start, end: new Date(start.getTime() + 24 * 3600e3) };
}
