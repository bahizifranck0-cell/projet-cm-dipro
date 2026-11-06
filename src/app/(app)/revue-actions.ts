"use server";
import { actionActor } from "@/server/auth/current";
import { runAction, type ActionState } from "@/server/actions/result";
import { createReview, deleteOwnReview, reviewsForPath, type ReviewInput } from "@/server/services/reviews";

export async function sendReviewAction(input: ReviewInput): Promise<ActionState> {
  return runAction(async () => { await createReview(await actionActor(), input); return "Commentaire envoyé. Claude pourra le lire et l'appliquer."; });
}

export async function deleteReviewAction(id: string): Promise<ActionState> {
  return runAction(async () => { await deleteOwnReview(await actionActor(), id); return "Commentaire retiré."; });
}

export async function listReviewsAction(path: string) {
  const actor = await actionActor();
  const rows = await reviewsForPath(path);
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), mine: r.authorId === actor.userId, authorId: undefined }));
}
