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
  UsersRound,
  BarChart3,
  Settings,
  Building2,
  Info,
  Briefcase,
  Languages,
  User,
  Home,
  Calculator,
  CreditCard,
  Database,
  BookOpen,
  Shield,
  Crown,
  Package,
  Plane
} from "lucide-react";

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
  
  // Hide if user doesn't have required role
  if (requiredRoles && !hasAnyRole(requiredRoles)) {
    return null;
  }

  return (
    <Link 
      href={href}
      className={`flex items-center space-x-3 px-3 py-2 rounded-md transition-colors ${
        isActive 
          ? 'bg-accent text-accent-foreground' 
          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
      }`}
      data-testid={`link-${label.toLowerCase().replace(' ', '-')}`}
    >
      <div className="w-5 h-5">{icon}</div>
      <span>{label}</span>
      {badge && (
        <span className="ml-auto text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
          {badge}
        </span>
      )}
    </Link>
  );
}

function SidebarSection({ title }: { title: string }) {
  return (
    <div className="pt-4 pb-2">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {title}
      </h3>
    </div>
  );
}

export function Sidebar() {
  const { hasAnyRole, isPlatformAdmin } = useAuth();
  
  // Determine if user has management roles
  const isManager = hasAnyRole(['admin', 'pm', 'executive']);
  const isFinanceRole = hasAnyRole(['admin', 'billing-admin']);
  const isAdmin = hasAnyRole(['admin']);
  
  return (
    <aside className="hidden lg:block w-64 bg-card border-r border-border" data-testid="sidebar">
      <div className="p-6">
        <nav className="space-y-2">
          {/* Personal workspace - always visible to logged-in users */}
          <SidebarSection title="My Workspace" />
          
          <SidebarItem
            href="/my-dashboard"
            icon={<Home />}
            label="My Dashboard"
          />
          
          <SidebarItem
            href="/my-assignments"
            icon={<Briefcase />}
            label="My Assignments"
          />
          
          <SidebarItem
            href="/time"
            icon={<Clock />}
            label="My Time"
          />
          
          <SidebarItem
            href="/expenses"
            icon={<Receipt />}
            label="My Expenses"
          />
          
          <SidebarItem
            href="/expense-reports"
            icon={<FileText />}
            label="My Expense Reports"
          />
          
          <SidebarItem
            href="/my-projects"
            icon={<FolderOpen />}
            label="My Projects"
          />
          
          {/* Portfolio Management - for PMs and Leaders */}
          {isManager && (
            <>
              <SidebarSection title="Portfolio Management" />
              
              <SidebarItem
                href="/"
                icon={<ChartLine />}
                label="Portfolio Dashboard"
              />
              
              <SidebarItem
                href="/projects"
                icon={<FolderOpen />}
                label="All Projects"
              />
              
              <SidebarItem
                href="/clients"
                icon={<Building2 />}
                label="Clients"
              />
              
              <SidebarItem
                href="/estimates"
                icon={<FileText />}
                label="Estimates"
              />
              
              <SidebarItem
                href="/resource-management"
                icon={<Users />}
                label="Resource Management"
              />
              
              <SidebarItem
                href="/reports"
                icon={<BarChart3 />}
                label="Reports"
              />
            </>
          )}
          
          {/* Financial - segregated financial operations */}
          {isFinanceRole && (
            <>
              <SidebarSection title="Financial" />
              
              <SidebarItem
                href="/billing"
                icon={<DollarSign />}
                label="Billing & Invoicing"
              />
              
              <SidebarItem
                href="/expense-management"
                icon={<CreditCard />}
                label="Expense Management"
              />
              
              <SidebarItem
                href="/expense-approval"
                icon={<Receipt />}
                label="Expense Approval"
              />
              
              <SidebarItem
                href="/rates"
                icon={<Calculator />}
                label="Rate Management"
              />
            </>
          )}
          
          {/* Administration - centralized admin */}
          {isAdmin && (
            <>
              <SidebarSection title="Administration" />
              
              <SidebarItem
                href="/users"
                icon={<Users />}
                label="User Management"
              />
              
              <SidebarItem
                href="/system-settings"
                icon={<Settings />}
                label="System Settings"
              />
              
              <SidebarItem
                href="/vocabulary"
                icon={<Languages />}
                label="Vocabulary"
              />
              
              <SidebarItem
                href="/file-repository"
                icon={<Database />}
                label="File Repository"
              />
              
              <SidebarItem
                href="/admin/sharepoint"
                icon={<Settings />}
                label="SharePoint Diagnostics"
              />
            </>
          )}
          
          {/* Platform Admin - for global_admin and constellation_admin only */}
          {isPlatformAdmin && (
            <>
              <SidebarSection title="Platform Admin" />
              
              <SidebarItem
                href="/platform/tenants"
                icon={<Crown />}
                label="Tenants"
              />
              
              <SidebarItem
                href="/platform/service-plans"
                icon={<Package />}
                label="Service Plans"
              />
              
              <SidebarItem
                href="/platform/users"
                icon={<Shield />}
                label="Platform Users"
              />
              
              <SidebarItem
                href="/platform/airports"
                icon={<Plane />}
                label="Airport Codes"
              />
            </>
          )}
          
          {/* About - always visible */}
          <div className="pt-4">
            <SidebarItem
              href="/user-guide"
              icon={<BookOpen />}
              label="User Guide"
            />
            <SidebarItem
              href="/about"
              icon={<Info />}
              label="About"
            />
          </div>
        </nav>
      </div>
    </aside>
  );
}