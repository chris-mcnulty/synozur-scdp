import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { HelpChat } from "@/components/HelpChat";
import { WhatsNewModal } from "@/components/WhatsNewModal";
import { PlanStatusBanner } from "@/components/plan-status-banner";
import { useEmbed } from "@/hooks/use-embed";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { isEmbed } = useEmbed();

  if (isEmbed) {
    return (
      <div className="min-h-screen bg-background">
        <main className="p-4 lg:p-6">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <PlanStatusBanner />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-4 lg:p-6">
          {children}
        </main>
      </div>
      <HelpChat />
      <WhatsNewModal />
    </div>
  );
}
