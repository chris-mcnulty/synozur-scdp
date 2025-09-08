import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/dashboard";
import Projects from "@/pages/projects";
import Estimates from "@/pages/estimates";
import EstimateDetail from "@/pages/estimate-detail";
import TimeTracking from "@/pages/time-tracking";
import Expenses from "@/pages/expenses";
import Billing from "@/pages/billing";
import RateManagement from "@/pages/rate-management";
import Staff from "@/pages/staff";
import Users from "@/pages/users";
import Login from "@/pages/login";
import NotFound from "@/pages/not-found";
import { useQuery } from "@tanstack/react-query";
import { Redirect } from "wouter";
import { useEffect, useState } from "react";
import { setSessionId } from "@/lib/queryClient";

function Router() {
  const [processingSession, setProcessingSession] = useState(true);
  
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
      <Route path="/billing">
        {user ? <Billing /> : <Redirect to="/login" />}
      </Route>
      <Route path="/rates">
        {user ? <RateManagement /> : <Redirect to="/login" />}
      </Route>
      <Route path="/staff">
        {user ? <Staff /> : <Redirect to="/login" />}
      </Route>
      <Route path="/users">
        {user ? <Users /> : <Redirect to="/login" />}
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
