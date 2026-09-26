// Channel-agnostic notification layer.
// Priority: WhatsApp Business API, then e-mail as fallback. In V1 WhatsApp is
// simulated (recorded, not sent) and e-mail is the real delivery channel.

import type { NotificationChannel, NotificationStatus } from "@prisma/client";
import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "../db";

export interface OutgoingMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SendResult {
  status: Extract<NotificationStatus, "SENT" | "SIMULATED" | "FAILED">;
  providerMessageId?: string;
  error?: string;
}

export interface MessageChannel {
  channel: NotificationChannel;
  /** Recipient address for this party on this channel, or null if unreachable. */
  recipientOf(party: { whatsappPhone: string | null; email: string | null }): string | null;
  send(msg: OutgoingMessage): Promise<SendResult>;
}

/** V1: records the message as SIMULATED. Swap for a Meta Cloud API client later. */
export class SimulatedWhatsAppChannel implements MessageChannel {
  channel = "WHATSAPP" as const;
  recipientOf(p: { whatsappPhone: string | null }) {
    return p.whatsappPhone;
  }
  async send(msg: OutgoingMessage): Promise<SendResult> {
    console.info(`[whatsapp:simulated] → ${msg.to}\n${msg.text}`);
    return { status: "SIMULATED", providerMessageId: `sim_${Date.now()}` };
  }
}

export class EmailChannel implements MessageChannel {
  channel = "EMAIL" as const;
  recipientOf(p: { email: string | null }) {
    return p.email;
  }
  async send(msg: OutgoingMessage): Promise<SendResult> {
    return sendEmail(msg);
  }
}

let transport: Transporter | null = null;

/** SMTP when SMTP_URL is set; otherwise logs to the console (development). */
export async function sendEmail(msg: OutgoingMessage): Promise<SendResult> {
  const url = process.env.SMTP_URL;
  if (!url) {
    console.info(`[email:console] → ${msg.to} | ${msg.subject}\n${msg.text}`);
    return { status: "SIMULATED", providerMessageId: `console_${Date.now()}` };
  }
  try {
    transport ??= nodemailer.createTransport(url);
    const info = await transport.sendMail({
      from: process.env.EMAIL_FROM ?? "FineTrack UAE <no-reply@finetrack.ae>",
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
    return { status: "SENT", providerMessageId: info.messageId };
  } catch (e) {
    return { status: "FAILED", error: String(e) };
  }
}

export function defaultChannels(): MessageChannel[] {
  return [new SimulatedWhatsAppChannel(), new EmailChannel()];
}

/**
 * Try channels in priority order. A SIMULATED WhatsApp attempt does not count as
 * delivered, so e-mail is always attempted in V1. Every attempt is recorded.
 */
export async function notifyParty(opts: {
  companyId: string;
  party: { id: string; whatsappPhone: string | null; email: string | null };
  statementId?: string;
  message: Omit<OutgoingMessage, "to">;
  channels?: MessageChannel[];
}) {
  const attempts: { channel: NotificationChannel; status: NotificationStatus; recipient: string }[] = [];
  let previousId: string | null = null;
  for (const ch of opts.channels ?? defaultChannels()) {
    const to = ch.recipientOf(opts.party);
    if (!to) continue;
    const res = await ch.send({ ...opts.message, to });
    const row: { id: string } = await prisma.notification.create({
      data: {
        companyId: opts.companyId,
        partyId: opts.party.id,
        statementId: opts.statementId,
        channel: ch.channel,
        status: res.status,
        recipient: to,
        body: opts.message.text,
        providerMessageId: res.providerMessageId,
        error: res.error,
        fallbackOfId: previousId,
        sentAt: res.status === "FAILED" ? null : new Date(),
      },
    });
    attempts.push({ channel: ch.channel, status: res.status, recipient: to });
    if (res.status === "SENT") break;
    previousId = row.id;
  }
  const delivered = attempts.some((a) => a.status === "SENT" || (a.channel === "EMAIL" && a.status === "SIMULATED"));
  return { attempts, delivered };
}
