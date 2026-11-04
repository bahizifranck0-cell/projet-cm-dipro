// Vérifie les contrastes du thème selon WCAG 2.1 AA :
// texte ≥ 4,5:1 ; bordures de champs, cases à cocher et boutons ≥ 3:1 (critère 1.4.11).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("src/app/globals.css", "utf8");
const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
const token = (n: string) => {
  const m = root.match(new RegExp(`--${n}:\\s*([^;]+);`));
  if (!m) throw new Error(`jeton --${n} introuvable`);
  return m[1].trim();
};

type RGBA = [number, number, number, number];
function parse(c: string): RGBA {
  if (c.startsWith("#")) { const h = c.slice(1); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1) as RGBA; }
  const m = c.match(/rgba?\(([^)]+)\)/)!; const p = m[1].split(",").map((x) => parseFloat(x));
  return [p[0], p[1], p[2], p[3] ?? 1];
}
const over = (fg: RGBA, bg: RGBA): RGBA => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1) as RGBA;
const lum = ([r, g, b]: RGBA) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a: RGBA, b: RGBA) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const bg950 = parse(token("brand-950")), bg900 = parse(token("brand-900"));
// Fond d'une carte en verre posée sur le fond le plus clair (pire cas)
const card = over(parse(token("glass-bg")), bg900);
const cardStrong = over(parse(token("glass-bg-strong")), bg900);
const fieldBg = over([4, 17, 46, 0.55], card);

// Barres fixes (« glass-solid ») : pire cas = contenu blanc qui passe derrière
const solid = css.match(/\.glass-solid \{[^}]*background: (rgba\([^)]+\))/)![1];
const solidOnWhite = over(parse(solid), [255, 255, 255, 1]);

const cases: [string, RGBA, RGBA, number][] = [
  ["Libellé de la barre basse (sur contenu blanc)", over([243, 247, 255, 0.8], solidOnWhite), solidOnWhite, 4.5],
  ["Texte principal sur fond", parse(token("text")), bg900, 4.5],
  ["Texte principal sur carte", parse(token("text")), cardStrong, 4.5],
  ["Texte secondaire sur carte", over(parse(token("text-muted")), card), card, 4.5],
  ["Texte secondaire sur carte claire", over(parse(token("text-muted")), cardStrong), cardStrong, 4.5],
  ["Bouton principal (blanc sur bleu)", [255, 255, 255, 1], parse(token("brand-600")), 4.5],
  ["Bouton principal survolé", [255, 255, 255, 1], parse(token("brand-700")), 4.5],
  ["Lien bleu clair sur fond", parse(token("brand-300")), bg900, 4.5],
  ["Texte d'erreur (rouge) sur carte", parse(token("danger")), card, 4.5],
  ["Texte de succès sur carte", parse(token("success")), card, 4.5],
  ["Bordure de case à cocher", over(parse(token("control-border")), bg950), bg950, 3],
  ["Bordure de case à cocher sur carte", over(parse(token("control-border")), fieldBg), card, 3],
  ["Bordure de champ sur carte", over(parse(token("field-border")), fieldBg), card, 3],
];

for (const [name, fg, bg, min] of cases) {
  test(`${name} ≥ ${min}:1`, () => {
    const r = ratio(fg, bg);
    assert.ok(r >= min, `${name} : ${r.toFixed(2)}:1 (minimum ${min}:1)`);
  });
}
