import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/layout";
import { MarkdownViewer } from "@/components/MarkdownViewer";
import { History } from "lucide-react";

export default function Changelog() {
  const { data: content, isLoading } = useQuery<string>({
    queryKey: ["/docs/CHANGELOG.md"],
    queryFn: async () => {
      const response = await fetch("/docs/CHANGELOG.md");
      if (!response.ok) throw new Error("Failed to load changelog");
      return response.text();
    },
  });

  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <History className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Changelog</h1>
            <p className="text-xl text-muted-foreground">
              Release history and version notes
            </p>
          </div>
        </div>

        <MarkdownViewer content={content} isLoading={isLoading} />
      </div>
    </Layout>
  );
}
