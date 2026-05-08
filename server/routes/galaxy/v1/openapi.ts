/**
 * Galaxy API OpenAPI 3.1 spec + Swagger UI shell.
 * The spec is hand-curated from the resource handlers in index.ts.
 * Update both files together when adding endpoints.
 */
import { GALAXY_SCOPES, GALAXY_WEBHOOK_EVENTS } from "@shared/schema";

const scopesObj: Record<string, string> = {};
for (const s of GALAXY_SCOPES) scopesObj[s] = `Permission: ${s}`;

const securityRead = (scope: string) => [{ galaxyOAuth: [scope] }];

function listResp(itemSchema: any) {
  return {
    "200": {
      description: "Paginated list",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              items: { type: "array", items: itemSchema },
              nextCursor: { type: ["string", "null"] },
            },
          },
        },
      },
    },
  };
}

const refs: Record<string, any> = {
  Project: {
    type: "object",
    properties: {
      id: { type: "string" }, code: { type: ["string", "null"] }, name: { type: "string" },
      clientId: { type: "string" }, status: { type: "string" },
      startDate: { type: ["string", "null"], format: "date" },
      endDate: { type: ["string", "null"], format: "date" },
      pmName: { type: ["string", "null"] }, healthStatus: { type: ["string", "null"] },
    },
  },
  Estimate: {
    type: "object",
    properties: {
      id: { type: "string" }, name: { type: "string" }, clientId: { type: "string" },
      projectId: { type: ["string", "null"] }, status: { type: "string" },
      estimateType: { type: "string" }, presentedTotal: { type: ["string", "null"] },
      validUntil: { type: ["string", "null"], format: "date" },
      estimateDate: { type: ["string", "null"], format: "date" },
      proposalNarrative: { type: ["string", "null"] },
      createdAt: { type: "string", format: "date-time" },
    },
  },
  Milestone: {
    type: "object",
    properties: {
      id: { type: "string" }, projectId: { type: "string" }, name: { type: "string" },
      description: { type: ["string", "null"] },
      type: { type: "string", enum: ["delivery", "payment"] },
      targetDate: { type: ["string", "null"], format: "date" },
      completedDate: { type: ["string", "null"], format: "date" },
      clientFacingStatus: { type: "string" },
      amount: { type: ["string", "null"] },
    },
  },
  StatusReport: {
    type: "object",
    properties: {
      id: { type: "string" }, projectId: { type: "string" },
      title: { type: ["string", "null"] },
      reportType: { type: "string", enum: ["text", "pptx", "executive_narrative"] },
      reportStyle: { type: ["string", "null"] },
      periodStart: { type: ["string", "null"], format: "date" },
      periodEnd: { type: ["string", "null"], format: "date" },
      status: { type: "string", enum: ["draft", "final"] },
      reportContent: { type: ["string", "null"] },
      metadata: { type: ["object", "null"] },
      createdAt: { type: ["string", "null"], format: "date-time" },
    },
  },
  RaiddEntry: {
    type: "object",
    properties: {
      id: { type: "string" }, projectId: { type: "string" },
      type: { type: "string" }, refNumber: { type: ["string", "null"] },
      title: { type: "string" }, description: { type: ["string", "null"] },
      status: { type: "string" }, priority: { type: "string" },
      dueDate: { type: ["string", "null"], format: "date" },
      createdAt: { type: "string", format: "date-time" },
    },
  },
  Invoice: {
    type: "object",
    properties: {
      id: { type: "string" }, batchId: { type: "string" },
      glInvoiceNumber: { type: ["string", "null"] },
      startDate: { type: "string", format: "date" }, endDate: { type: "string", format: "date" },
      totalAmount: { type: ["string", "null"] }, taxAmount: { type: ["string", "null"] },
      paymentStatus: { type: "string" },
      paymentDate: { type: ["string", "null"], format: "date" },
      paymentTerms: { type: ["string", "null"] },
      finalizedAt: { type: ["string", "null"], format: "date-time" },
      pdfDownloadUrl: { type: ["string", "null"] },
    },
  },
  Document: {
    type: "object",
    properties: {
      id: { type: "string" }, fileName: { type: "string" },
      mimeType: { type: ["string", "null"] }, size: { type: ["integer", "null"] },
      category: { type: ["string", "null"] },
      sharedAt: { type: "string", format: "date-time" },
      downloadUrl: { type: "string" },
    },
  },
  Signoff: {
    type: "object",
    properties: {
      id: { type: "string" }, action: { type: "string" }, comment: { type: ["string", "null"] },
      signedAt: { type: "string", format: "date-time" },
    },
  },
  CommentBody: {
    type: "object",
    properties: { comment: { type: "string", maxLength: 2000 } },
  },
};

function path(scope: string, summary: string, ok: any, params: any[] = [], method: "get" | "post" = "get", body?: any) {
  const op: any = {
    summary,
    security: securityRead(scope),
    parameters: params,
    responses: ok,
  };
  if (body) op.requestBody = body;
  return { [method]: op };
}

