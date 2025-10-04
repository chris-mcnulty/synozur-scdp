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
  Briefcase
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
  return (
    <aside className="w-64 bg-card border-r border-border" data-testid="sidebar">
      <div className="p-6">
        <nav className="space-y-2">
          <SidebarSection title="Portfolio" />
          
          <SidebarItem
            href="/"
            icon={<ChartLine />}
            label="Dashboard"
          />
          
          <SidebarItem
            href="/projects"
            icon={<FolderOpen />}
            label="Projects"
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
            href="/reports"
            icon={<BarChart3 />}
            label="Reports"
            requiredRoles={["admin", "billing-admin", "pm", "executive"]}
          />
          
          <SidebarSection title="Operations" />
          
          <SidebarItem
            href="/my-assignments"
            icon={<Briefcase />}
            label="My Assignments"
          />
          
          <SidebarItem
            href="/time"
            icon={<Clock />}
            label="Time Tracking"
          />
          
          <SidebarItem
            href="/expenses"
            icon={<Receipt />}
            label="Expenses"
          />
          
          <SidebarItem
            href="/expense-management"
            icon={<UsersRound />}
            label="Expense Management"
            requiredRoles={["admin", "pm", "billing-admin"]}
          />
          
          <SidebarItem
            href="/billing"
            icon={<DollarSign />}
            label="Billing"
          />
          
          <SidebarSection title="Administration" />
          
          <SidebarItem
            href="/rates"
            icon={<Receipt />}
            label="Rate Management"
            badge="Admin"
            requiredRoles={["admin"]}
          />
          
          <SidebarItem
            href="/users"
            icon={<Users />}
            label="User Management"
            requiredRoles={["admin"]}
          />
          
          <SidebarItem
            href="/system-settings"
            icon={<Settings />}
            label="System Settings"
            requiredRoles={["admin"]}
          />
          
          <SidebarItem
            href="/about"
            icon={<Info />}
            label="About"
          />
          
        </nav>
      </div>
    </aside>
  );
}
