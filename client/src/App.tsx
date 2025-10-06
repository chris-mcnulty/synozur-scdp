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
import SystemSettings from "@/pages/system-settings";
import VocabularyManagement from "@/pages/vocabulary-management";
import About from "@/pages/about";
import Login from "@/pages/login";
import NotFound from "@/pages/not-found";
import { useQuery } from "@tanstack/react-query";
import { Redirect } from "wouter";
import { useEffect, useState } from "react";
import { setSessionId } from "@/lib/queryClient";

function Router() {
  const [processingSession, setProcessingSession] = useState(true);
  
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
  
  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
    enabled: !processingSession, // Only check auth after processing sessionId
  });

  if (processingSession || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
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
      <Route path="/system-settings">
        {user ? <SystemSettings /> : <Redirect to="/login" />}
      </Route>
      <Route path="/vocabulary-management">
        {user ? <VocabularyManagement /> : <Redirect to="/login" />}
      </Route>
      <Route path="/reports">
        {user ? <Reports /> : <Redirect to="/login" />}
      </Route>
      <Route path="/about">
        {user ? <About /> : <Redirect to="/login" />}
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
