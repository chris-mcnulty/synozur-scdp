import { useEffect } from "react";

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
      <main className="p-4 lg:p-6">
        {children}
      </main>
    </div>
  );
}
