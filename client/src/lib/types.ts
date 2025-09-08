export interface DashboardMetrics {
  activeProjects: number;
  utilizationRate: number;
  monthlyRevenue: number;
  unbilledHours: number;
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
  client: {
    id: string;
    name: string;
  };
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
