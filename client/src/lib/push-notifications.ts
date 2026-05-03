import { apiRequest } from "./queryClient";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/sw.js");
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js");
}

export async function subscribeToPush(): Promise<{ ok: boolean; reason?: string }> {
  if (!isPushSupported()) {
    return { ok: false, reason: "Push notifications are not supported in this browser" };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, reason: "Notification permission was not granted" };
  }

  const cfg = (await apiRequest("/api/push/vapid-public-key")) as { publicKey?: string };
  const publicKey = cfg?.publicKey;
  if (!publicKey) {
    return { ok: false, reason: "Push notifications are not configured on the server" };
  }

  const reg = await registerServiceWorker();
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const json = sub.toJSON();
  await apiRequest("/api/push/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      userAgent: navigator.userAgent,
    }),
  });

  return { ok: true };
}

/**
 * Disable push for the current tenant only.
 *
 * We delete the tenant-scoped server row but intentionally do NOT call
 * `PushSubscription.unsubscribe()` — that would destroy the origin-wide
 * browser subscription and silently disable push for every other tenant the
 * user belongs to in this browser. The browser-level PushSubscription is
 * preserved and re-used if the same user (or another tenant they belong to)
 * subscribes again. To revoke the browser subscription entirely, use
 * `unsubscribeFromPushEverywhere()`.
 */
export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  try {
    await apiRequest("/api/push/subscriptions", {
      method: "DELETE",
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
  } catch (_) {}
}

/**
 * Fully revoke the browser-level PushSubscription in addition to the
 * tenant-scoped server record. Use only when the user wants to disable push
 * for the entire browser/origin (not implemented in the current preferences
 * UI, which is per-workspace).
 */
export async function unsubscribeFromPushEverywhere(): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  try {
    await apiRequest("/api/push/subscriptions", {
      method: "DELETE",
      body: JSON.stringify({ endpoint }),
    });
  } catch (_) {}
  try {
    await sub.unsubscribe();
  } catch (_) {}
}

export async function isCurrentlySubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}

/**
 * Returns true only when the browser has an active PushSubscription AND that
 * same endpoint is registered server-side for the current tenant. This is
 * needed for multi-tenant users: tenant A subscribing in this browser must
 * not make the toggle appear "on" for tenant B in the same browser.
 */
export async function isSubscribedForCurrentTenant(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return false;
  try {
    const res = (await apiRequest("/api/push/subscriptions")) as {
      endpoints?: string[];
    };
    const endpoints = res?.endpoints ?? [];
    return endpoints.includes(sub.endpoint);
  } catch {
    return false;
  }
}
