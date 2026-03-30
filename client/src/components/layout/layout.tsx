import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { HelpChat } from "@/components/HelpChat";
import { WhatsNewModal } from "@/components/WhatsNewModal";
import { PlanStatusBanner } from "@/components/plan-status-banner";
import { Aurora } from "@/components/aurora";
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
    <div className="relative min-h-screen bg-background">
      <Aurora intensity="low" className="fixed inset-0 z-0" />
      <div className="relative z-10">
        <Header />
        <PlanStatusBanner />
        <div className="flex">
          <Sidebar />
          <main className="flex-1 p-4 lg:p-6">
            {children}
          </main>
        </div>
      </div>
      <HelpChat />
      <WhatsNewModal />
    </div>
  );
}
