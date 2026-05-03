import type { Express, Request, Response } from "express";
import { db } from "../db.js";
import { digestSends } from "@shared/schema.js";
import { eq, sql } from "drizzle-orm";

interface SendGridEvent {
  email?: string;
  timestamp?: number;
  event?: string;
  sg_event_id?: string;
  sg_message_id?: string;
  digestSendId?: string;
  digestType?: string;
  tenantId?: string;
  [key: string]: any;
}

export function registerWebhookRoutes(app: Express) {
  app.post("/api/webhooks/sendgrid", async (req: Request, res: Response) => {
    try {
      const events: SendGridEvent[] = Array.isArray(req.body) ? req.body : [];

      if (!events.length) {
        return res.status(200).json({ received: 0 });
      }

      let processed = 0;
      let opens = 0;

      for (const event of events) {
        try {
          if (event.digestType && event.digestType !== "weekly") continue;

          const digestSendId = event.digestSendId;
          const sgMessageId = event.sg_message_id ? String(event.sg_message_id).split(".")[0] : null;

          if (event.event === "open") {
            const eventTs = event.timestamp ? new Date(event.timestamp * 1000) : new Date();
            const setClause = {
              openedAt: sql`COALESCE(${digestSends.openedAt}, ${eventTs})`,
              openCount: sql`${digestSends.openCount} + 1`,
            };

            let updated: { id: string }[] = [];
            if (digestSendId) {
              updated = await db
                .update(digestSends)
                .set(setClause)
                .where(eq(digestSends.id, digestSendId))
                .returning({ id: digestSends.id });
            } else if (sgMessageId) {
              updated = await db
                .update(digestSends)
                .set(setClause)
                .where(eq(digestSends.sgMessageId, sgMessageId))
                .returning({ id: digestSends.id });
            }

            if (updated.length > 0) {
              opens++;
            } else if (digestSendId || sgMessageId) {
              console.warn(`[SENDGRID-WEBHOOK] open event did not match any digest send (digestSendId=${digestSendId ?? 'n/a'}, sg_message_id=${sgMessageId ?? 'n/a'})`);
            }
          }

          processed++;
        } catch (innerErr: any) {
          console.error("[SENDGRID-WEBHOOK] Failed to process event:", innerErr?.message, event);
        }
      }

      console.log(`[SENDGRID-WEBHOOK] Received ${events.length} events; processed ${processed}; opens applied ${opens}`);
      return res.status(200).json({ received: events.length, processed, opens });
    } catch (err: any) {
      console.error("[SENDGRID-WEBHOOK] Handler error:", err?.message || err);
      return res.status(200).json({ error: "ignored" });
    }
  });
}
