import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sparkles, Users, User as UserIcon } from "lucide-react";

type AdoptionResponse = {
  scope: "me" | "tenant";
  startDate: string;
  endDate: string;
  summary: {
    suggestionHours: number;
    manualHours: number;
    totalHours: number;
    suggestionCount: number;
    manualCount: number;
    totalEntries: number;
    suggestionPercentage: number;
  };
  perUser?: Array<{
    personId: string;
    personName: string;
    suggestionHours: number;
    manualHours: number;
    totalHours: number;
    suggestionCount: number;
    manualCount: number;
    suggestionPercentage: number;
  }>;
};

interface Props {
  canViewTenant: boolean;
}

export function CalendarSuggestionAdoptionCard({ canViewTenant }: Props) {
  const [scope, setScope] = useState<"me" | "tenant">("me");

  const { data, isLoading } = useQuery<AdoptionResponse>({
    queryKey: ["/api/reports/calendar-suggestion-adoption", { scope }],
    queryFn: async () => {
      const sessionId = localStorage.getItem("sessionId");
      const params = new URLSearchParams({ scope });
      const response = await fetch(
        `/api/reports/calendar-suggestion-adoption?${params.toString()}`,
        {
          credentials: "include",
          headers: sessionId ? { "X-Session-Id": sessionId } : {},
        },
      );
      if (!response.ok) throw new Error("Failed to fetch adoption stats");
      return response.json();
    },
  });

  const summary = data?.summary;

  return (
    <Card data-testid="card-calendar-adoption">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <CardTitle className="flex items-center text-base lg:text-lg">
            <Sparkles className="w-4 h-4 mr-2 text-primary" />
            Calendar Suggestion Adoption
          </CardTitle>
          <div className="flex items-center gap-2">
            {data && (
              <span className="text-xs text-muted-foreground">
                {data.startDate} → {data.endDate}
              </span>
            )}
            {canViewTenant && (
              <div className="flex rounded-md border overflow-hidden">
                <Button
                  type="button"
                  size="sm"
                  variant={scope === "me" ? "default" : "ghost"}
                  className="rounded-none h-7 px-2"
                  onClick={() => setScope("me")}
                  data-testid="button-adoption-scope-me"
                >
                  <UserIcon className="w-3 h-3 mr-1" />
                  Mine
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={scope === "tenant" ? "default" : "ghost"}
                  className="rounded-none h-7 px-2"
                  onClick={() => setScope("tenant")}
                  data-testid="button-adoption-scope-tenant"
                >
                  <Users className="w-3 h-3 mr-1" />
                  Organization
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading || !summary ? (
          <div className="text-sm text-muted-foreground">Loading adoption stats…</div>
        ) : summary.totalHours === 0 ? (
          <div className="text-sm text-muted-foreground" data-testid="text-adoption-empty">
            No time logged in this period yet.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">From calendar</div>
                <div
                  className="text-2xl font-semibold"
                  data-testid="text-adoption-suggestion-hours"
                >
                  {summary.suggestionHours.toFixed(2)}h
                </div>
                <div className="text-xs text-muted-foreground">
                  {summary.suggestionCount}{" "}
                  {summary.suggestionCount === 1 ? "entry" : "entries"}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Manual entry</div>
                <div
                  className="text-2xl font-semibold"
                  data-testid="text-adoption-manual-hours"
                >
                  {summary.manualHours.toFixed(2)}h
                </div>
                <div className="text-xs text-muted-foreground">
                  {summary.manualCount}{" "}
                  {summary.manualCount === 1 ? "entry" : "entries"}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">
                  % from calendar suggestions
                </div>
                <div
                  className="text-2xl font-semibold"
                  data-testid="text-adoption-percentage"
                >
                  {summary.suggestionPercentage.toFixed(1)}%
                </div>
                <Progress
                  value={summary.suggestionPercentage}
                  className="mt-2 h-2"
                />
              </div>
            </div>

            {scope === "tenant" && data?.perUser && data.perUser.length > 0 && (
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium">User</th>
                      <th className="px-3 py-2 font-medium text-right">From calendar</th>
                      <th className="px-3 py-2 font-medium text-right">Manual</th>
                      <th className="px-3 py-2 font-medium text-right">Total</th>
                      <th className="px-3 py-2 font-medium text-right">% calendar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.perUser.map((u) => (
                      <tr
                        key={u.personId}
                        className="border-t"
                        data-testid={`row-adoption-user-${u.personId}`}
                      >
                        <td className="px-3 py-2">{u.personName}</td>
                        <td className="px-3 py-2 text-right">
                          {u.suggestionHours.toFixed(2)}h
                        </td>
                        <td className="px-3 py-2 text-right">
                          {u.manualHours.toFixed(2)}h
                        </td>
                        <td className="px-3 py-2 text-right">
                          {u.totalHours.toFixed(2)}h
                        </td>
                        <td className="px-3 py-2 text-right">
                          {u.suggestionPercentage.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
