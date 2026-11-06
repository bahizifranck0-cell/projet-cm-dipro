// Mode revue : commentaires posés sur un élément précis de l'interface.
// Actif seulement si CMDPRO_REVIEW=1. Lecture et suivi par Claude via un jeton (CMDPRO_REVIEW_TOKEN).
import { timingSafeEqual } from "node:crypto";
import { db } from "../db";
import { ValidationError, type Actor } from "../auth/actor";

export const REVIEW_ACTIONS = ["modifier", "supprimer", "deplacer", "ameliorer", "bug"] as const;
export const REVIEW_STATUSES = ["nouveau", "en_cours", "en_test", "fait", "refuse"] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const reviewEnabled = () => process.env.CMDPRO_REVIEW === "1";

export type ReviewInput = {
  path: string; selector: string; elementTag: string; elementText: string; elementHtml: string;
  context: string; viewport: string; action: string; comment: string;
};

const cut = (s: unknown, n: number) => (typeof s === "string" ? s : "").slice(0, n);

export async function createReview(actor: Actor, input: ReviewInput) {
  if (!reviewEnabled()) throw new ValidationError("Le mode commentaire n'est pas activé sur ce site.");
  const comment = cut(input.comment, 4000).trim();
  if (comment.length < 3) throw new ValidationError("Décrivez ce que vous voulez changer.", "comment");
  if (!REVIEW_ACTIONS.includes(input.action as ReviewAction)) throw new ValidationError("Type de demande inconnu.", "action");
  const path = cut(input.path, 300);
  if (!path.startsWith("/")) throw new ValidationError("Page inconnue.");
  return db.reviewComment.create({
    data: {
      path, selector: cut(input.selector, 1000), elementTag: cut(input.elementTag, 40), elementText: cut(input.elementText, 400),
      elementHtml: cut(input.elementHtml, 2000), context: cut(input.context, 400), viewport: cut(input.viewport, 40),
      action: input.action, comment, authorId: actor.userId, authorName: actor.displayName,
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
    },
  });
}

export async function reviewsForPath(path: string) {
  if (!reviewEnabled()) return [];
  return db.reviewComment.findMany({ where: { path }, orderBy: { createdAt: "desc" }, take: 50,
    select: { id: true, createdAt: true, selector: true, elementText: true, elementTag: true, action: true, comment: true, status: true, reply: true, authorId: true, authorName: true } });
}

export async function deleteOwnReview(actor: Actor, id: string) {
  const r = await db.reviewComment.findUnique({ where: { id } });
  if (!r || r.authorId !== actor.userId) throw new ValidationError("Commentaire introuvable.");
  if (r.status !== "nouveau") throw new ValidationError("Ce commentaire est déjà pris en charge : il ne peut plus être retiré.");
  await db.reviewComment.delete({ where: { id } });
}

/** Jeton d'accès de Claude : comparaison à temps constant ; aucun accès si le jeton n'est pas configuré. */
export function checkReviewToken(given: string | null): boolean {
  const expected = process.env.CMDPRO_REVIEW_TOKEN ?? "";
  if (!reviewEnabled() || expected.length < 24 || !given) return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function allReviews(status?: string) {
  return db.reviewComment.findMany({ where: status ? { status } : undefined, orderBy: { createdAt: "asc" }, take: 500 });
}

export async function setReviewStatus(id: string, status: string, reply?: string) {
  if (!REVIEW_STATUSES.includes(status as ReviewStatus)) throw new ValidationError("Statut inconnu.");
  return db.reviewComment.update({ where: { id }, data: { status, ...(reply !== undefined ? { reply: cut(reply, 2000) } : {}) } });
}
