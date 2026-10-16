import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const state = vi.hoisted(() => ({
  conn: {} as any, rows: [] as any[], calls: [] as any[], lockModes: [] as string[],
  serial: Promise.resolve() as Promise<any>,
  failActiveSave: false, failActiveCommit: false, failPrepareCommit: false,
  committedRows: [] as any[],
}));
vi.mock('../server/db.js', async () => {
  const schema = await import('../shared/schema');
  const matches = (row: any, condition: any) => {
    const column = condition?.queryChunks?.find((chunk: any) => chunk?.name && chunk?.table);
    const param = condition?.queryChunks?.find((chunk: any) => chunk?.constructor?.name === 'Param');
    if (!column || !param) throw new Error('Unsupported mock predicate');
    const key = Object.entries(schema.plannerSubscriptions)
      .find(([, value]: any) => value === column)?.[0] ??
      Object.entries(schema.projectPlannerConnections).find(([, value]: any) => value === column)?.[0];
    return row[key!] === param.value;
  };
  const store: any = {
    select: (projection: any) => {
      let table: any, condition: any;
      const result = () => projection ? [{ tenantId: 'tenant' }]
        : (table === schema.projectPlannerConnections ? [state.conn] : state.rows)
          .filter(row => !condition || matches(row, condition));
      const builder: any = {
        from(t: any) { table = t; return builder; },
        where(c: any) { condition = c; return builder; }, innerJoin() { return builder; }, limit() { return builder; },
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
    update: () => ({ set: (values: any) => ({ where: (condition: any) => ({ returning: async () => {
      if (values.status === 'active' && state.failActiveSave) {
        state.failActiveSave = false;
        throw new Error('Local subscription save failed');
      }
      const row = state.rows.find(row => matches(row, condition));
      Object.assign(row, values);
      return [row];
    } }) }) }),
  };
  store.transaction = (fn: any) => {
    const next = state.serial.then(async () => {
      const before = structuredClone(state.rows);
      try {
        const result = await fn(store);
        if (state.failPrepareCommit || (state.failActiveCommit && state.rows.some(row => row.status === 'active'))) {
          state.failPrepareCommit = false; state.failActiveCommit = false;
          throw new Error('Local transaction commit failed');
        }
        state.committedRows = structuredClone(state.rows);
        return result;
      } catch (err) {
        state.rows = before;
        throw err;
      }
    });
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
let listGraph: ReturnType<typeof vi.fn>;
let remoteSubscriptions: any[];
function remote(status = 'active') {
  return {
    id: 'row-0', connectionId: 'conn', tenantId: 'tenant', subscriptionId: 'graph-existing',
    resource: '/planner/plans/plan', status, clientState: 'state',
    notificationUrl: 'https://constellation.synozur.com/api/webhooks/planner',
    changeType: 'updated,deleted',
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
  state.failActiveSave = false; state.failActiveCommit = false; state.failPrepareCommit = false;
  state.committedRows = []; remoteSubscriptions = [];
  listGraph = vi.fn(async () => new Response(JSON.stringify({ value: remoteSubscriptions }), { status: 200 }));
  graph = vi.fn(async (_url: string, options: any) => {
    const body = JSON.parse(options.body);
    const minutes = (new Date(body.expirationDateTime).getTime() - Date.now()) / 60_000;
    if (minutes > 4230) return error();
    if (options.method === 'POST') remoteSubscriptions.push({ ...body, id: 'graph-new', expirationDateTime: accepted });
    return ok();
  });
  vi.stubGlobal('fetch', async (url: string, options: any) => {
    if (options.method === 'GET') return listGraph(url, options);
    state.calls.push({ method: options.method, body: JSON.parse(options.body) });
    return graph(url, options);
  });
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
    expect(state.calls.map(c => c.method)).toEqual(['PATCH', 'POST']);
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
    expect(state.calls.map(c => c.method)).toEqual(['PATCH', 'PATCH']);
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

  it('recovers an accepted-then-timeout POST using the committed attempt, even with concurrent retries', async () => {
    graph.mockImplementationOnce(async (_url: string, options: any) => {
      const body = JSON.parse(options.body);
      expect(state.committedRows[0].clientState).toBe(body.clientState);
      remoteSubscriptions.push({ ...body, resource: body.resource.slice(1),
        id: 'graph-accepted', expirationDateTime: accepted });
      throw new Error('Response timed out after acceptance');
    });
    const failed = await ensureSubscription('conn');
    expect(failed?.status).toBe('error');
    const attempt = structuredClone(failed);
    const recovered = await Promise.all([ensureSubscription('conn'), ensureSubscription('conn')]);
    expect(recovered.every(sub => sub?.subscriptionId === 'graph-accepted')).toBe(true);
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0]).toMatchObject({ id: attempt.id, clientState: attempt.clientState,
      status: 'active', lastRenewalError: null, consecutiveRenewalErrors: 0 });
    expect(state.rows[0].expirationDateTime.toISOString()).toBe(accepted);
    expect(graph).toHaveBeenCalledTimes(1);
    expect(remoteSubscriptions).toHaveLength(1); // One remote source of webhook delivery.
  });

  it.each(['save', 'commit'])('recovers the accepted remote ID after local %s failure rolls back', async failure => {
    state.failActiveSave = failure === 'save';
    state.failActiveCommit = failure === 'commit';
    await expect(ensureSubscription('conn')).rejects.toThrow(
      failure === 'save' ? 'Local subscription save failed' : 'Local transaction commit failed');
    expect(state.rows).toHaveLength(1);
    const checkpoint = structuredClone(state.rows[0]);
    expect(checkpoint.subscriptionId).toMatch(/^local-error-/);
    expect(checkpoint.status).toBe('error');
    expect(remoteSubscriptions[0].clientState).toBe(checkpoint.clientState);
    const recovered = await ensureSubscription('conn');
    expect(recovered).toMatchObject({ id: checkpoint.id, clientState: checkpoint.clientState,
      subscriptionId: 'graph-new', status: 'active', consecutiveRenewalErrors: 0 });
    expect(state.rows).toHaveLength(1);
    expect(graph).toHaveBeenCalledTimes(1);
    expect(remoteSubscriptions).toHaveLength(1);
  });

  it('never calls Graph if the durable attempt cannot commit', async () => {
    state.failPrepareCommit = true;
    await expect(ensureSubscription('conn')).rejects.toThrow('Local transaction commit failed');
    expect(graph).not.toHaveBeenCalled();
    expect(listGraph).not.toHaveBeenCalled();
    expect(state.rows).toHaveLength(0);
  });

  it('keeps the same attempt through repeated reconciliation outages before recovering', async () => {
    graph.mockImplementationOnce(async (_url: string, options: any) => {
      remoteSubscriptions.push({ ...JSON.parse(options.body), id: 'graph-accepted', expirationDateTime: accepted });
      throw new Error('Response lost');
    });
    await ensureSubscription('conn');
    const attempt = structuredClone(state.rows[0]);
    listGraph.mockImplementationOnce(async () => error(503));
    await ensureSubscription('conn');
    listGraph.mockImplementationOnce(async () => error(503));
    await ensureSubscription('conn');
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0]).toMatchObject({ clientState: attempt.clientState, consecutiveRenewalErrors: 3 });
    expect((await ensureSubscription('conn'))?.subscriptionId).toBe('graph-accepted');
    expect(graph).toHaveBeenCalledTimes(1);
    expect(remoteSubscriptions).toHaveLength(1);
  });

  it('commits a fresh identity before recreating a removed subscription in the same row', async () => {
    state.rows = [remote('removed')];
    remoteSubscriptions.push({ ...remote(), id: 'old-remote', expirationDateTime: accepted });
    const result = await ensureSubscription('conn');
    expect(result?.id).toBe('row-0');
    expect(result?.subscriptionId).toBe('graph-new');
    expect(result?.clientState).not.toBe('state');
    expect(state.rows).toHaveLength(1);
  });

  it('follows pagination to recover the exact attempt and ignores other connections and targets', async () => {
    graph.mockImplementationOnce(async () => { throw new Error('Timeout'); });
    await ensureSubscription('conn');
    const attempt = structuredClone(state.rows[0]);
    const matching = { ...attempt, id: 'graph-recovered', expirationDateTime: accepted };
    listGraph.mockImplementationOnce(async () => new Response(JSON.stringify({
      value: [
        { ...matching, id: 'other-connection', clientState: 'another-secret' },
        { ...matching, id: 'other-resource', resource: '/planner/plans/another' },
        { ...matching, id: 'other-url', notificationUrl: 'https://example.com/webhook' },
        { ...matching, id: 'expired', expirationDateTime: now.toISOString() },
      ],
      '@odata.nextLink': 'https://graph.microsoft.com/v1.0/subscriptions?$skiptoken=next',
    })));
    listGraph.mockImplementationOnce(async () => new Response(JSON.stringify({ value: [matching] })));
    expect((await ensureSubscription('conn'))?.subscriptionId).toBe('graph-recovered');
    expect(listGraph.mock.lastCall?.[0]).toContain('/subscriptions?$skiptoken=next');
    expect(graph).toHaveBeenCalledTimes(1);
    expect(state.rows).toHaveLength(1);
  });

  it('does not adopt a remote ID already owned by another connection, even with a matching secret', async () => {
    graph.mockImplementationOnce(async () => { throw new Error('Timeout'); });
    await ensureSubscription('conn');
    const attempt = structuredClone(state.rows[0]);
    state.rows.push({ ...remote(), id: 'other-row', connectionId: 'other-connection',
      subscriptionId: 'other-remote', clientState: attempt.clientState });
    remoteSubscriptions.push({ ...attempt, id: 'other-remote', expirationDateTime: accepted });
    const result = await ensureSubscription('conn');
    expect(result?.lastRenewalError).toContain('belongs to another connection');
    expect(result?.subscriptionId).toBe(attempt.subscriptionId);
    expect(state.rows[1].subscriptionId).toBe('other-remote');
    expect(graph).toHaveBeenCalledTimes(1);
  });

  it('creates its own subscription instead of adopting another connection on the same plan and URL', async () => {
    remoteSubscriptions.push({ ...remote(), id: 'another-remote', expirationDateTime: accepted });
    const result = await ensureSubscription('conn');
    expect(result?.subscriptionId).toBe('graph-new');
    expect(result?.clientState).not.toBe('state');
    expect(graph).toHaveBeenCalledTimes(1);
  });

  it.each(['unavailable', 'malformed', 'unsafe-next-link', 'pagination-loop', 'invalid-match'])(
    'fails closed without another POST when reconciliation is %s', async failure => {
      graph.mockImplementationOnce(async () => { throw new Error('Timeout'); });
      await ensureSubscription('conn');
      const attempt = structuredClone(state.rows[0]);
      listGraph.mockImplementation(async () => {
        if (failure === 'unavailable') return error(503);
        const page = failure === 'malformed' ? {} :
          failure === 'invalid-match' ? { value: [{ ...attempt, id: 'remote', expirationDateTime: 'invalid' }] } :
          { value: [], '@odata.nextLink': failure === 'unsafe-next-link'
            ? 'https://example.com/v1.0/subscriptions' : 'https://graph.microsoft.com/v1.0/subscriptions' };
        return new Response(JSON.stringify(page));
      });
      const result = await ensureSubscription('conn');
      expect(result?.status).toBe('error');
      expect(result?.clientState).toBe(attempt.clientState);
      expect(graph).toHaveBeenCalledTimes(1);
      expect(state.rows).toHaveLength(1);
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
