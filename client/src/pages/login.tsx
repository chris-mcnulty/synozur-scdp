import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Lock,
  Mail,
  BarChart3,
  Clock,
  FileText,
  Users,
  Calculator,
  Receipt,
  Brain,
  AlertTriangle,
  Blocks,
  ArrowRight,
  ChevronRight,
  Star,
  Shield,
  Zap,
  Cloud,
} from "lucide-react";
import { SynozurLogo } from "@/components/icons/synozur-logo";
import heroImage from "@assets/AdobeStock_244105520_1771187192557.jpeg";
import secondaryImage from "@assets/AdobeStock_189127184_1771187213585.jpeg";

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

  const primaryFeatures = [
    {
      icon: Calculator,
      title: "Project Estimates",
      description: "Build detailed, multi-phase estimates with hierarchical rate precedence, Excel/CSV import/export, and AI-generated narratives.",
      highlight: true,
      color: "from-violet-500 to-purple-600",
      lightColor: "bg-violet-500/10",
      iconColor: "text-violet-400",
    },
    {
      icon: Receipt,
      title: "Expense Management",
      description: "Complete expense lifecycle with approval workflows, automated per diem calculations, and contractor reimbursement invoicing.",
      highlight: false,
      color: "from-emerald-500 to-teal-600",
      lightColor: "bg-emerald-500/10",
      iconColor: "text-emerald-400",
    },
    {
      icon: Blocks,
      title: "Microsoft 365 Integration",
      description: "Deep integration with SharePoint, Outlook, and Microsoft Planner for bidirectional task synchronization.",
      highlight: false,
      color: "from-blue-500 to-cyan-600",
      lightColor: "bg-blue-500/10",
      iconColor: "text-blue-400",
    },
    {
      icon: Brain,
      title: "AI-Powered Intelligence",
      description: "Leverage AI for estimate narratives, invoice descriptions, report queries, and data-driven insights.",
      highlight: false,
      color: "from-amber-500 to-orange-600",
      lightColor: "bg-amber-500/10",
      iconColor: "text-amber-400",
    },
    {
      icon: BarChart3,
      title: "Status Reports & Financials",
      description: "Revenue, cost, profit, and margin analysis by client and project with KPI dashboards and health scoring.",
      highlight: false,
      color: "from-rose-500 to-pink-600",
      lightColor: "bg-rose-500/10",
      iconColor: "text-rose-400",
    },
    {
      icon: AlertTriangle,
      title: "Risk & Issue Management",
      description: "Track risks, actions, issues, decisions, and dependencies (RAIDD) at portfolio and project levels.",
      highlight: false,
      color: "from-sky-500 to-indigo-600",
      lightColor: "bg-sky-500/10",
      iconColor: "text-sky-400",
    },
  ];

  const quickFeatures = [
    { icon: Clock, title: "Time Tracking", description: "Track billable hours across projects and resources" },
    { icon: FileText, title: "Invoice Generation", description: "Automated invoicing with milestone and expense support" },
    { icon: BarChart3, title: "Financial Reports", description: "Real-time profitability and margin analytics" },
    { icon: Users, title: "Resource Management", description: "Capacity planning and allocation management" },
  ];

  const capabilities = [
    { icon: Shield, title: "Multi-Tenant Isolation", description: "Complete data isolation with role-based access" },
    { icon: Users, title: "Resource Planning", description: "Capacity planning with conflict detection" },
    { icon: Cloud, title: "Cloud-Native", description: "Azure AD SSO and enterprise security" },
    { icon: Zap, title: "Automated Workflows", description: "Scheduled jobs and email reminders" },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Top Navigation Bar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-950/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <SynozurLogo className="h-8 w-8" />
            <div>
              <span className="text-xl font-bold tracking-tight">Constellation</span>
              <span className="text-xs text-gray-500 ml-2">by Synozur</span>
            </div>
          </div>
          <a href="#sign-in" className="text-sm text-gray-400 hover:text-white transition-colors">
            Sign In <ArrowRight className="inline w-3.5 h-3.5 ml-1" />
          </a>
        </div>
      </nav>

      {/* Hero Section with Star Trails */}
      <section className="relative pt-16 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${heroImage})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-gray-950/70 via-gray-950/50 to-gray-950" />
        <div className="relative z-10 max-w-7xl mx-auto px-6 py-20 lg:py-32">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left: Hero Content */}
            <div>
              <div className="flex items-center gap-2 mb-5">
                <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                <span className="text-amber-300/90 text-xs font-semibold tracking-widest uppercase">
                  Consulting Delivery Platform
                </span>
              </div>
              <h1 className="text-4xl lg:text-5xl xl:text-6xl font-bold leading-tight mb-6">
                Navigate Your Projects
                <br />
                <span className="bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent">
                  Like the Stars
                </span>
              </h1>
              <p className="text-base lg:text-lg text-gray-300 max-w-lg mb-8 leading-relaxed">
                Constellation brings clarity to consulting delivery. From detailed
                project estimates to automated invoicing, manage your entire
                practice with precision and intelligence.
              </p>
              <div className="grid grid-cols-2 gap-3 mb-8">
                {quickFeatures.map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <div key={feature.title} className="flex items-start gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
                      <Icon className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <h3 className="font-medium text-xs text-white">{feature.title}</h3>
                        <p className="text-[11px] text-gray-400 leading-snug">{feature.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-gray-500">
                New to Constellation?{" "}
                <a href="/signup" className="text-blue-400 hover:underline font-medium">
                  Create an organization
                </a>{" "}
                and start your free trial today.
              </p>
            </div>

            {/* Right: Sign In Card */}
            <div id="sign-in" className="flex justify-center lg:justify-end">
              <Card className="w-full max-w-md bg-gray-900/90 backdrop-blur-xl border-white/10 shadow-2xl shadow-black/40">
                <CardHeader className="space-y-1 pb-4">
                  <CardTitle className="text-2xl text-center text-white">
                    Sign In
                    {isDevelopment && (
                      <span className="block text-sm font-normal text-gray-400 mt-1">
                        Development Environment
                      </span>
                    )}
                  </CardTitle>
                  <CardDescription className="text-center text-gray-400">
                    Enter your credentials to access your workspace
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form name="login-form" onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-gray-300">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-2.5 h-5 w-5 text-gray-500" />
                        <Input
                          id="email"
                          type="email"
                          placeholder="you@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="pl-10 bg-gray-800/50 border-white/10 text-white placeholder:text-gray-500 focus:border-blue-500"
                          required
                          data-testid="input-email"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password" className="text-gray-300">Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-2.5 h-5 w-5 text-gray-500" />
                        <Input
                          id="password"
                          type="password"
                          placeholder="Enter your password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="pl-10 bg-gray-800/50 border-white/10 text-white placeholder:text-gray-500 focus:border-blue-500"
                          required
                          data-testid="input-password"
                        />
                      </div>
                    </div>
                    <Button 
                      type="submit" 
                      className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold"
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
                          <span className="w-full border-t border-white/10" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-gray-900 px-2 text-gray-500">Or</span>
                        </div>
                      </div>
                      
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full bg-gray-800 hover:bg-gray-700 text-white border border-white/10"
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
                    <p className="text-center text-sm text-gray-500 mt-4">
                      {(ssoStatus as any)?.configured === true
                        ? "Use your corporate Microsoft account to sign in"
                        : "For production SSO, configure Azure AD environment variables"
                      }
                    </p>
                  )}

                  <div className="mt-4 pt-4 border-t border-white/10 text-center">
                    <p className="text-sm text-gray-500">
                      Don't have an account?{" "}
                      <a href="/signup" className="text-blue-400 hover:underline font-medium">
                        Create your organization
                      </a>
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Cards Section */}
      <section className="relative py-20 bg-gray-950">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
              Everything You Need to Deliver Excellence
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Purpose-built for consulting firms, Constellation covers every
              aspect of project delivery and financial management.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {primaryFeatures.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className={`group relative rounded-xl border p-6 transition-all duration-300 hover:-translate-y-1 ${
                    feature.highlight
                      ? "border-violet-500/30 bg-gradient-to-br from-violet-950/40 to-purple-950/20 hover:shadow-xl hover:shadow-violet-500/10"
                      : "border-white/10 bg-gray-900/50 hover:bg-gray-900/80 hover:shadow-xl hover:shadow-black/20"
                  }`}
                >
                  {feature.highlight && (
                    <div className="absolute -top-3 left-6">
                      <span className="bg-gradient-to-r from-violet-600 to-purple-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                        Core Feature
                      </span>
                    </div>
                  )}
                  <div className={`w-12 h-12 rounded-xl ${feature.lightColor} flex items-center justify-center mb-4`}>
                    <Icon className={`w-6 h-6 ${feature.iconColor}`} />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-gray-400 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Estimates Spotlight */}
      <section className="relative py-20 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-10"
          style={{ backgroundImage: `url(${secondaryImage})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-gray-950 via-gray-950/95 to-gray-950/90" />
        <div className="relative z-10 max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Calculator className="w-5 h-5 text-violet-400" />
                <span className="text-violet-400 text-xs font-semibold tracking-widest uppercase">
                  Spotlight
                </span>
              </div>
              <h2 className="text-3xl font-bold text-white mb-4">
                Project Estimates That Win Work
              </h2>
              <p className="text-gray-400 text-base leading-relaxed mb-6">
                Constellation's estimation engine is purpose-built for
                consulting firms. Create detailed, multi-phase estimates with
                sophisticated rate hierarchies, resource planning, and
                AI-powered narrative generation.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  "Multi-phase estimates with epics, stages, and line items",
                  "Hierarchical rate precedence (Project > User > Organization)",
                  "Excel/CSV import/export with template support",
                  "AI-generated narratives and text export",
                  "Status-based locking and approval workflows",
                  "T&M, Fixed Price, and Retainer estimate types",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <ChevronRight className="w-4 h-4 text-violet-400 mt-1 flex-shrink-0" />
                    <span className="text-sm text-gray-300">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative">
              <div className="rounded-2xl overflow-hidden shadow-2xl shadow-black/40 border border-white/10">
                <img
                  src={secondaryImage}
                  alt="Constellation platform capabilities"
                  className="w-full h-auto object-cover"
                />
              </div>
              <div className="absolute -bottom-4 -left-4 bg-gray-900 border border-white/10 rounded-xl p-4 shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <Zap className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">AI-Powered</p>
                    <p className="text-xs text-gray-400">Smart narratives & insights</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Platform Capabilities */}
      <section className="py-20 bg-gray-950/80">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-white mb-3">
              Built for Enterprise Consulting
            </h2>
            <p className="text-gray-400 max-w-xl mx-auto">
              Security, scalability, and automation designed for professional
              services organizations.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {capabilities.map((cap) => {
              const Icon = cap.icon;
              return (
                <div
                  key={cap.title}
                  className="text-center p-6 rounded-xl bg-gray-900/50 border border-white/10 hover:border-blue-500/30 transition-colors"
                >
                  <div className="w-12 h-12 mx-auto rounded-xl bg-blue-500/10 flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6 text-blue-400" />
                  </div>
                  <h3 className="font-semibold text-white mb-2">{cap.title}</h3>
                  <p className="text-sm text-gray-400">{cap.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <SynozurLogo className="h-6 w-6" />
            <span className="text-sm text-gray-500">Constellation by Synozur</span>
          </div>
          <nav className="flex items-center gap-4 text-xs text-gray-500">
            <a href="https://www.synozur.com" target="_blank" rel="noopener noreferrer" className="hover:text-gray-300 transition-colors">About Synozur</a>
            <span className="text-gray-700">|</span>
            <a href="https://www.synozur.com/terms" target="_blank" rel="noopener noreferrer" className="hover:text-gray-300 transition-colors">Terms</a>
            <span className="text-gray-700">|</span>
            <a href="https://synozur.com/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-gray-300 transition-colors">Privacy</a>
            <span className="text-gray-700">|</span>
            <a href="https://synozur.com/blog" target="_blank" rel="noopener noreferrer" className="hover:text-gray-300 transition-colors">Blog</a>
            <span className="text-gray-700">|</span>
            <a href="https://synozur.com/contact" target="_blank" rel="noopener noreferrer" className="hover:text-gray-300 transition-colors">Contact</a>
          </nav>
          <p className="text-xs text-gray-600">
            &copy; {new Date().getFullYear()} The Synozur Alliance LLC. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
