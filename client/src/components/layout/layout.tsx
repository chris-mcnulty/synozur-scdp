import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { HelpChat } from "@/components/HelpChat";
import { WhatsNewModal } from "@/components/WhatsNewModal";
import { PlanStatusBanner } from "@/components/plan-status-banner";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
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
