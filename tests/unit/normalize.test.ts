import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeName, phoneDigits, todayBounds } from "../../src/lib/normalize";

test("noms : accents, majuscules et espaces ignorés", () => {
  assert.equal(normalizeName("  MUHINDO ", "Kahindo", "Élodie"), "muhindo kahindo elodie");
  assert.equal(normalizeName("N'Sele"), "n'sele");
});
test("téléphone : formats congolais équivalents", () => {
  assert.equal(phoneDigits("0991 234 567"), "991234567");
  assert.equal(phoneDigits("+243 991-234-567"), "991234567");
  assert.equal(phoneDigits("1234"), null);
});
test("journée à Goma (UTC+2)", () => {
  const { start, end } = todayBounds(new Date("2026-11-04T23:30:00Z")); // 01:30 le 5 à Goma
  assert.equal(start.toISOString(), "2026-11-04T22:00:00.000Z");
  assert.equal(end.getTime() - start.getTime(), 86400e3);
});
