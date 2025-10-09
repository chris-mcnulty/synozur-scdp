import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Lock, Mail } from "lucide-react";
import { SynozurLogo } from "@/components/icons/synozur-logo";

export default function Login() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSSOLoading, setIsSSOLoading] = useState(false);
  const { toast } = useToast();

  // Check SSO configuration status
  const { data: ssoStatus } = useQuery({
    queryKey: ["/api/auth/sso/status"],
    retry: false,
  });

  // Check for SSO callback parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('sessionId');
    const error = params.get('error');
    
    if (sessionId) {
      // Store session and redirect
      localStorage.setItem('sessionId', sessionId);
      // Force a page reload to reset the auth state
      window.location.href = "/";
    } else if (error) {
      let errorMessage = error.replace(/_/g, ' ');
      if (error === 'redirect_uri_mismatch') {
        errorMessage = 'Redirect URI mismatch. Please check Azure AD configuration.';
      } else if (error === 'invalid_client_credentials') {
        errorMessage = 'Invalid client credentials. Please check your Azure AD secret.';
      } else if (error === 'invalid_authorization_code') {
        errorMessage = 'Invalid or expired authorization code. Please try again.';
      }
      toast({
        title: "SSO Login Failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  }, [navigate, toast]);

  const loginMutation = useMutation({
    mutationFn: (credentials: { email: string; password: string }) => 
      apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(credentials),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/auth/user"], data);
      toast({
        title: "Welcome back!",
        description: `Logged in as ${data.name}`,
      });
      navigate("/");
    },
    onError: (error: any) => {
      toast({
        title: "Login failed",
        description: error.message || "Invalid email or password",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ email, password });
  };

  // TODO: Re-enable for multi-tenant version with proper demo accounts
  // const handleDemoLogin = () => {
  //   loginMutation.mutate({ 
  //     email: "chris.mcnulty@synozur.com", 
  //     password: "demo123" 
  //   });
  // };

  const isDevelopment = import.meta.env.MODE === 'development';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-secondary/5">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <SynozurLogo className="h-16 w-16" />
          </div>
          <CardTitle className="text-2xl text-center">
            Welcome to SCDP
            {isDevelopment && (
              <span className="block text-sm font-normal text-muted-foreground mt-1">
                Development
              </span>
            )}
          </CardTitle>
          <CardDescription className="text-center">
            Synozur Consulting Delivery Platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                  data-testid="input-email"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                  data-testid="input-password"
                />
              </div>
            </div>
            <Button 
              type="submit" 
              className="w-full" 
              disabled={loginMutation.isPending}
              data-testid="button-login"
            >
              {loginMutation.isPending ? "Signing in..." : "Sign In"}
            </Button>
          </form>
          
          {/* TODO: Re-enable demo login for multi-tenant version with proper demo accounts (see replit.md backlog) */}
          
          {(ssoStatus as any)?.configured === true && (
            <>
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or</span>
                </div>
              </div>
              
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={async () => {
                  setIsSSOLoading(true);
                  try {
                    const response = await apiRequest("/api/auth/sso/login");
                    if (response.authUrl) {
                      window.location.href = response.authUrl;
                    }
                  } catch (error) {
                    toast({
                      title: "SSO Error",
                      description: "Failed to initiate SSO login",
                      variant: "destructive",
                    });
                  } finally {
                    setIsSSOLoading(false);
                  }
                }}
                disabled={isSSOLoading}
                data-testid="button-sso-login"
              >
                <SynozurLogo className="mr-2 h-4 w-4" />
                {isSSOLoading ? "Redirecting..." : "Sign in with Microsoft"}
              </Button>
            </>
          )}
          
          <p className="text-center text-sm text-muted-foreground mt-4">
            {(ssoStatus as any)?.configured === true
              ? "Use your corporate Microsoft account to sign in"
              : "For production SSO, configure Azure AD environment variables"
            }
          </p>
        </CardContent>
      </Card>
    </div>
  );
}