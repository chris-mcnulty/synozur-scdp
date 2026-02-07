import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface MarkdownViewerProps {
  content: string | null | undefined;
  isLoading?: boolean;
  className?: string;
}

export function MarkdownViewer({ content, isLoading, className }: MarkdownViewerProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-6 w-1/2 mt-4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!content) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-center py-8">
            Documentation content could not be loaded.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardContent className="pt-6">
        <div className="prose prose-sm max-w-none dark:prose-invert
          prose-headings:font-semibold prose-headings:tracking-tight
          prose-h1:text-2xl prose-h1:border-b prose-h1:pb-2 prose-h1:mb-4
          prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-3
          prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-2
          prose-h4:text-base prose-h4:mt-4 prose-h4:mb-1
          prose-p:text-muted-foreground prose-p:leading-relaxed
          prose-li:text-muted-foreground
          prose-strong:text-foreground prose-strong:font-semibold
          prose-a:text-primary prose-a:no-underline hover:prose-a:underline
          prose-hr:my-6 prose-hr:border-border
          prose-table:border-collapse prose-table:w-full
          prose-th:border prose-th:border-border prose-th:px-3 prose-th:py-2 prose-th:bg-muted/50 prose-th:text-left prose-th:text-sm prose-th:font-semibold
          prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-2 prose-td:text-sm
          prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono
          prose-pre:bg-muted prose-pre:rounded-lg prose-pre:p-4
          prose-blockquote:border-l-4 prose-blockquote:border-primary/30 prose-blockquote:pl-4 prose-blockquote:italic
          prose-ul:list-disc prose-ol:list-decimal
          prose-img:rounded-lg prose-img:shadow-md
        ">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
        </div>
      </CardContent>
    </Card>
  );
}
