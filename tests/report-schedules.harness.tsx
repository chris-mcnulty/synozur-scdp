// Browser-only component harness. Never imported by the application build.
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "../client/src/lib/queryClient";
import { ReportSchedules, AdminReportSchedules } from "../client/src/components/project/report-schedules";
import { Toaster } from "../client/src/components/ui/toaster";
import "../client/src/index.css";

queryClient.setDefaultOptions({ queries: { retry: false, staleTime: 0 } });
function Harness() {
  const [projectId, setProjectId] = useState("synthetic-project");
  useEffect(() => {
    const changeProject = (event: Event) => setProjectId((event as CustomEvent<string>).detail);
    window.addEventListener("report-test-project", changeProject);
    return () => window.removeEventListener("report-test-project", changeProject);
  }, []);
  return <QueryClientProvider client={queryClient}>
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Scheduled report delivery — synthetic test project</h1>
      <ReportSchedules projectId={projectId} />
      <AdminReportSchedules />
    </main>
    <Toaster />
  </QueryClientProvider>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
