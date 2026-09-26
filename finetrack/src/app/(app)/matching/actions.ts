"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/auth";
import { resolveOffenses, runMatching } from "@/lib/matching/service";

export async function rerunMatching(f: FormData) {
  const { companyId } = await requireCompany();
  const r = await runMatching(companyId);
  revalidatePath("/", "layout");
  redirect(`${String(f.get("back") ?? "/matching")}${String(f.get("back") ?? "").includes("?") ? "&" : "?"}rerun=${r.ASSIGNED}-${r.TO_REVIEW}-${r.UNASSIGNED}`);
}

export async function bulkResolve(f: FormData) {
  const { companyId, user } = await requireCompany();
  const back = String(f.get("back") ?? "/matching");
  let n = 0;
  {
    const ids = f.getAll("ids").map(String);
    const op = String(f.get("op"));
    if (ids.length) {
      if (op === "party") {
        const partyId = String(f.get("partyId") ?? "");
        if (partyId) n = await resolveOffenses(companyId, user.id, ids, { kind: "party", partyId });
      } else if (op === "confirm" || op === "unassign" || op === "unlock") {
        n = await resolveOffenses(companyId, user.id, ids, { kind: op });
        if (op === "unlock") await runMatching(companyId, { offenseIds: ids });
      }
    }
  }
  revalidatePath("/", "layout");
  redirect(`${back}${back.includes("?") ? "&" : "?"}updated=${n}`);
}

/** "Use" button next to a candidate: bound to (offenseId, assignmentId). */
export async function pickCandidate(offenseId: string, assignmentId: string, f: FormData) {
  const { companyId, user } = await requireCompany();
  const back = String(f.get("back") ?? "/matching");
  const n = await resolveOffenses(companyId, user.id, [offenseId], { kind: "assignment", assignmentId });
  revalidatePath("/", "layout");
  redirect(`${back}${back.includes("?") ? "&" : "?"}updated=${n}`);
}
