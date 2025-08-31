import { Card, CardContent } from "@/components/ui/card";

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  iconColor: string;
  change?: string;
}

export function KPICard({ title, value, subtitle, icon, iconColor, change }: KPICardProps) {
  return (
    <Card data-testid={`kpi-${title.toLowerCase().replace(' ', '-')}`}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold" data-testid={`value-${title.toLowerCase().replace(' ', '-')}`}>
              {value}
            </p>
          </div>
          <div className={`w-12 h-12 ${iconColor} rounded-lg flex items-center justify-center`}>
            {icon}
          </div>
        </div>
        {(subtitle || change) && (
          <p className="text-xs text-muted-foreground mt-2">
            {subtitle || change}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
