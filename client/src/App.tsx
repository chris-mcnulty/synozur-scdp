import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/dashboard";
import Projects from "@/pages/projects";
import ProjectDetail from "@/pages/project-detail";
import Clients from "@/pages/clients";
import ClientDetail from "@/pages/client-detail";
import Estimates from "@/pages/estimates";
import EstimateDetail from "@/pages/estimate-detail";
import TimeTracking from "@/pages/time-tracking";
import Expenses from "@/pages/expenses";
import ExpenseManagement from "@/pages/expense-management";
import Billing from "@/pages/billing";
import BatchDetail from "@/pages/batch-detail";
import RateManagement from "@/pages/rate-management";
import Users from "@/pages/users";
import Reports from "@/pages/reports";
import { MyAssignments } from "@/pages/my-assignments";
import ResourceManagement from "@/pages/resource-management";
import CrossProjectResource from "@/pages/cross-project-resource";
import SystemSettings from "@/pages/system-settings";
import { AdminSharePoint } from "@/pages/admin-sharepoint";
import About from "@/pages/about";
import UserGuide from "@/pages/user-guide";
import Login from "@/pages/login";
import FileRepository from "@/pages/file-repository";
import NotFound from "@/pages/not-found";
import { useQuery } from "@tanstack/react-query";
import { Redirect, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { setSessionId } from "@/lib/queryClient";
import { useSessionRecovery } from "@/hooks/use-session-recovery";
import { Loader2 } from "lucide-react";

function Router() {
  const [processingSession, setProcessingSession] = useState(true);
  const { isRecovering } = useSessionRecovery();
  const [, setLocation] = useLocation();
  
  // Get user data first
  const { data: user, isLoading, error } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
    enabled: !processingSession && !isRecovering, // Only check auth after processing sessionId and not recovering
  });
  
  // Update page title based on environment
  useEffect(() => {
    const isDevelopment = import.meta.env.MODE === 'development';
    const baseTitle = 'Synozur Consulting Delivery Platform';
    document.title = isDevelopment ? `Development - ${baseTitle}` : baseTitle;
  }, []);
  
  // Handle sessionId from SSO callback FIRST
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('sessionId');
    
    if (sessionId) {
      // Store session and reload to clean URL
      setSessionId(sessionId);
      localStorage.setItem('sessionId', sessionId);
      // Clean URL and reload
      window.location.href = "/";
    } else {
      setProcessingSession(false);
    }
  }, []);
  
  // Check for redirect after login
  useEffect(() => {
    const redirectPath = sessionStorage.getItem('redirectAfterLogin');
    if (redirectPath && user) {
      sessionStorage.removeItem('redirectAfterLogin');
      setLocation(redirectPath);
    }
  }, [user, setLocation]);

  // Show a better loading state
  if (processingSession || isLoading || isRecovering) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <div className="text-lg text-muted-foreground">
            {isRecovering ? "Recovering session..." : "Loading..."}
          </div>
        </div>
      </div>
    );
  }
  
  // Handle session errors gracefully
  if (error && !user && window.location.pathname !== '/login') {
    // Session validation failed, the recovery hook will handle redirect
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <div className="text-lg text-muted-foreground">Redirecting to login...</div>
        </div>
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/">
        {user ? <Dashboard /> : <Redirect to="/login" />}
      </Route>
      <Route path="/dashboard">
        {user ? <Dashboard /> : <Redirect to="/login" />}
      </Route>
      {/* Personal workspace routes */}
      <Route path="/my-dashboard">
        {user ? <Dashboard /> : <Redirect to="/login" />}
      </Route>
      <Route path="/my-projects">
        {user ? <Projects /> : <Redirect to="/login" />}
      </Route>
      <Route path="/projects">
        {user ? <Projects /> : <Redirect to="/login" />}
      </Route>
      <Route path="/projects/:id">
        {user ? <ProjectDetail /> : <Redirect to="/login" />}
      </Route>
      <Route path="/clients">
        {user ? <Clients /> : <Redirect to="/login" />}
      </Route>
      <Route path="/clients/:id">
        {user ? <ClientDetail /> : <Redirect to="/login" />}
      </Route>
      <Route path="/estimates">
        {user ? <Estimates /> : <Redirect to="/login" />}
      </Route>
      <Route path="/estimates/:id">
        {user ? <EstimateDetail /> : <Redirect to="/login" />}
      </Route>
      <Route path="/time">
        {user ? <TimeTracking /> : <Redirect to="/login" />}
      </Route>
      <Route path="/expenses">
        {user ? <Expenses /> : <Redirect to="/login" />}
      </Route>
      <Route path="/expense-management">
        {user ? <ExpenseManagement /> : <Redirect to="/login" />}
      </Route>
      <Route path="/billing">
        {user ? <Billing /> : <Redirect to="/login" />}
      </Route>
      <Route path="/billing/batches/:batchId">
        {user ? <BatchDetail /> : <Redirect to="/login" />}
      </Route>
      <Route path="/rates">
        {user ? <RateManagement /> : <Redirect to="/login" />}
      </Route>
      <Route path="/users">
        {user ? <Users /> : <Redirect to="/login" />}
      </Route>
      <Route path="/my-assignments">
        {user ? <MyAssignments /> : <Redirect to="/login" />}
      </Route>
      <Route path="/resource-management">
        {user ? <ResourceManagement /> : <Redirect to="/login" />}
      </Route>
      <Route path="/cross-project-resource">
        {user ? <CrossProjectResource /> : <Redirect to="/login" />}
      </Route>
      <Route path="/system-settings">
        {user ? <SystemSettings /> : <Redirect to="/login" />}
      </Route>
      <Route path="/admin/sharepoint">
        {user ? <AdminSharePoint /> : <Redirect to="/login" />}
      </Route>
      <Route path="/vocabulary">
        {user ? <SystemSettings /> : <Redirect to="/login" />}
      </Route>
      <Route path="/file-repository">
        {user ? <FileRepository /> : <Redirect to="/login" />}
      </Route>
      <Route path="/reports">
        {user ? <Reports /> : <Redirect to="/login" />}
      </Route>
      <Route path="/about">
        {user ? <About /> : <Redirect to="/login" />}
      </Route>
      <Route path="/user-guide">
        {user ? <UserGuide /> : <Redirect to="/login" />}
      </Route>
      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
