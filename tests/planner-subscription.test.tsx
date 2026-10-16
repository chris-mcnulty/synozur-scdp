import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const state = vi.hoisted(() => ({
  conn: {} as any, rows: [] as any[], calls: [] as any[], lockModes: [] as string[],
  serial: Promise.resolve() as Promise<any>,
}));
vi.mock('../server/db.js', async () => {
  const schema = await import('../shared/schema');
  const store: any = {
    select: (projection: any) => {
      let table: any;
      const result = () => projection ? [{ tenantId: 'tenant' }]
        : table === schema.projectPlannerConnections ? [state.conn] : [...state.rows];
      const builder: any = {
        from(t: any) { table = t; return builder; },
        where() { return builder; }, innerJoin() { return builder; }, limit() { return builder; },
        for(mode: string) { state.lockModes.push(mode); return Promise.resolve(result()); },
        then(resolve: any, reject: any) { return Promise.resolve(result()).then(resolve, reject); },
      };
      return builder;
    },
    insert: () => ({ values: (values: any) => ({ returning: async () => {
      const row = { id: `row-${state.rows.length}`, createdAt: new Date(), updatedAt: new Date(), ...values };
      state.rows.push(row);
      return [row];
    } }) }),
    update: () => ({ set: (values: any) => ({ where: () => ({ returning: async () => {
      const row = state.rows[0];
      Object.assign(row, values);
      return [row];
    } }) }) }),
  };
  store.transaction = (fn: any) => {
    const next = state.serial.then(() => fn(store));
    state.serial = next.catch(() => {});
    return next;
  };
  return { db: store };
});
vi.mock('../server/services/planner-graph-client.js', () => ({
  getPlannerAccessToken: async () => 'mock-token',
}));
vi.mock('../server/services/planner-sync-audit.js', () => ({
  recordPlannerAudit: vi.fn(async () => {}),
}));
import { ensureSubscription, renewSubscription, renewExpiringSubscriptions } from '../server/services/planner-subscription-manager';
import { plannerSubscriptionExpiration, confirmedSubscriptionExpiry } from '../shared/planner-subscription-health';
import { PlannerWebhookHealth } from '../client/src/components/planner/PlannerWebhookHealth';

const now = new Date('2026-10-13T12:00:00Z');
const accepted = new Date(now.getTime() + 4000 * 60_000).toISOString();
let graph: ReturnType<typeof vi.fn>;
function remote(status = 'active') {
  return {
    id: 'row-0', connectionId: 'conn', tenantId: 'tenant', subscriptionId: 'graph-existing',
    resource: '/planner/plans/plan', status, clientState: 'state',
    expirationDateTime: new Date(now.getTime() + 60_000),
    lastRenewedAt: now, lastRenewalError: null, consecutiveRenewalErrors: 0,
    createdAt: now, updatedAt: now,
  };
}
function ok(id = 'graph-new') {
  return new Response(JSON.stringify({ id, expirationDateTime: accepted }), { status: 201 });
}
function error(status = 400) {
  return new Response(JSON.stringify({ error: { code: 'ExtensionError',
    message: 'Subscription expiration can only be 4230 minutes in the future.' } }), { status });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  state.conn = { id: 'conn', planId: 'plan', syncEnabled: true, syncSuspended: false };
  state.rows = []; state.calls = []; state.lockModes = []; state.serial = Promise.resolve();
  graph = vi.fn(async (_url: string, options: any) => {
    const body = JSON.parse(options.body);
    state.calls.push({ method: options.method, body });
    const minutes = (new Date(body.expirationDateTime).getTime() - Date.now()) / 60_000;
    if (minutes > 4230) return error();
    return ok();
  });
  vi.stubGlobal('fetch', graph);
});

