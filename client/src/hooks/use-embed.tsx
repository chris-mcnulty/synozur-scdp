import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { setSessionId } from "@/lib/queryClient";

type TeamsTheme = "light" | "dark" | "contrast";

interface EmbedContextValue {
  isEmbed: boolean;
  isTeams: boolean;
  isReadonly: boolean;
  theme: TeamsTheme;
  isAuthenticating: boolean;
  authError: string | null;
  retryAuth: () => void;
}

const EmbedContext = createContext<EmbedContextValue>({
  isEmbed: false,
  isTeams: false,
  isReadonly: false,
  theme: "light",
  isAuthenticating: false,
  authError: null,
  retryAuth: () => {},
});

export const useEmbed = () => useContext(EmbedContext);

interface EmbedProviderProps {
  children: React.ReactNode;
  tab?: string;
  theme?: string;
  readonly?: boolean;
}

export function EmbedProvider({ children, theme: themeProp, readonly: readonlyProp }: EmbedProviderProps) {
  const [isTeams, setIsTeams] = useState(false);
  const [teamsTheme, setTeamsTheme] = useState<TeamsTheme>(
    (themeProp as TeamsTheme) || "light"
  );
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const initTeamsAuth = useCallback(async () => {
    setIsAuthenticating(true);
    setAuthError(null);

    try {
      const teamsJs = await import("@microsoft/teams-js");
      await teamsJs.app.initialize();
      setIsTeams(true);

      const context = await teamsJs.app.getContext();
      if (context.app.theme) {
        const mapped = context.app.theme === "dark" ? "dark" : context.app.theme === "contrast" ? "contrast" : "light";
        setTeamsTheme(mapped);
      }

      teamsJs.app.registerOnThemeChangeHandler((newTheme: string) => {
        const mapped = newTheme === "dark" ? "dark" : newTheme === "contrast" ? "contrast" : "light";
        setTeamsTheme(mapped);
      });

      const exchangeToken = async (token: string) => {
        const response = await fetch("/api/auth/teams-sso", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || "SSO authentication failed");
        }
        const data = await response.json();
        if (data.sessionId) {
          setSessionId(data.sessionId);
          localStorage.setItem("sessionId", data.sessionId);
        }
      };

      try {
        const token = await teamsJs.authentication.getAuthToken();
        await exchangeToken(token);
        setIsAuthenticating(false);
      } catch (silentErr: any) {
        console.warn("[TEAMS-SSO] Silent token failed, trying interactive:", silentErr.message);
        try {
          const result = await teamsJs.authentication.authenticate({
            url: `${window.location.origin}/api/auth/login?embed=true`,
            width: 600,
            height: 535,
          });
          if (result) {
            await exchangeToken(result);
          }
          setIsAuthenticating(false);
        } catch (interactiveErr: any) {
          console.error("[TEAMS-SSO] Interactive auth also failed:", interactiveErr);
          setAuthError(interactiveErr.message || "Failed to authenticate with Teams");
          setIsAuthenticating(false);
        }
      }
    } catch {
      setIsTeams(false);
      const existingSession = localStorage.getItem("sessionId");
      if (existingSession) {
        setIsAuthenticating(false);
      } else {
        setAuthError("Sign in required to view this content.");
        setIsAuthenticating(false);
      }
    }
  }, []);

  useEffect(() => {
    initTeamsAuth();
  }, [initTeamsAuth]);

  return (
    <EmbedContext.Provider
      value={{
        isEmbed: true,
        isTeams,
        isReadonly: readonlyProp ?? false,
        theme: teamsTheme,
        isAuthenticating,
        authError,
        retryAuth: initTeamsAuth,
      }}
    >
      {children}
    </EmbedContext.Provider>
  );
}
