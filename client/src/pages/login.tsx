import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Lock, Mail, BarChart3, Clock, FileText, Users } from "lucide-react";
import { SynozurLogo } from "@/components/icons/synozur-logo";

export default function Login() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSSOLoading, setIsSSOLoading] = useState(false);
  const { toast } = useToast();

  const { data: ssoStatus } = useQuery({
    queryKey: ["/api/auth/sso/status"],
    retry: false,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('sessionId');
    const error = params.get('error');
    
    if (sessionId) {
      localStorage.setItem('sessionId', sessionId);
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

  const isDevelopment = import.meta.env.MODE === 'development';

  const features = [
    { icon: Clock, title: "Time Tracking", description: "Track billable hours across projects and resources" },
    { icon: FileText, title: "Invoice Generation", description: "Automated invoicing with milestone and expense support" },
    { icon: BarChart3, title: "Financial Reports", description: "Real-time profitability and margin analytics" },
    { icon: Users, title: "Resource Management", description: "Capacity planning and allocation management" },
  ];

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left side - Information panel (hidden on mobile, shown on lg+) */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary/10 via-primary/5 to-background p-8 lg:p-12 flex-col justify-center">
        <div className="max-w-lg mx-auto lg:mx-0">
          <div className="flex items-center gap-3 mb-6">
            <SynozurLogo className="h-12 w-12" />
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Constellation</h1>
              <p className="text-sm text-muted-foreground">by Synozur</p>
            </div>
          </div>
          
          <h2 className="text-xl lg:text-2xl font-semibold mb-4 text-foreground">
            The Complete Platform for Consulting Business Operations
          </h2>
          
          <p className="text-muted-foreground mb-8 leading-relaxed">Constellation ("SCDP") streamlines your entire consulting practice — from project estimation and resource planning to time tracking, expense management, and automated invoicing. Built for consulting firms that need clarity on profitability and efficiency.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {features.map((feature, index) => (
              <div key={index} className="flex items-start gap-3 p-3 rounded-lg bg-background/50 border border-border/50">
                <feature.icon className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="font-medium text-sm">{feature.title}</h3>
                  <p className="text-xs text-muted-foreground">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-border/50 pt-6">
            <p className="text-sm text-muted-foreground">
              Interested in Constellation for your organization?{" "}
              <a 
                href="https://www.synozur.com/contact" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline font-medium"
              >
                Contact us
              </a>
              {" "}to learn about multi-tenant hosting options.
            </p>
          </div>
        </div>
      </div>
      {/* Right side - Login form */}
      <div className="lg:w-1/2 flex flex-col items-center justify-center p-8 bg-background min-h-screen lg:min-h-0">
        {/* Mobile header with logo */}
        <div className="flex items-center gap-3 mb-8 lg:hidden">
          <SynozurLogo className="h-10 w-10" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Constellation</h1>
            <p className="text-xs text-muted-foreground">by Synozur</p>
          </div>
        </div>
        
        <Card className="w-full max-w-md border-0 shadow-none lg:border lg:shadow-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center">
              Sign In
              {isDevelopment && (
                <span className="block text-sm font-normal text-muted-foreground mt-1">
                  Development Environment
                </span>
              )}
            </CardTitle>
            <CardDescription className="text-center">
              Enter your credentials to access your workspace
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form name="login-form" onSubmit={handleSubmit} className="space-y-4">
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
            
            {!isDevelopment && (ssoStatus as any)?.configured === true && (
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
            
            {!isDevelopment && (
              <p className="text-center text-sm text-muted-foreground mt-4">
                {(ssoStatus as any)?.configured === true
                  ? "Use your corporate Microsoft account to sign in"
                  : "For production SSO, configure Azure AD environment variables"
                }
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
