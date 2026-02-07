import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { MarkdownViewer } from "@/components/MarkdownViewer";
import { Map } from "lucide-react";

export default function Roadmap() {
  const { data: content, isLoading } = useQuery<string>({
    queryKey: ["/docs/ROADMAP.md"],
    queryFn: async () => {
      const response = await fetch("/docs/ROADMAP.md");
      if (!response.ok) throw new Error("Failed to load roadmap");
      return response.text();
    },
  });

  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <Map className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Product Roadmap</h1>
            <p className="text-xl text-muted-foreground">
              Upcoming features and development priorities
            </p>
          </div>
        </div>

        <MarkdownViewer content={content} isLoading={isLoading} />
      </div>
    </Layout>
  );
}
