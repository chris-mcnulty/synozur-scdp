import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  iconColor: string;
  change?: string;
  className?: string;
  staggerIndex?: number;
}

export function KPICard({ title, value, subtitle, icon, iconColor, change, className, staggerIndex }: KPICardProps) {
  const staggerClass = staggerIndex !== undefined ? `stagger-${Math.min(staggerIndex + 1, 6)}` : "";

  return (
    <Card
      data-testid={`kpi-${title.toLowerCase().replace(' ', '-')}`}
      className={cn("nebula-card animate-fade-in-up", staggerClass, className)}
    >
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-light text-muted-foreground">{title}</p>
            <p
              className="text-2xl font-black"
              data-testid={`value-${title.toLowerCase().replace(' ', '-')}`}
            >
              {value}
            </p>
          </div>
          <div className={`w-12 h-12 ${iconColor} rounded-lg flex items-center justify-center`}>
            {icon}
          </div>
        </div>
        {(subtitle || change) && (
          <p className="text-xs font-light text-muted-foreground mt-2">
            {subtitle || change}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
