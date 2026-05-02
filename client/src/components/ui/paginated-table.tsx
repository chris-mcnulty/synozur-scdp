import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

export interface PaginationState {
  page: number;
  pageSize: number;
}

export interface PaginationMeta {
  total: number;
  hasMore: boolean;
  limit: number;
  offset: number;
}

interface PaginationControlsProps {
  pagination: PaginationState;
  meta: PaginationMeta | null | undefined;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
  isLoading?: boolean;
}

export function PaginationControls({
  pagination,
  meta,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100, 200],
  isLoading = false,
}: PaginationControlsProps) {
  const total = meta?.total ?? 0;
  const totalPages = total > 0 ? Math.ceil(total / pagination.pageSize) : 1;
  const currentPage = pagination.page;
  const start = total > 0 ? pagination.page * pagination.pageSize + 1 : 0;
  const end = Math.min((pagination.page + 1) * pagination.pageSize, total);

  return (
    <div className="flex items-center justify-between gap-4 px-2 py-3 border-t">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Rows per page:</span>
        <Select
          value={String(pagination.pageSize)}
          onValueChange={(v) => onPageSizeChange(Number(v))}
          disabled={isLoading}
        >
          <SelectTrigger className="h-8 w-[70px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map(size => (
              <SelectItem key={size} value={String(size)}>{size}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="text-sm text-muted-foreground">
        {total > 0 ? `${start}–${end} of ${total.toLocaleString()}` : "0 results"}
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(0)}
          disabled={currentPage === 0 || isLoading}
          title="First page"
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 0 || isLoading}
          title="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm px-2">
          Page {currentPage + 1} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!meta?.hasMore || isLoading}
          title="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(totalPages - 1)}
          disabled={!meta?.hasMore || isLoading}
          title="Last page"
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function usePagination(defaultPageSize = 50) {
  return {
    defaultState: { page: 0, pageSize: defaultPageSize } as PaginationState,
  };
}
