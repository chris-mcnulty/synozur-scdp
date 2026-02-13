import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import { 
  ChartLine, 
  FolderOpen, 
  Clock, 
  Receipt, 
  FileText, 
  DollarSign, 
  Users,
  BarChart3,
  Settings,
  Building2,
  Info,
  Briefcase,
  Languages,
  Home,
  Calculator,
  CreditCard,
  Banknote,
  Database,
  BookOpen,
  Shield,
  Crown,
  Package,
  Plane,
  Globe,
  CalendarClock,
  History,
  Map,
  GanttChart,
  ChevronRight,
  HelpCircle,
  ShieldAlert,
} from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "constellation-sidebar-sections";

interface SidebarItemProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  badge?: string;
  requiredRoles?: string[];
}

function SidebarItem({ href, icon, label, badge, requiredRoles }: SidebarItemProps) {
  const [location] = useLocation();
  const { hasAnyRole } = useAuth();
  
  const isActive = location === href;
  
  if (requiredRoles && !hasAnyRole(requiredRoles)) {
    return null;
  }

  return (
    <Link 
      href={href}
      className={cn(
        "flex items-center space-x-3 px-3 py-2 rounded-md transition-colors text-sm",
        isActive 
          ? 'bg-accent text-accent-foreground font-medium' 
          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
      )}
      data-testid={`link-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="w-4 h-4 shrink-0">{icon}</div>
      <span className="truncate">{label}</span>
      {badge && (
        <span className="ml-auto text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
          {badge}
        </span>
      )}
    </Link>
  );
}

interface CollapsibleSectionProps {
  id: string;
  title: string;
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: (id: string) => void;
}

function CollapsibleSection({ id, title, children, isOpen, onToggle }: CollapsibleSectionProps) {
  return (
    <Collapsible open={isOpen} onOpenChange={() => onToggle(id)}>
      <CollapsibleTrigger className="flex items-center justify-between w-full pt-4 pb-2 group cursor-pointer">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider group-hover:text-foreground transition-colors">
          {title}
        </h3>
        <ChevronRight className={cn(
          "w-3.5 h-3.5 text-muted-foreground transition-transform duration-200",
          isOpen && "rotate-90"
        )} />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-1">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

interface SectionRoute {
  sectionId: string;
  paths: string[];
}

const sectionRoutes: SectionRoute[] = [
  { sectionId: "my-workspace", paths: ["/my-dashboard", "/my-assignments", "/time", "/expenses", "/expense-reports", "/my-reimbursements", "/my-projects"] },
  { sectionId: "portfolio", paths: ["/", "/portfolio/timeline", "/portfolio/raidd", "/projects", "/clients", "/estimates", "/resource-management", "/reports"] },
  { sectionId: "financial", paths: ["/billing", "/invoice-report", "/expense-management", "/expense-approval", "/reimbursement-batches", "/rates"] },
  { sectionId: "administration", paths: ["/users", "/system-settings", "/admin/scheduled-jobs", "/vocabulary", "/file-repository", "/admin/sharepoint"] },
  { sectionId: "platform", paths: ["/platform/tenants", "/platform/service-plans", "/platform/users", "/platform/airports", "/platform/oconus"] },
];

function getSectionForPath(path: string): string | null {
  for (const section of sectionRoutes) {
    if (section.paths.includes(path)) {
      return section.sectionId;
    }
    if (path !== "/" && section.paths.some(p => p !== "/" && path.startsWith(p))) {
      return section.sectionId;
    }
  }
  return null;
}

function loadSectionState(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return { "my-workspace": true };
}

function saveSectionState(state: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function Sidebar() {
  const { hasAnyRole, isPlatformAdmin } = useAuth();
  const [location] = useLocation();
  
  const isManager = hasAnyRole(['admin', 'pm', 'executive']);
  const isFinanceRole = hasAnyRole(['admin', 'billing-admin']);
  const isAdmin = hasAnyRole(['admin']);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const saved = loadSectionState();
    const activeSection = getSectionForPath(location);
    if (activeSection) {
      saved[activeSection] = true;
    }
    return saved;
  });

  useEffect(() => {
    const activeSection = getSectionForPath(location);
    if (activeSection && !openSections[activeSection]) {
      setOpenSections(prev => {
        const next = { ...prev, [activeSection]: true };
        saveSectionState(next);
        return next;
      });
    }
  }, [location]);

  const handleToggle = useCallback((id: string) => {
    setOpenSections(prev => {
      const next = { ...prev, [id]: !prev[id] };
      saveSectionState(next);
      return next;
    });
  }, []);
  
  return (
    <aside className="hidden lg:flex lg:flex-col w-64 bg-card border-r border-border h-[calc(100vh-73px)] sticky top-[73px]" data-testid="sidebar">
      <ScrollArea className="flex-1">
        <div className="px-4 py-2">
          <nav className="space-y-1">
            <CollapsibleSection
              id="my-workspace"
              title="My Workspace"
              isOpen={!!openSections["my-workspace"]}
              onToggle={handleToggle}
            >
              <SidebarItem href="/my-dashboard" icon={<Home />} label="Dashboard" />
              <SidebarItem href="/my-assignments" icon={<Briefcase />} label="Assignments" />
              <SidebarItem href="/time" icon={<Clock />} label="Time" />
              <SidebarItem href="/expenses" icon={<Receipt />} label="Expenses" />
              <SidebarItem href="/expense-reports" icon={<FileText />} label="Expense Reports" />
              <SidebarItem href="/my-reimbursements" icon={<Banknote />} label="Reimbursements" />
              <SidebarItem href="/my-projects" icon={<FolderOpen />} label="Projects" />
            </CollapsibleSection>
            
            {isManager && (
              <CollapsibleSection
                id="portfolio"
                title="Portfolio"
                isOpen={!!openSections["portfolio"]}
                onToggle={handleToggle}
              >
                <SidebarItem href="/" icon={<ChartLine />} label="Dashboard" />
                <SidebarItem href="/portfolio/timeline" icon={<GanttChart />} label="Timeline" />
                {hasAnyRole(["admin", "pm", "executive"]) && (
                  <SidebarItem href="/portfolio/raidd" icon={<ShieldAlert />} label="RAIDD" />
                )}
                <SidebarItem href="/projects" icon={<FolderOpen />} label="All Projects" />
                <SidebarItem href="/clients" icon={<Building2 />} label="Clients" />
                <SidebarItem href="/estimates" icon={<FileText />} label="Estimates" />
                <SidebarItem href="/resource-management" icon={<Users />} label="Resources" />
                <SidebarItem href="/reports" icon={<BarChart3 />} label="Reports" />
              </CollapsibleSection>
            )}
            
            {isFinanceRole && (
              <CollapsibleSection
                id="financial"
                title="Financial"
                isOpen={!!openSections["financial"]}
                onToggle={handleToggle}
              >
                <SidebarItem href="/billing" icon={<DollarSign />} label="Billing & Invoicing" />
                <SidebarItem href="/invoice-report" icon={<FileText />} label="Invoice Report" />
                <SidebarItem href="/expense-management" icon={<CreditCard />} label="Expense Management" />
                <SidebarItem href="/expense-approval" icon={<Receipt />} label="Expense Approval" />
                <SidebarItem href="/reimbursement-batches" icon={<Banknote />} label="Reimbursements" />
                <SidebarItem href="/rates" icon={<Calculator />} label="Rate Management" />
              </CollapsibleSection>
            )}
            
            {isAdmin && (
              <CollapsibleSection
                id="administration"
                title="Administration"
                isOpen={!!openSections["administration"]}
                onToggle={handleToggle}
              >
                <SidebarItem href="/users" icon={<Users />} label="User Management" />
                <SidebarItem href="/system-settings" icon={<Settings />} label="System Settings" />
                <SidebarItem href="/admin/scheduled-jobs" icon={<CalendarClock />} label="Scheduled Jobs" />
                <SidebarItem href="/vocabulary" icon={<Languages />} label="Vocabulary" />
                <SidebarItem href="/file-repository" icon={<Database />} label="File Repository" />
                <SidebarItem href="/admin/sharepoint" icon={<Settings />} label="SharePoint Diagnostics" />
              </CollapsibleSection>
            )}
            
            {isPlatformAdmin && (
              <CollapsibleSection
                id="platform"
                title="Platform"
                isOpen={!!openSections["platform"]}
                onToggle={handleToggle}
              >
                <SidebarItem href="/platform/tenants" icon={<Crown />} label="Tenants" />
                <SidebarItem href="/platform/service-plans" icon={<Package />} label="Service Plans" />
                <SidebarItem href="/platform/users" icon={<Shield />} label="Platform Users" />
                <SidebarItem href="/platform/airports" icon={<Plane />} label="Airport Codes" />
                <SidebarItem href="/platform/oconus" icon={<Globe />} label="OCONUS Rates" />
              </CollapsibleSection>
            )}
          </nav>
        </div>
      </ScrollArea>

      <div className="border-t border-border px-4 py-3 space-y-1">
        <SidebarItem href="/user-guide" icon={<BookOpen />} label="User Guide" />
        <SidebarItem href="/changelog" icon={<History />} label="Changelog" />
        <SidebarItem href="/roadmap" icon={<Map />} label="Roadmap" />
        <SidebarItem href="/about" icon={<Info />} label="About" />
      </div>
    </aside>
  );
}