export function buildOpenApiSpec() {
  return {
    openapi: "3.1.0",
    info: {
      title: "Galaxy Client Portal API",
      version: "1.0.0",
      description:
        "Externally consumable HTTP API for the Galaxy client portal. " +
        "Tokens are issued via OAuth2 (authorization-code or client-credentials) on top of Microsoft Entra. " +
        "Each token carries tenantId + clientUserId claims; every request is scoped to artifacts the user is entitled to view.",
    },
    servers: [{ url: "/api/galaxy/v1" }],
    components: {
      securitySchemes: {
        galaxyOAuth: {
          type: "oauth2",
          flows: {
            authorizationCode: {
              authorizationUrl: "/api/galaxy/v1/oauth/authorize",
              tokenUrl: "/api/galaxy/v1/oauth/token",
              refreshUrl: "/api/galaxy/v1/oauth/token",
              scopes: scopesObj,
            },
            clientCredentials: {
              tokenUrl: "/api/galaxy/v1/oauth/token",
              scopes: scopesObj,
              "x-replit-galaxy-extra-params": {
                target_client_id: "Required. Resource clientId the token will act on. The app must already have an active authorization-code grant for a portal user belonging to this client.",
              },
            },
          },
        },
      },
      schemas: refs,
    },
    paths: {
      "/projects": path("projects:read", "List projects visible to the user",
        listResp({ $ref: "#/components/schemas/Project" })),
      "/projects/{id}": path("projects:read", "Get project header",
        { "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Project" } } } } },
        [{ name: "id", in: "path", required: true, schema: { type: "string" } }]),
      "/projects/{id}/status-reports": path("status_reports:read", "List status reports for a project",
        listResp({ $ref: "#/components/schemas/StatusReport" }),
        [{ name: "id", in: "path", required: true, schema: { type: "string" } }]),
      "/status-reports/{id}": path("status_reports:read", "Get a status report",
        { "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/StatusReport" } } } } },
        [{ name: "id", in: "path", required: true, schema: { type: "string" } }]),
      "/projects/{id}/milestones": path("milestones:read", "List project milestones",
        listResp({ $ref: "#/components/schemas/Milestone" }),
        [{ name: "id", in: "path", required: true, schema: { type: "string" } }]),
      "/projects/{id}/raidd": path("raidd:read", "List client-visible RAIDD entries",
        listResp({ $ref: "#/components/schemas/RaiddEntry" }),
        [{ name: "id", in: "path", required: true, schema: { type: "string" } }]),
      "/projects/{id}/documents": path("documents:read", "List documents shared with the client",
        listResp({ $ref: "#/components/schemas/Document" }),
        [{ name: "id", in: "path", required: true, schema: { type: "string" } }]),
      "/documents/{id}/download": path("documents:read", "Stream a shared document file",
        { "200": {
            description: "File stream. Content-Type reflects the stored file's MIME type and Content-Disposition is set to attachment.",
            content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } },
        } },
        [{ name: "id", in: "path", required: true, schema: { type: "string" } }]),
      "/estimates/{id}": path("estimates:read", "Get an estimate (sent or approved)",
        { "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Estimate" } } } } },
        [{ name: "id", in: "path", required: true, schema: { type: "string" } }]),
      "/invoices": path("invoices:read", "List finalised invoices for the user's client",
        listResp({ $ref: "#/components/schemas/Invoice" })),
      "/invoices/{id}": path("invoices:read", "Get an invoice",
        { "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Invoice" } } } } },
        [{ name: "id", in: "path", required: true, schema: { type: "string" } }]),

      "/estimates/{id}/approve": path("estimates:approve", "Approve an estimate",
        { "200": { description: "Signoff recorded", content: { "application/json": { schema: { $ref: "#/components/schemas/Signoff" } } } } },
        [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        "post",
        { content: { "application/json": { schema: { $ref: "#/components/schemas/CommentBody" } } } }),
      "/estimates/{id}/request-changes": path("estimates:approve", "Request changes on an estimate",
        { "200": { description: "Signoff recorded" } },
        [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        "post",
        { content: { "application/json": { schema: { $ref: "#/components/schemas/CommentBody" } } } }),
      "/milestones/{id}/accept": path("milestones:accept", "Accept a milestone",
        { "200": { description: "Signoff recorded" } },
        [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        "post",
        { content: { "application/json": { schema: { $ref: "#/components/schemas/CommentBody" } } } }),
      "/milestones/{id}/reject": path("milestones:accept", "Reject a milestone",
        { "200": { description: "Signoff recorded" } },
        [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        "post",
        { content: { "application/json": { schema: { $ref: "#/components/schemas/CommentBody" } } } }),
      "/status-reports/{id}/acknowledge": path("status_reports:acknowledge", "Acknowledge a status report",
        { "200": { description: "Signoff recorded" } },
        [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        "post",
        { content: { "application/json": { schema: { $ref: "#/components/schemas/CommentBody" } } } }),
      "/raidd/{id}/comments": path("raidd:comment", "Append a client comment to a RAIDD entry",
        { "200": { description: "Comment recorded" } },
        [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        "post",
        { content: { "application/json": { schema: { type: "object", required: ["comment"], properties: { comment: { type: "string", minLength: 1, maxLength: 4000 } } } } } }),
    },
    "x-galaxy-webhook-events": GALAXY_WEBHOOK_EVENTS,
  };
}

export function swaggerHtml(specUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Galaxy API — Reference</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
  <div id="swagger"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: ${JSON.stringify(specUrl)},
      dom_id: "#swagger",
      deepLinking: true,
    });
  </script>
</body>
</html>`;
}
