import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type NodeTypes,
  type Node,
  type Edge,
  MarkerType,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Layout } from "@/components/layout/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MicrosoftTeamsIcon, MicrosoftPlannerIcon } from "@/components/icons/microsoft-icons";

// ── Icon components for M365 services ─────────────────────────────────────

function EntraIdIcon({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L2 7l10 5 10-5-10-5z" fill="#0078D4" />
      <path d="M2 17l10 5 10-5" stroke="#0078D4" strokeWidth="1.5" fill="none" />
      <path d="M2 12l10 5 10-5" stroke="#0078D4" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function SharePointIcon({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="9" cy="9" r="7" fill="#038387" />
      <circle cx="15" cy="15" r="6" fill="#1890A7" opacity="0.85" />
      <circle cx="9" cy="15" r="5" fill="#038387" opacity="0.9" />
    </svg>
  );
}

function OutlookIcon({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="5" width="14" height="14" rx="2" fill="#0078D4" />
      <path d="M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" fill="white" />
      <path d="M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" fill="#0078D4" />
      <path d="M16 8h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-5V8z" fill="#1A86D8" />
      <path d="M16 11l5 3" stroke="white" strokeWidth="0.75" />
      <path d="M16 11l5-3" stroke="white" strokeWidth="0.75" />
    </svg>
  );
}

// ── Node color / brand config ──────────────────────────────────────────────

type ServiceKey = "constellation" | "entra" | "sharepoint" | "teams" | "planner" | "outlook";

interface ServiceConfig {
  bg: string;
  border: string;
  text: string;
  dot: string;
  edge?: string;
}

const SERVICE_CONFIG: Record<ServiceKey, ServiceConfig> = {
  constellation: {
    bg: "bg-primary",
    border: "border-primary",
    text: "text-primary-foreground",
    dot: "#6366f1",
  },
  entra: {
    bg: "bg-[#0078D4]",
    border: "border-[#0078D4]",
    text: "text-white",
    dot: "#0078D4",
    edge: "#0078D4",
  },
  sharepoint: {
    bg: "bg-[#038387]",
    border: "border-[#038387]",
    text: "text-white",
    dot: "#038387",
    edge: "#038387",
  },
  teams: {
    bg: "bg-[#5059C9]",
    border: "border-[#5059C9]",
    text: "text-white",
    dot: "#5059C9",
    edge: "#5059C9",
  },
  planner: {
    bg: "bg-[#7B2FBE]",
    border: "border-[#7B2FBE]",
    text: "text-white",
    dot: "#7B2FBE",
    edge: "#7B2FBE",
  },
  outlook: {
    bg: "bg-[#0078D4]",
    border: "border-[#0063B1]",
    text: "text-white",
    dot: "#0063B1",
    edge: "#0063B1",
  },
};

// ── Typed node data ────────────────────────────────────────────────────────

type ConstellationNodeData = Record<string, never>;

interface ServiceNodeData {
  service: ServiceKey;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  tooltipSide: "top" | "right" | "bottom" | "left";
  description: string;
  [key: string]: unknown;
}

type ConstellationNode = Node<ConstellationNodeData, "constellation">;
type ServiceNode = Node<ServiceNodeData, "service">;
type DiagramNode = ConstellationNode | ServiceNode;

// ── Custom node components ──────────────────────────────────────────────────

function ConstellationNodeComponent(_props: NodeProps<ConstellationNode>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex flex-col items-center justify-center w-36 h-36 rounded-full bg-primary border-4 border-primary shadow-2xl cursor-pointer select-none">
          <Handle type="source" position={Position.Top} style={{ opacity: 0 }} />
          <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
          <Handle type="source" position={Position.Left} style={{ opacity: 0 }} />
          <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
          <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
          <Handle type="target" position={Position.Bottom} style={{ opacity: 0 }} />
          <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
          <Handle type="target" position={Position.Right} style={{ opacity: 0 }} />
          <div className="text-center px-2">
            <div className="text-sm font-bold text-primary-foreground leading-tight">Constellation</div>
            <div className="text-[10px] text-primary-foreground/80 mt-1 leading-tight">Central Hub</div>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-64">
        <p className="font-semibold mb-1">Constellation</p>
        <p className="text-xs text-muted-foreground">Synozur Consulting Delivery Platform — the central hub connecting all Microsoft 365 services for project delivery, resource management, and financial tracking.</p>
      </TooltipContent>
    </Tooltip>
  );
}

function ServiceNodeComponent({ data }: NodeProps<ServiceNode>) {
  const cfg = SERVICE_CONFIG[data.service];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={`flex flex-col items-center justify-center w-32 h-32 rounded-2xl ${cfg.bg} border-2 ${cfg.border} shadow-lg cursor-pointer select-none`}>
          <Handle type="source" position={Position.Top} style={{ opacity: 0 }} />
          <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
          <Handle type="source" position={Position.Left} style={{ opacity: 0 }} />
          <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
          <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
          <Handle type="target" position={Position.Bottom} style={{ opacity: 0 }} />
          <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
          <Handle type="target" position={Position.Right} style={{ opacity: 0 }} />
          <div className="mb-1">{data.icon}</div>
          <div className={`text-xs font-bold ${cfg.text} text-center leading-tight px-2`}>{data.label}</div>
          <div className={`text-[9px] ${cfg.text} opacity-80 text-center mt-0.5 px-1 leading-tight`}>{data.sublabel}</div>
        </div>
      </TooltipTrigger>
      <TooltipContent side={data.tooltipSide} className="max-w-72">
        <p className="font-semibold mb-1">{data.label}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{data.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}

const nodeTypes: NodeTypes = {
  constellation: ConstellationNodeComponent,
  service: ServiceNodeComponent,
};

// ── Static nodes ───────────────────────────────────────────────────────────

const CX = 400;
const CY = 350;
const RADIUS = 240;

function polar(angleDeg: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: CX + RADIUS * Math.cos(rad) - 64,
    y: CY + RADIUS * Math.sin(rad) - 64,
  };
}

const initialNodes: DiagramNode[] = [
  {
    id: "constellation",
    type: "constellation",
    position: { x: CX - 72, y: CY - 72 },
    data: {},
    draggable: false,
  },
  {
    id: "entra",
    type: "service",
    position: polar(0),
    data: {
      service: "entra",
      label: "Entra ID",
      sublabel: "Identity",
      icon: <EntraIdIcon className="h-8 w-8" />,
      tooltipSide: "right",
      description: "Provides SSO authentication via OpenID Connect, issues app-only tokens for service-to-service calls, and enables user and group discovery so Constellation can map Azure AD users to platform accounts.",
    },
  },
  {
    id: "sharepoint",
    type: "service",
    position: polar(72),
    data: {
      service: "sharepoint",
      label: "SharePoint Embedded",
      sublabel: "Document Storage",
      icon: <SharePointIcon className="h-8 w-8" />,
      tooltipSide: "right",
      description: "Bidirectional document storage: Constellation reads and writes invoices, contracts, expense receipts, and metadata to SharePoint Embedded containers via the Microsoft Graph API.",
    },
  },
  {
    id: "teams",
    type: "service",
    position: polar(144),
    data: {
      service: "teams",
      label: "Microsoft Teams",
      sublabel: "Collaboration",
      icon: <MicrosoftTeamsIcon className="h-8 w-8" />,
      tooltipSide: "bottom",
      description: "Constellation provisions new Teams teams and channels when projects are created, and pins a Constellation tab inside the project channel so team members can access project data directly from Teams.",
    },
  },
  {
    id: "planner",
    type: "service",
    position: polar(216),
    data: {
      service: "planner",
      label: "Microsoft Planner",
      sublabel: "Task Management",
      icon: <MicrosoftPlannerIcon className="h-8 w-8" />,
      tooltipSide: "left",
      description: "Bidirectional task sync: Constellation pushes resource allocations and milestones out to Planner tasks, and pulls completion status updates back in to keep project schedules current.",
    },
  },
  {
    id: "outlook",
    type: "service",
    position: polar(288),
    data: {
      service: "outlook",
      label: "Outlook",
      sublabel: "Email Notifications",
      icon: <OutlookIcon className="h-8 w-8" />,
      tooltipSide: "left",
      description: "Constellation sends outbound email notifications through Outlook including expense reminders, time-entry alerts, invoice delivery, and approval workflow messages.",
    },
  },
];

// ── Edge label component ───────────────────────────────────────────────────

function edgeLabel(lines: string[]): React.ReactNode {
  return (
    <div className="bg-background border border-border rounded-md px-2 py-1 shadow-sm pointer-events-none">
      {lines.map((l, i) => (
        <div key={i} className="text-[9px] text-foreground leading-tight whitespace-nowrap">{l}</div>
      ))}
    </div>
  );
}

// ── Static edges ───────────────────────────────────────────────────────────

const initialEdges: Edge[] = [
  {
    id: "entra-cst",
    source: "entra",
    target: "constellation",
    animated: false,
    label: edgeLabel(["SSO auth", "App-only token", "User/group discovery"]),
    labelBgStyle: { fill: "transparent" },
    labelStyle: { fontSize: 9 },
    markerEnd: { type: MarkerType.ArrowClosed, color: SERVICE_CONFIG.entra.edge },
    style: { stroke: SERVICE_CONFIG.entra.edge, strokeWidth: 2 },
    type: "default",
  },
  {
    id: "cst-sharepoint",
    source: "constellation",
    target: "sharepoint",
    animated: false,
    label: edgeLabel(["Invoices, contracts", "Receipts, metadata"]),
    labelBgStyle: { fill: "transparent" },
    markerEnd: { type: MarkerType.ArrowClosed, color: SERVICE_CONFIG.sharepoint.edge },
    markerStart: { type: MarkerType.ArrowClosed, color: SERVICE_CONFIG.sharepoint.edge },
    style: { stroke: SERVICE_CONFIG.sharepoint.edge, strokeWidth: 2 },
    type: "default",
  },
  {
    id: "cst-teams",
    source: "constellation",
    target: "teams",
    animated: false,
    label: edgeLabel(["Team provisioning", "Channel creation", "Tab pinning"]),
    labelBgStyle: { fill: "transparent" },
    markerEnd: { type: MarkerType.ArrowClosed, color: SERVICE_CONFIG.teams.edge },
    style: { stroke: SERVICE_CONFIG.teams.edge, strokeWidth: 2 },
    type: "default",
  },
  {
    id: "cst-planner",
    source: "constellation",
    target: "planner",
    animated: false,
    label: edgeLabel(["Allocations sync", "Completion status"]),
    labelBgStyle: { fill: "transparent" },
    markerEnd: { type: MarkerType.ArrowClosed, color: SERVICE_CONFIG.planner.edge },
    markerStart: { type: MarkerType.ArrowClosed, color: SERVICE_CONFIG.planner.edge },
    style: { stroke: SERVICE_CONFIG.planner.edge, strokeWidth: 2 },
    type: "default",
  },
  {
    id: "cst-outlook",
    source: "constellation",
    target: "outlook",
    animated: false,
    label: edgeLabel(["Expense reminders", "Time entry alerts"]),
    labelBgStyle: { fill: "transparent" },
    markerEnd: { type: MarkerType.ArrowClosed, color: SERVICE_CONFIG.outlook.edge },
    style: { stroke: SERVICE_CONFIG.outlook.edge, strokeWidth: 2 },
    type: "default",
  },
];

// ── MiniMap node color helper ──────────────────────────────────────────────

function getNodeColor(n: Node): string {
  const service = (n.data as Partial<ServiceNodeData>).service;
  if (service && service in SERVICE_CONFIG) {
    return SERVICE_CONFIG[service].dot;
  }
  return "#6366f1";
}

// ── Legend item ────────────────────────────────────────────────────────────

function LegendRow({ color, label, direction }: { color: string; label: string; direction: "in" | "out" | "both" }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <div
        className="w-6 h-0.5 shrink-0 relative"
        style={{ backgroundColor: color }}
      >
        {(direction === "out" || direction === "both") && (
          <span className="absolute right-0 top-1/2 -translate-y-1/2 text-[10px]" style={{ color }}>▶</span>
        )}
        {direction === "both" && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 text-[10px]" style={{ color }}>◀</span>
        )}
        {direction === "in" && (
          <span className="absolute right-0 top-1/2 -translate-y-1/2 text-[10px]" style={{ color }}>▶</span>
        )}
      </div>
      <span>{label}</span>
    </div>
  );
}

