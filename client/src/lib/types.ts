export interface DashboardMetrics {
  activeProjects: number;
  utilizationRate: number;
  monthlyRevenue: number;
  unbilledHours: number;
  remainingHours: number;
  budgetedHours: number;
  actualHoursAllProjects: number;
  budgetHealthPct: number;
}

export interface ProjectWithClient {
  id: string;
  name: string;
  code: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  commercialScheme: string;
  retainerBalance: string | null;
  retainerTotal: string | null;
  baselineBudget: string | null;
  sowValue: string | null;
  sowDate: string | null;
  hasSow: boolean;
  clientId: string;
  pm: string | null;
  pmName?: string | null;
  totalBudget?: number;
  burnedAmount?: number;
  utilizationRate?: number;
  paymentMilestoneBilling?: {
    overdueCount: number;
    unInvoicedCount: number;
  };
  client: {
    id: string;
    name: string;
  };
}

export interface SlippageRecommendation {
  type: "schedule" | "assignment" | "milestone" | "velocity" | "raidd";
  severity: "info" | "warning" | "critical";
  message: string;
  action: string;
  targetId?: string;
  targetName?: string;
}

export interface ProjectSlippageMetrics {
  projectId: string;
  projectName: string;
  clientName: string;
  pmId: string | null;
  pmName: string | null;
  projectStatus: string;
  startDate: string | null;
  endDate: string | null;
  plannedProgressPct: number;
  actualProgressPct: number;
  spi: number;
  projectedSlipDays: number;
  projectedCompletionDate: string | null;
  overdueAssignments: number;
  totalOpenAssignments: number;
  overdueAssignmentNames: string[];
  overdueDeliverables: number;
  atRiskDeliverables: number;
  overdueMilestones: number;
  atRiskMilestones: number;
  overdueDeliverableNames: string[];
  overdueMilestoneNames: string[];
  openCriticalRisks: number;
  openHighRisks: number;
  openCriticalIssues: number;
  openHighIssues: number;
  lastActivityDate: string | null;
  daysSinceLastActivity: number;
  weeklyBurnRate: number;
  plannedWeeklyBurnRate: number;
  slippageScore: number;
  slippageLevel: "on-track" | "watch" | "at-risk" | "critical";
  recommendations: SlippageRecommendation[];
  signals: {
    scheduleSignal: number;
    assignmentSignal: number;
    milestoneSignal: number;
    raiddSignal: number;
    velocitySignal: number;
  };
}

export interface PortfolioSlippageSummary {
  asOf: string;
  summary: {
    onTrack: number;
    watch: number;
    atRisk: number;
    critical: number;
  };
  projects: ProjectSlippageMetrics[];
}

export interface UserSlippageAlert {
  type: "overdue_assignment" | "velocity_lag";
  severity: "warning" | "critical";
  message: string;
  action: string;
  projectId: string;
  projectName: string;
  assignmentId?: string;
  daysSince?: number;
}

export interface EstimateAllocationData {
  id: string;
  weekStartDate: string;
  hours: string;
  rackRate: string;
  role?: {
    id: string;
    name: string;
  };
  person?: {
    id: string;
    name: string;
  };
  pricingMode: 'role' | 'person';
}
