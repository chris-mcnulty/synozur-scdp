import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  role: string;
  isActive: boolean;
}

interface TenantsResponse {
  activeTenantId: string;
  tenants: TenantInfo[];
}

export function TenantSwitcher() {
  const { toast } = useToast();

  const { data, isLoading } = useQuery<TenantsResponse>({
    queryKey: ["/api/auth/tenants"],
    refetchInterval: 5 * 60 * 1000,
  });

  const switchMutation = useMutation({
    mutationFn: (tenantId: string) =>
      apiRequest("/api/auth/switch-tenant", {
        method: "POST",
        body: JSON.stringify({ tenantId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast({
        title: "Organization switched",
        description: "Your active organization has been changed. The page will refresh.",
      });
      setTimeout(() => window.location.reload(), 500);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to switch organization",
        variant: "destructive",
      });
    },
  });

  if (isLoading || !data || data.tenants.length <= 1) return null;

  const activeTenant = data.tenants.find((t) => t.isActive) || data.tenants[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 max-w-[200px]"
          data-testid="tenant-switcher"
        >
          <Building2 className="h-4 w-4 flex-shrink-0" />
          <span className="truncate text-xs">{activeTenant?.name}</span>
          <ChevronsUpDown className="h-3 w-3 flex-shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[220px]">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Switch Organization
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {data.tenants.map((tenant) => (
          <DropdownMenuItem
            key={tenant.id}
            onClick={() => {
              if (!tenant.isActive) {
                switchMutation.mutate(tenant.id);
              }
            }}
            className="flex items-center justify-between cursor-pointer"
            disabled={switchMutation.isPending}
          >
            <div className="flex flex-col min-w-0">
              <span className="truncate text-sm font-medium">{tenant.name}</span>
              <span className="text-xs text-muted-foreground capitalize">{tenant.role}</span>
            </div>
            {tenant.isActive && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