// ── Main page component ────────────────────────────────────────────────────

export default function M365IntegrationDiagram() {
  const [nodes, , onNodesChange] = useNodesState<DiagramNode>(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  return (
    <Layout>
      <div className="space-y-6 pb-8">
        <div>
          <h1 className="text-3xl font-bold">M365 Integration Architecture</h1>
          <p className="text-muted-foreground mt-1">
            Visual overview of how Constellation integrates with Microsoft 365 services. Hover over any node or connection for details.
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          <Card className="xl:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Integration Diagram</CardTitle>
              <CardDescription>Interactive diagram — drag to pan, scroll to zoom</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[600px] rounded-b-lg overflow-hidden">
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  nodeTypes={nodeTypes}
                  fitView
                  fitViewOptions={{ padding: 0.2 }}
                  minZoom={0.4}
                  maxZoom={2}
                  proOptions={{ hideAttribution: true }}
                >
                  <Background gap={20} size={1} className="opacity-30" />
                  <Controls showInteractive={false} />
                  <MiniMap nodeColor={getNodeColor} className="opacity-80" />
                </ReactFlow>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Data Flow Legend</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <LegendRow color={SERVICE_CONFIG.entra.edge ?? ""} label="Entra ID → auth & identity" direction="in" />
                <LegendRow color={SERVICE_CONFIG.sharepoint.edge ?? ""} label="SharePoint ↔ documents" direction="both" />
                <LegendRow color={SERVICE_CONFIG.teams.edge ?? ""} label="Teams ← provisioning" direction="out" />
                <LegendRow color={SERVICE_CONFIG.planner.edge ?? ""} label="Planner ↔ task sync" direction="both" />
                <LegendRow color={SERVICE_CONFIG.outlook.edge ?? ""} label="Outlook ← notifications" direction="out" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Services</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  {
                    label: "Entra ID",
                    color: SERVICE_CONFIG.entra.dot,
                    flows: ["SSO authentication", "App-only token", "User/group discovery"],
                  },
                  {
                    label: "SharePoint Embedded",
                    color: SERVICE_CONFIG.sharepoint.dot,
                    flows: ["Document read/write", "Invoices & contracts", "Expense receipts"],
                  },
                  {
                    label: "Microsoft Teams",
                    color: SERVICE_CONFIG.teams.dot,
                    flows: ["Team provisioning", "Channel creation", "Constellation tab"],
                  },
                  {
                    label: "Microsoft Planner",
                    color: SERVICE_CONFIG.planner.dot,
                    flows: ["Allocation sync", "Completion status", "Bidirectional"],
                  },
                  {
                    label: "Outlook",
                    color: SERVICE_CONFIG.outlook.dot,
                    flows: ["Expense reminders", "Time alerts", "Invoice delivery"],
                  },
                ].map((svc) => (
                  <div key={svc.label} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: svc.color }} />
                      <span className="text-xs font-medium">{svc.label}</span>
                    </div>
                    <div className="pl-4 flex flex-wrap gap-1">
                      {svc.flows.map((f) => (
                        <Badge key={f} variant="secondary" className="text-[9px] px-1.5 py-0">
                          {f}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
