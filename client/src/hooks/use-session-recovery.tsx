import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { queryClient, setSessionId } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function useSessionRecovery() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isRecovering, setIsRecovering] = useState(false);
  
  useEffect(() => {
    // Listen for 401 errors globally
    const handleUnauthorized = (event: CustomEvent) => {
      if (!isRecovering) {
        setIsRecovering(true);
        handleSessionLoss();
      }
    };
    
    const handleSessionLoss = async () => {
      // Clear cached data
      queryClient.clear();
      setSessionId(null);
      
      // Check if we have a stored session that might be recoverable
      const storedSessionId = localStorage.getItem('sessionId');
      if (storedSessionId) {
        try {
          // Try to validate the stored session
          const response = await fetch('/api/auth/user', {
            headers: {
              'X-Session-Id': storedSessionId
            }
          });
          
          if (response.ok) {
            // Session is still valid, restore it
            const userData = await response.json();
            setSessionId(storedSessionId);
            queryClient.setQueryData(["/api/auth/user"], userData);
            
            toast({
              title: "Session Restored",
              description: "Your session has been recovered successfully.",
            });
            
            // Reload to refresh the app state
            window.location.reload();
            return;
          }
        } catch (error) {
          console.error("Failed to recover session:", error);
        }
      }
      
      // Session is not recoverable, redirect to login
      toast({
        title: "Session Expired",
        description: "Please log in again to continue.",
        variant: "default",
      });
      
      // Save the current location for redirect after login
      const currentPath = window.location.pathname;
      if (currentPath !== '/' && currentPath !== '/login') {
        sessionStorage.setItem('redirectAfterLogin', currentPath);
      }
      
      setLocation('/login');
      setIsRecovering(false);
    };
    
    // Custom event for 401 errors
    window.addEventListener('unauthorized' as any, handleUnauthorized);
    
    // Intercept fetch to detect 401s
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      
      if (response.status === 401 && !window.location.pathname.includes('/login')) {
        window.dispatchEvent(new CustomEvent('unauthorized'));
      }
      
      return response;
    };
    
    return () => {
      window.removeEventListener('unauthorized' as any, handleUnauthorized);
      window.fetch = originalFetch;
    };
  }, [isRecovering, setLocation, toast]);
  
  // Periodic session validation (every 5 minutes)
  useEffect(() => {
    const validateSession = async () => {
      const sessionId = localStorage.getItem('sessionId');
      if (sessionId && !window.location.pathname.includes('/login')) {
        try {
          const response = await fetch('/api/auth/user', {
            headers: {
              'X-Session-Id': sessionId
            }
          });
          
          if (!response.ok && response.status === 401) {
            window.dispatchEvent(new CustomEvent('unauthorized'));
          }
        } catch (error) {
          console.error("Session validation error:", error);
        }
      }
    };
    
    // Validate session every 5 minutes
    const interval = setInterval(validateSession, 5 * 60 * 1000);
    
    // Also validate on visibility change (when tab becomes active)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        validateSession();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
  
  return { isRecovering };
}