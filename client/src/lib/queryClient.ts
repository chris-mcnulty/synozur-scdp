import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Store session ID in memory
let sessionId: string | null = localStorage.getItem('sessionId');

export const setSessionId = (id: string | null) => {
  sessionId = id;
  if (id) {
    localStorage.setItem('sessionId', id);
  } else {
    localStorage.removeItem('sessionId');
  }
};

export const getSessionId = () => sessionId;

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let errorMessage = `Request failed (${res.status})`;
    const text = await res.text();
    const contentType = res.headers.get("content-type");
    
    if (contentType && contentType.includes("application/json")) {
      try {
        const errorData = JSON.parse(text);
        errorMessage = errorData?.message || errorData?.error || text || errorMessage;
      } catch {
        errorMessage = text || errorMessage;
      }
    } else {
      errorMessage = text || errorMessage;
    }
    
    throw new ApiError(errorMessage, res.status);
  }
}

export async function apiRequest(
  url: string,
  options?: RequestInit,
): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };
  
  if (sessionId) {
    headers['x-session-id'] = sessionId;
  }
  
  const res = await fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  
  // Handle responses with no content (like 204 status)
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return null;
  }
  
  const data = await res.json();
  
  // Store session ID if returned in login response
  if (data?.sessionId) {
    setSessionId(data.sessionId);
  }
  
  return data;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/") as string;
    
    const headers: Record<string, string> = {};
    if (sessionId) {
      headers['x-session-id'] = sessionId;
    }
    
    const res = await fetch(url, {
      headers,
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      setSessionId(null);
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
