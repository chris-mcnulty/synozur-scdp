import webpush from "web-push";
import { storage } from "../storage.js";
import { db } from "../db.js";
import { vapidKeys } from "@shared/schema.js";
import { eq } from "drizzle-orm";

const DEFAULT_SUBJECT = "mailto:notifications@constellation.synozur.com";
const SINGLETON_ID = "singleton";

let configured = false;
let cachedPublicKey: string | null = null;
let initPromise: Promise<boolean> | null = null;

async function loadOrCreateVapidKeys(): Promise<{
  publicKey: string;
  privateKey: string;
  subject: string;
} | null> {
  // Prefer environment variables — used in production where keys are managed
  // as deployment secrets.
  const envPublic = process.env.VAPID_PUBLIC_KEY;
  const envPrivate = process.env.VAPID_PRIVATE_KEY;
  if (envPublic && envPrivate) {
    return {
      publicKey: envPublic,
      privateKey: envPrivate,
      subject: process.env.VAPID_SUBJECT || DEFAULT_SUBJECT,
    };
  }

  // Otherwise fall back to a server-only `vapid_keys` table. This is
  // deliberately NOT system_settings — system_settings is exposed via
  // /api/settings to authenticated admins, which would leak the private key.
  // The vapid_keys table is only accessed from this module.
  try {
    const [existing] = await db
      .select()
      .from(vapidKeys)
      .where(eq(vapidKeys.id, SINGLETON_ID))
      .limit(1);
    if (existing) {
      return {
        publicKey: existing.publicKey,
        privateKey: existing.privateKey,
        subject: existing.subject || DEFAULT_SUBJECT,
      };
    }

    const fresh = webpush.generateVAPIDKeys();
    const [inserted] = await db
      .insert(vapidKeys)
      .values({
        id: SINGLETON_ID,
        publicKey: fresh.publicKey,
        privateKey: fresh.privateKey,
        subject: DEFAULT_SUBJECT,
      })
      .onConflictDoNothing()
      .returning();
    if (inserted) {
      return {
        publicKey: inserted.publicKey,
        privateKey: inserted.privateKey,
        subject: inserted.subject,
      };
    }
    // Race: another worker inserted first; re-read.
    const [row] = await db
      .select()
      .from(vapidKeys)
      .where(eq(vapidKeys.id, SINGLETON_ID))
      .limit(1);
    if (row) {
      return { publicKey: row.publicKey, privateKey: row.privateKey, subject: row.subject };
    }
    return null;
  } catch (err) {
    console.error("[PUSH] Failed to load/generate VAPID keys:", err);
    return null;
  }
}

async function configurePush(): Promise<boolean> {
  if (configured) return true;
  if (!initPromise) {
    initPromise = (async () => {
      const keys = await loadOrCreateVapidKeys();
      if (!keys) return false;
      webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
      cachedPublicKey = keys.publicKey;
      configured = true;
      return true;
    })();
  }
  return initPromise;
}

export async function ensurePushConfigured(): Promise<boolean> {
  return configurePush();
}

export async function getVapidPublicKey(): Promise<string | null> {
  if (cachedPublicKey) return cachedPublicKey;
  await configurePush();
  return cachedPublicKey;
}

export interface PushPayload {
  title: string;
  body?: string;
  link?: string;
  type?: string;
  entityRef?: string;
}

export async function sendPushToUser(
  userId: string,
  tenantId: string,
  payload: PushPayload
): Promise<void> {
  const ok = await configurePush();
  if (!ok) return;
  const subs = await storage.getPushSubscriptionsForUser(userId, tenantId);
  if (subs.length === 0) return;

  const json = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          json
        );
      } catch (err: any) {
        const status = err?.statusCode;
        if (status === 404 || status === 410) {
          try {
            await storage.deletePushSubscriptionById(sub.id);
          } catch (delErr) {
            console.error("[PUSH] Failed to delete stale subscription:", delErr);
          }
        } else {
          console.error("[PUSH] Failed to send push notification:", err?.message || err);
        }
      }
    })
  );
}
