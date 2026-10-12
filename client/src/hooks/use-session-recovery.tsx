import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ApiError, getSessionId, queryClient, setSessionId } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function useSessionRecovery() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isRecovering, setIsRecovering] = useState(false);
  const isRecoveringRef = useRef(false);
  // A valid session cannot fix an endpoint that repeatedly rejects it.
  // Bound automatic retries per query; manual retry remains available.
  const recoveredQueries = useRef(new Map<string, { sessionId: string; at: number }>());
  
  useEffect(() => {
    let disposed = false;
    const handleUnauthorized = (event: CustomEvent) => {
      if (!isRecoveringRef.current) {
        isRecoveringRef.current = true;
        setIsRecovering(true);
        handleSessionLoss();
      }
    };
    
    const handleSessionLoss = async () => {
      const savedSessionId = getSessionId();
      const isCurrentSession = () => !disposed && getSessionId() === savedSessionId;
      try {
        if (savedSessionId) {
          const fetchFn = (window as any)._originalFetch || window.fetch;
          const response = await fetchFn('/api/auth/user', {
            credentials: "include",
            headers: {
              'x-session-id': savedSessionId
            }
          });
          if (!isCurrentSession()) return;
          
          if (response.ok) {
            const userData = await response.json();
            if (!userData?.id) throw new Error("Invalid session validation response");
            if (!isCurrentSession()) return;
            setSessionId(savedSessionId);
            queryClient.setQueryData(["/api/auth/user"], userData);
            // Let the original 401 finish updating its query state first.
            await new Promise((resolve) => setTimeout(resolve, 0));
            if (!isCurrentSession()) return;
            await queryClient.refetchQueries({
              type: "active",
              predicate: (query) => {
                if (!(query.state.error instanceof ApiError) || query.state.error.status !== 401) return false;
                const previous = recoveredQueries.current.get(query.queryHash);
                if (previous?.sessionId === savedSessionId && Date.now() - previous.at < 30_000) return false;
                recoveredQueries.current.set(query.queryHash, { sessionId: savedSessionId, at: Date.now() });
                return true;
              },
            });
            return;
          }
          // Only an explicit auth rejection proves the saved session expired.
          if (response.status !== 401) throw new Error(`Session validation failed (${response.status})`);
        }

        if (!isCurrentSession()) return;
        await queryClient.cancelQueries();
        if (!isCurrentSession()) return;
        setSessionId(null);
        queryClient.clear();
        queryClient.setQueryData(["/api/auth/user"], null);

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
      } catch {
        if (isCurrentSession()) {
          toast({
            title: "Unable to verify session",
            description: "The service is temporarily unavailable. Your saved session has been kept; retry the failed request.",
            variant: "destructive",
          });
        }
      } finally {
        isRecoveringRef.current = false;
        if (!disposed) setIsRecovering(false);
      }
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
      disposed = true;
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
            credentials: "include",
            headers: {
              'x-session-id': sessionId
            }
          });
          
          if (getSessionId() === sessionId && response.status === 401) {
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