describe('Planner Graph subscription recovery', () => {
  it('uses the Planner-specific cap with margin and rejects unknown resources', () => {
    expect(plannerSubscriptionExpiration('/planner/plans/p').getTime() - Date.now()).toBe(4220 * 60_000);
    expect(plannerSubscriptionExpiration('/groups/g/planner/plans/p').getTime() - Date.now()).toBe(4220 * 60_000);
    expect(() => plannerSubscriptionExpiration('/users/u/messages')).toThrow('No subscription lifetime');
  });
  it('creates within Graph limits and stores accepted rather than requested expiry', async () => {
    const sub = await ensureSubscription('conn');
    expect(state.calls[0].body.expirationDateTime).toBe(new Date(now.getTime() + 4220 * 60_000).toISOString());
    expect(sub?.expirationDateTime.toISOString()).toBe(accepted);
    expect(sub?.status).toBe('active');
    expect(state.lockModes).toContain('no key update');
  });
  it('reuses one error row across repeated rejections and then recovers', async () => {
    graph.mockImplementation(async () => error());
    const first = await ensureSubscription('conn');
    const id = first?.id;
    expect(confirmedSubscriptionExpiry(first!)).toBeNull();
    await ensureSubscription('conn');
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0].consecutiveRenewalErrors).toBe(2);
    graph.mockImplementation(async () => ok());
    const recovered = await ensureSubscription('conn');
    expect(recovered?.id).toBe(id);
    expect(recovered?.status).toBe('active');
    expect(recovered?.lastRenewalError).toBeNull();
    expect(recovered?.consecutiveRenewalErrors).toBe(0);
    await ensureSubscription('conn');
    expect(graph).toHaveBeenCalledTimes(3);
  });
  it('serializes concurrent ensures so only one Graph subscription is created', async () => {
    await Promise.all([ensureSubscription('conn'), ensureSubscription('conn')]);
    expect(graph).toHaveBeenCalledTimes(1);
    expect(state.rows).toHaveLength(1);
  });
  it.each(['active', 'error'])('PATCHes a real %s subscription within the same limit', async status => {
    state.rows = [remote(status)];
    const sub = await renewSubscription(state.rows[0]);
    expect(state.calls[0].method).toBe('PATCH');
    expect(state.calls[0].body.expirationDateTime).toBe(new Date(now.getTime() + 4220 * 60_000).toISOString());
    expect(sub?.expirationDateTime.toISOString()).toBe(accepted);
    expect(state.rows).toHaveLength(1);
  });
  it.each([404, 410])('recreates a vanished subscription after Graph %s in place', async status => {
    state.rows = [remote()];
    graph.mockImplementationOnce(async () => error(status));
    const sub = await ensureSubscription('conn');
    expect(state.calls[0].method).toBe('POST');
    expect(graph).toHaveBeenCalledTimes(2);
    expect(sub?.subscriptionId).toBe('graph-new');
    expect(state.rows).toHaveLength(1);
  });
  it('keeps a transient renewal failure for PATCH retry, without duplicate POST', async () => {
    state.rows = [remote()];
    graph.mockImplementationOnce(async () => error(503));
    const failed = await ensureSubscription('conn');
    expect(failed?.status).toBe('error');
    expect(failed?.expirationDateTime.getTime()).toBe(now.getTime() + 60_000);
    await ensureSubscription('conn');
    expect(graph).toHaveBeenCalledTimes(2);
    expect(state.calls.map(c => c.method)).toEqual(['PATCH']);
  });
  it('recreates an expired subscription without attempting PATCH', async () => {
    state.rows = [{ ...remote(), expirationDateTime: new Date(now.getTime() - 1) }];
    await ensureSubscription('conn');
    expect(state.calls[0].method).toBe('POST');
    expect(state.rows).toHaveLength(1);
  });
  it.each(['disabled', 'suspended'])('makes no Graph calls for %s connections', async mode => {
    state.conn.syncEnabled = mode !== 'disabled';
    state.conn.syncSuspended = mode === 'suspended';
    state.rows = [remote('error')];
    expect(await ensureSubscription('conn')).toBeNull();
    expect(await renewSubscription(state.rows[0])).toBeNull();
    await renewExpiringSubscriptions();
    expect(graph).not.toHaveBeenCalled();
    expect(state.rows[0].status).toBe('error');
  });
  it('attempts a failed connection only once per scheduler cycle', async () => {
    graph.mockImplementation(async () => error());
    expect((await renewExpiringSubscriptions()).failed).toBe(1);
    expect(graph).toHaveBeenCalledTimes(1);
    await renewExpiringSubscriptions();
    expect(graph).toHaveBeenCalledTimes(2);
    expect(state.rows).toHaveLength(1);
  });
  it('rejects malformed Graph success rather than fabricating valid health', async () => {
    graph.mockImplementation(async () => new Response(JSON.stringify({ id: 'x' }), { status: 201 }));
    const sub = await ensureSubscription('conn');
    expect(sub?.status).toBe('error');
    expect(confirmedSubscriptionExpiry(sub!)).toBeNull();
  });
});

describe('rendered webhook health', () => {
  const render = (subscription: any, enabled = true, suspended = false) =>
    renderToStaticMarkup(<PlannerWebhookHealth subscription={subscription} enabled={enabled} suspended={suspended} />);
  it('shows rejected creation as an error with no requested expiry', () => {
    const sub = { ...remote('error'), subscriptionId: 'local-error-legacy',
      lastRenewedAt: null, expirationDateTime: accepted, lastRenewalError: 'Graph rejected expiration' };
    expect(confirmedSubscriptionExpiry(sub)).toBeNull();
    expect(render(sub)).toContain('Graph rejected expiration');
    expect(render(sub)).not.toContain('expires');
  });
  it('shows only accepted active future expiry, not renewal-error or expired coverage', () => {
    expect(render(remote())).toContain('expires');
    expect(render(remote('error'))).not.toContain('expires');
    expect(render({ ...remote(), expirationDateTime: new Date(now.getTime() - 1) })).toContain('expired');
    expect(render({ ...remote(), lastRenewedAt: null })).not.toContain('expires');
  });
  it('shows missing, disabled and suspended subscriptions honestly', () => {
    expect(render(undefined)).toContain('awaiting subscription');
    expect(render(remote(), false)).toContain('disabled');
    expect(render(remote(), true, true)).toContain('paused');
    expect(render(remote(), true, true)).not.toContain('expires');
  });
});
