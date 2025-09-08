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
  Palette 
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
    <Link href={href}>
      <a 
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
      </a>
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
            href="/estimates"
            icon={<FileText />}
            label="Estimates"
          />
          
          <SidebarSection title="Operations" />
          
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
            href="/staff"
            icon={<UsersRound />}
            label="Staff Management"
            requiredRoles={["admin"]}
          />
          
          <SidebarItem
            href="/users"
            icon={<Users />}
            label="User Management"
            requiredRoles={["admin"]}
          />
          
          <SidebarItem
            href="/branding"
            icon={<Palette />}
            label="Branding"
            requiredRoles={["admin"]}
          />
        </nav>
      </div>
    </aside>
  );
}
