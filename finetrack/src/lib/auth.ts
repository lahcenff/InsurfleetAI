// Passwordless e-mail authentication (magic link), stored in the Session /
// VerificationToken tables. Tokens are stored hashed.
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { prisma, tenantDb } from "./db";
import { sendEmail } from "./notify";

const SESSION_COOKIE = "ft_session";
const COMPANY_COOKIE = "ft_company";
const SESSION_DAYS = 30;
const LINK_MINUTES = 20;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

export async function requestMagicLink(emailRaw: string): Promise<{ devLink?: string }> {
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("invalid email");
  const token = randomBytes(32).toString("base64url");
  await prisma.verificationToken.deleteMany({ where: { identifier: email } });
  await prisma.verificationToken.create({
    data: { identifier: email, token: sha256(token), expires: new Date(Date.now() + LINK_MINUTES * 60_000) },
  });
  const link = `${appUrl()}/auth/verify?token=${token}`;
  await sendEmail({
    to: email,
    subject: "Your FineTrack UAE sign-in link",
    text: `Sign in to FineTrack UAE:\n${link}\n\nThis link expires in ${LINK_MINUTES} minutes.`,
    html: `<p>Sign in to FineTrack UAE:</p><p><a href="${link}">Sign in</a></p><p>This link expires in ${LINK_MINUTES} minutes.</p>`,
  });
  // Without SMTP (local dev), show the link on screen.
  return process.env.SMTP_URL ? {} : { devLink: link };
}

/** Consume a magic-link token; creates the user on first sign-in. Returns false if invalid. */
export async function consumeMagicLink(token: string): Promise<boolean> {
  const row = await prisma.verificationToken.findUnique({ where: { token: sha256(token) } });
  if (!row) return false;
  await prisma.verificationToken.delete({ where: { token: row.token } });
  if (row.expires < new Date()) return false;
  const user = await prisma.user.upsert({
    where: { email: row.identifier },
    update: { emailVerified: new Date() },
    create: { email: row.identifier, emailVerified: new Date() },
  });
  const sessionToken = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await prisma.session.create({ data: { sessionToken: sha256(sessionToken), userId: user.id, expires } });
  (await cookies()).set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
  return true;
}

export async function signOut() {
  const jar = await cookies();
  const t = jar.get(SESSION_COOKIE)?.value;
  if (t) await prisma.session.deleteMany({ where: { sessionToken: sha256(t) } });
  jar.delete(SESSION_COOKIE);
  jar.delete(COMPANY_COOKIE);
}

export async function getUser() {
  const t = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!t) return null;
  const session = await prisma.session.findUnique({
    where: { sessionToken: sha256(t) },
    include: { user: { include: { memberships: { include: { company: true }, orderBy: { createdAt: "asc" } } } } },
  });
  if (!session || session.expires < new Date()) return null;
  return session.user;
}

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/** Current user + active company. Redirects to login / onboarding when missing. */
export async function requireCompany(minRole: Role = "MANAGER") {
  const user = await requireUser();
  if (!user.memberships.length) redirect("/onboarding");
  const wanted = (await cookies()).get(COMPANY_COOKIE)?.value;
  const membership = user.memberships.find((m) => m.companyId === wanted) ?? user.memberships[0];
  if (minRole === "ADMIN" && membership.role !== "ADMIN") redirect("/dashboard?denied=1");
  return {
    user,
    company: membership.company,
    companyId: membership.companyId,
    role: membership.role,
    db: tenantDb(membership.companyId),
  };
}

export async function setActiveCompany(companyId: string) {
  (await cookies()).set(COMPANY_COOKIE, companyId, { httpOnly: true, sameSite: "lax", path: "/" });
}
