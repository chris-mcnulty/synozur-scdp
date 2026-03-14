import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

export default function EmbedAuthPopup() {
  const [status, setStatus] = useState("Authenticating...");

  useEffect(() => {
    const runAuth = async () => {
      try {
        const teamsJs = await import("@microsoft/teams-js");
        await teamsJs.app.initialize();

        const token = await teamsJs.authentication.getAuthToken();
        teamsJs.authentication.notifySuccess(token);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setStatus(`Authentication failed: ${msg}`);
        try {
          const teamsJs = await import("@microsoft/teams-js");
          teamsJs.authentication.notifyFailure(msg);
        } catch {
          setStatus("Authentication failed. Please close this window and try again.");
        }
      }
    };
    runAuth();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted-foreground">{status}</p>
      </div>
    </div>
  );
}
