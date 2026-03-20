import { useEffect } from "react";
import { EmbedNavDrawer } from "@/components/layout/embed-nav-drawer";

interface EmbedLayoutProps {
  children: React.ReactNode;
  theme?: "light" | "dark" | "contrast";
}

export function EmbedLayout({ children, theme }: EmbedLayoutProps) {
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    if (theme === "dark" || theme === "contrast") {
      root.classList.add("dark");
    } else {
      root.classList.add("light");
    }
  }, [theme]);

  return (
    <div className="min-h-screen bg-background">
      <EmbedNavDrawer />
      <main className="pt-4 pb-6 px-4 lg:px-6">
        {children}
      </main>
    </div>
  );
}
