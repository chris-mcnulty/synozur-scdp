import { useState, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Building2, User, Mail, Lock, ArrowRight, ArrowLeft, Check, Sparkles, Shield, BarChart3, Users } from "lucide-react";
import { SynozurLogo } from "@/components/icons/synozur-logo";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface ServicePlan {
  id: string;
  displayName: string;
  description: string;
  planType: string;
  maxUsers: number | null;
  maxProjects: number | null;
  aiEnabled: boolean;
  sharePointEnabled: boolean;
  ssoEnabled: boolean;
  customBrandingEnabled: boolean;
  plannerEnabled: boolean;
  trialDurationDays: number | null;
  monthlyPriceCents: number | null;
  annualPriceCents: number | null;
  billingCycle: string | null;
  isDefault: boolean;
}

export default function Signup() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(1);

  const [organizationName, setOrganizationName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [servicePlanId, setServicePlanId] = useState("");
  const [industry, setIndustry] = useState("");
  const [organizationSize, setOrganizationSize] = useState("");

  const { data: plans } = useQuery<ServicePlan[]>({
    queryKey: ["/api/auth/plans"],
  });

  const autoSlug = useMemo(() => {
    if (slugManuallyEdited) return slug;
    return organizationName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 50);
  }, [organizationName, slugManuallyEdited, slug]);

  const effectiveSlug = slugManuallyEdited ? slug : autoSlug;

  const signupMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (data) => {
      if (data.sessionId) {
        localStorage.setItem('sessionId', data.sessionId);
      }
      queryClient.setQueryData(["/api/auth/user"], data);
      toast({
        title: "Welcome to Constellation!",
        description: `Your organization "${organizationName}" has been created.`,
      });
      navigate("/");
    },
    onError: (error: any) => {
      toast({
        title: "Signup failed",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (password !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both passwords are the same.",
        variant: "destructive",
      });
      return;
    }

    signupMutation.mutate({
      organizationName,
      slug: effectiveSlug,
      adminName,
      adminEmail,
      password,
      servicePlanId: servicePlanId || undefined,
      industry: industry || undefined,
      organizationSize: organizationSize || undefined,
    });
  };

  const canProceedStep1 = organizationName.length >= 2 && effectiveSlug.length >= 2;
  const canProceedStep2 = adminName.length >= 2 && adminEmail.includes('@') && password.length >= 8 && password === confirmPassword;

  const formatPrice = (cents: number | null) => {
    if (!cents || cents === 0) return "Free";
    return `$${(cents / 100).toFixed(0)}`;
  };

  const selectedPlan = plans?.find(p => p.id === servicePlanId);

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
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
            Start Managing Your Consulting Practice
          </h2>

          <p className="text-muted-foreground mb-8 leading-relaxed">
            Set up your organization in minutes. Get access to project management, time tracking,
            invoicing, and financial reporting — everything your consulting firm needs.
          </p>

          <div className="space-y-4 mb-8">
            {[
              { icon: Sparkles, text: "AI-powered estimate narratives and reporting" },
              { icon: BarChart3, text: "Real-time profitability and margin analytics" },
              { icon: Users, text: "Resource management and capacity planning" },
              { icon: Shield, text: "Enterprise-grade security and tenant isolation" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <item.icon className="w-4 h-4 text-primary" />
                </div>
                <span className="text-sm">{item.text}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-border/50 pt-6">
            <p className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="text-primary hover:underline font-medium">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>

      <div className="lg:w-1/2 flex flex-col items-center justify-center p-8 bg-background min-h-screen lg:min-h-0">
        <div className="flex items-center gap-3 mb-8 lg:hidden">
          <SynozurLogo className="h-10 w-10" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Constellation</h1>
            <p className="text-xs text-muted-foreground">by Synozur</p>
          </div>
        </div>

        <Card className="w-full max-w-md border-0 shadow-none lg:border lg:shadow-sm">
          <CardHeader className="space-y-1">
            <div className="flex items-center justify-between mb-2">
              <div className="flex gap-1">
                {[1, 2, 3].map(s => (
                  <div key={s} className={`h-1.5 w-8 rounded-full transition-colors ${s <= step ? 'bg-primary' : 'bg-muted'}`} />
                ))}
              </div>
              <span className="text-xs text-muted-foreground">Step {step} of 3</span>
            </div>
            <CardTitle className="text-2xl text-center">
              {step === 1 && "Your Organization"}
              {step === 2 && "Your Account"}
              {step === 3 && "Choose a Plan"}
            </CardTitle>
            <CardDescription className="text-center">
              {step === 1 && "Tell us about your consulting firm"}
              {step === 2 && "Create your admin account"}
              {step === 3 && "Select the plan that fits your needs"}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {step === 1 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="orgName">Organization Name</Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="orgName"
                      placeholder="Acme Consulting"
                      value={organizationName}
                      onChange={(e) => setOrganizationName(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="slug">Organization URL</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">constellation.app/</span>
                    <Input
                      id="slug"
                      placeholder="acme-consulting"
                      value={effectiveSlug}
                      onChange={(e) => {
                        setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                        setSlugManuallyEdited(true);
                      }}
                      className="pl-[140px]"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Lowercase letters, numbers, and hyphens only</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="industry">Industry</Label>
                    <Select value={industry} onValueChange={setIndustry}>
                      <SelectTrigger id="industry">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="consulting">Consulting</SelectItem>
                        <SelectItem value="technology">Technology</SelectItem>
                        <SelectItem value="engineering">Engineering</SelectItem>
                        <SelectItem value="finance">Finance</SelectItem>
                        <SelectItem value="legal">Legal</SelectItem>
                        <SelectItem value="healthcare">Healthcare</SelectItem>
                        <SelectItem value="marketing">Marketing</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="orgSize">Team Size</Label>
                    <Select value={organizationSize} onValueChange={setOrganizationSize}>
                      <SelectTrigger id="orgSize">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1-5">1-5</SelectItem>
                        <SelectItem value="6-15">6-15</SelectItem>
                        <SelectItem value="16-50">16-50</SelectItem>
                        <SelectItem value="51-200">51-200</SelectItem>
                        <SelectItem value="200+">200+</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="adminName">Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="adminName"
                      placeholder="Jane Smith"
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adminEmail">Work Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="adminEmail"
                      type="email"
                      placeholder="jane@acme-consulting.com"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      className="pl-10"
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
                      placeholder="At least 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="Repeat your password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  {confirmPassword && password !== confirmPassword && (
                    <p className="text-xs text-destructive">Passwords don't match</p>
                  )}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-3">
                {plans?.map(plan => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setServicePlanId(plan.id)}
                    className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
                      servicePlanId === plan.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{plan.displayName}</span>
                        {plan.isDefault && <Badge variant="secondary" className="text-xs">Recommended</Badge>}
                      </div>
                      <div className="text-right">
                        {plan.planType === 'trial' ? (
                          <span className="text-sm font-medium text-green-600">{plan.trialDurationDays} days free</span>
                        ) : plan.monthlyPriceCents ? (
                          <span className="text-sm font-medium">{formatPrice(plan.monthlyPriceCents)}/mo</span>
                        ) : null}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{plan.description}</p>
                    <div className="flex flex-wrap gap-2">
                      {plan.maxUsers && <Badge variant="outline" className="text-xs">Up to {plan.maxUsers} users</Badge>}
                      {plan.aiEnabled && <Badge variant="outline" className="text-xs">AI</Badge>}
                      {plan.ssoEnabled && <Badge variant="outline" className="text-xs">SSO</Badge>}
                      {plan.plannerEnabled && <Badge variant="outline" className="text-xs">Planner</Badge>}
                      {plan.sharePointEnabled && <Badge variant="outline" className="text-xs">SharePoint</Badge>}
                    </div>
                    {servicePlanId === plan.id && (
                      <div className="mt-2 flex items-center gap-1 text-primary text-xs font-medium">
                        <Check className="w-3 h-3" /> Selected
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </CardContent>

          <CardFooter className="flex justify-between">
            {step > 1 ? (
              <Button variant="ghost" onClick={() => setStep(step - 1)}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Button>
            ) : (
              <Link href="/login">
                <Button variant="ghost">
                  <ArrowLeft className="w-4 h-4 mr-1" /> Sign In
                </Button>
              </Link>
            )}

            {step < 3 ? (
              <Button
                onClick={() => setStep(step + 1)}
                disabled={step === 1 ? !canProceedStep1 : !canProceedStep2}
              >
                Next <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={!servicePlanId || signupMutation.isPending}
              >
                {signupMutation.isPending ? "Creating..." : "Create Organization"}
              </Button>
            )}
          </CardFooter>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-4 lg:hidden">
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
