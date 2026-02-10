import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { queryClient, setSessionId } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function useSessionRecovery() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isRecovering, setIsRecovering] = useState(false);
  const isRecoveringRef = useRef(false);
  
  useEffect(() => {
    const handleUnauthorized = (event: CustomEvent) => {
      if (!isRecoveringRef.current) {
        isRecoveringRef.current = true;
        setIsRecovering(true);
        handleSessionLoss();
      }
    };
    
    const handleSessionLoss = async () => {
      const savedSessionId = localStorage.getItem('sessionId');

      queryClient.clear();

      if (savedSessionId) {
        try {
          const fetchFn = (window as any)._originalFetch || window.fetch;
          const response = await fetchFn('/api/auth/user', {
            headers: {
              'x-session-id': savedSessionId
            }
          });
          
          if (response.ok) {
            const userData = await response.json();
            setSessionId(savedSessionId);
            queryClient.setQueryData(["/api/auth/user"], userData);
            
            toast({
              title: "Session Restored",
              description: "Your session has been recovered successfully.",
            });
            
            isRecoveringRef.current = false;
            setIsRecovering(false);
            window.location.reload();
            return;
          }
        } catch (error) {
          console.error("Failed to recover session:", error);
        }
      }

      setSessionId(null);

      toast({
        title: "Session Expired",
        description: "Please log in again to continue.",
        variant: "default",
      });
      
      const currentPath = window.location.pathname;
      if (currentPath !== '/' && currentPath !== '/login') {
        sessionStorage.setItem('redirectAfterLogin', currentPath);
      }
      
      setLocation('/login');
      isRecoveringRef.current = false;
      setIsRecovering(false);
    };
    
    window.addEventListener('unauthorized' as any, handleUnauthorized);
    
    const originalFetch = window.fetch;
    (window as any)._originalFetch = originalFetch;

    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      
      if (response.status === 401 && !window.location.pathname.includes('/login')) {
        const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request)?.url || '';
        if (!url.includes('/api/auth/user')) {
          window.dispatchEvent(new CustomEvent('unauthorized'));
        }
      }
      
      return response;
    };
    
    return () => {
      window.removeEventListener('unauthorized' as any, handleUnauthorized);
      window.fetch = originalFetch;
      delete (window as any)._originalFetch;
    };
  }, [setLocation, toast]);
  
  useEffect(() => {
    const validateSession = async () => {
      const sessionId = localStorage.getItem('sessionId');
      if (sessionId && !window.location.pathname.includes('/login')) {
        try {
          const fetchFn = (window as any)._originalFetch || window.fetch;
          const response = await fetchFn('/api/auth/user', {
            headers: {
              'x-session-id': sessionId
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
    
    const interval = setInterval(validateSession, 5 * 60 * 1000);
    
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
