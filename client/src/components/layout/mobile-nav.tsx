import { useState } from 'react';
import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import { 
  Menu,
  X,
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
  ChevronRight,
  BookOpen,
  CalendarClock,
  History,
  Map
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface MobileNavItemProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  badge?: string;
  requiredRoles?: string[];
  onClick?: () => void;
}

function MobileNavItem({ href, icon, label, badge, requiredRoles, onClick }: MobileNavItemProps) {
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
      onClick={onClick}
      className={`flex items-center space-x-3 px-4 py-3 rounded-md transition-colors ${
        isActive 
          ? 'bg-accent text-accent-foreground' 
          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
      }`}
      data-testid={`mobile-link-${label.toLowerCase().replace(' ', '-')}`}
    >
      <div className="w-5 h-5">{icon}</div>
      <span className="flex-1">{label}</span>
      {badge && (
        <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
          {badge}
        </span>
      )}
      <ChevronRight className="w-4 h-4 opacity-40" />
    </Link>
  );
}

function MobileNavSection({ title }: { title: string }) {
  return (
    <div className="px-4 pt-4 pb-2">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {title}
      </h3>
    </div>
  );
}

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const { hasAnyRole, user } = useAuth();
  
  // Determine if user has management roles
  const isManager = hasAnyRole(['admin', 'pm', 'executive']);
  const isFinanceRole = hasAnyRole(['admin', 'billing-admin']);
  const isAdmin = hasAnyRole(['admin']);
  
  const handleNavClick = () => {
    setOpen(false);
  };
  
  return (
    <div className="lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            className="lg:hidden"
            data-testid="mobile-menu-toggle"
          >
            <Menu className="h-6 w-6" />
            <span className="sr-only">Toggle menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[85vw] sm:w-[385px] p-0">
          <SheetHeader className="px-6 py-4 border-b">
            <SheetTitle className="text-left">Constellation</SheetTitle>
            <div className="text-sm text-muted-foreground">
              {user ? (
                user.firstName && user.lastName 
                  ? `${user.firstName} ${user.lastName}` 
                  : user.name || user.email
              ) : ''}
            </div>
          </SheetHeader>
          
          <ScrollArea className="h-[calc(100vh-80px)]">
            <div className="pb-8">
              {/* Personal workspace - always visible to logged-in users */}
              <MobileNavSection title="My Workspace" />
              
              <MobileNavItem
                href="/my-dashboard"
                icon={<Home />}
                label="My Dashboard"
                onClick={handleNavClick}
              />
              
              <MobileNavItem
                href="/my-assignments"
                icon={<Briefcase />}
                label="My Assignments"
                onClick={handleNavClick}
              />
              
              <MobileNavItem
                href="/time"
                icon={<Clock />}
                label="My Time"
                onClick={handleNavClick}
              />
              
              <MobileNavItem
                href="/expenses"
                icon={<Receipt />}
                label="My Expenses"
                onClick={handleNavClick}
              />
              
              <MobileNavItem
                href="/expense-reports"
                icon={<FileText />}
                label="My Expense Reports"
                onClick={handleNavClick}
              />
              
              <MobileNavItem
                href="/my-projects"
                icon={<FolderOpen />}
                label="My Projects"
                onClick={handleNavClick}
              />
              
              {/* Portfolio Management - for PMs and Leaders */}
              {isManager && (
                <>
                  <Separator className="my-2" />
                  <MobileNavSection title="Portfolio Management" />
                  
                  <MobileNavItem
                    href="/"
                    icon={<ChartLine />}
                    label="Portfolio Dashboard"
                    onClick={handleNavClick}
                  />
                  
                  <MobileNavItem
                    href="/projects"
                    icon={<FolderOpen />}
                    label="All Projects"
                    onClick={handleNavClick}
                  />
                  
                  <MobileNavItem
                    href="/clients"
                    icon={<Building2 />}
                    label="Clients"
                    onClick={handleNavClick}
                  />
                  
                  <MobileNavItem
                    href="/estimates"
                    icon={<FileText />}
                    label="Estimates"
                    onClick={handleNavClick}
                  />
                  
                  <MobileNavItem
                    href="/resource-management"
                    icon={<Users />}
                    label="Resource Management"
                    onClick={handleNavClick}
                  />
                  
                  <MobileNavItem
                    href="/reports"
                    icon={<BarChart3 />}
                    label="Reports"
                    onClick={handleNavClick}
                  />
                </>
              )}
              
              {/* Financial - segregated financial operations */}
              {isFinanceRole && (
                <>
                  <Separator className="my-2" />
                  <MobileNavSection title="Financial" />
                  
                  <MobileNavItem
                    href="/billing"
                    icon={<DollarSign />}
                    label="Billing & Invoicing"
                    onClick={handleNavClick}
                  />
                  
                  <MobileNavItem
                    href="/expense-management"
                    icon={<CreditCard />}
                    label="Expense Management"
                    onClick={handleNavClick}
                  />
                  
                  <MobileNavItem
                    href="/expense-approval"
                    icon={<Receipt />}
                    label="Expense Approval"
                    onClick={handleNavClick}
                  />
                  
                  <MobileNavItem
                    href="/rates"
                    icon={<Calculator />}
                    label="Rate Management"
                    onClick={handleNavClick}
                  />
                </>
              )}
              
              {/* Administration - centralized admin */}
              {isAdmin && (
                <>
                  <Separator className="my-2" />
                  <MobileNavSection title="Administration" />
                  
                  <MobileNavItem
                    href="/users"
                    icon={<Users />}
                    label="User Management"
                    onClick={handleNavClick}
                  />
                  
                  <MobileNavItem
                    href="/system-settings"
                    icon={<Settings />}
                    label="System Settings"
                    onClick={handleNavClick}
                  />
                  
                  <MobileNavItem
                    href="/admin/scheduled-jobs"
                    icon={<CalendarClock />}
                    label="Scheduled Jobs"
                    onClick={handleNavClick}
                  />
                  
                  <MobileNavItem
                    href="/vocabulary"
                    icon={<Languages />}
                    label="Vocabulary"
                    onClick={handleNavClick}
                  />
                </>
              )}
              
              {/* About - always visible */}
              <Separator className="my-2" />
              <MobileNavItem
                href="/user-guide"
                icon={<BookOpen />}
                label="User Guide"
                onClick={handleNavClick}
              />
              <MobileNavItem
                href="/changelog"
                icon={<History />}
                label="Changelog"
                onClick={handleNavClick}
              />
              <MobileNavItem
                href="/roadmap"
                icon={<Map />}
                label="Roadmap"
                onClick={handleNavClick}
              />
              <MobileNavItem
                href="/about"
                icon={<Info />}
                label="About"
                onClick={handleNavClick}
              />
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}