import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Search, FolderOpen, User as UserIcon, Clock, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

interface SearchResult {
  query: string;
  projects: Array<{ id: string; name: string; code?: string | null; status?: string | null; clientName?: string | null }>;
  users: Array<{ id: string; name: string; email: string; role?: string | null }>;
  timeEntries: Array<{ id: string; date: string; hours: string | number; description?: string | null; projectId?: string | null; projectName?: string | null; personName?: string | null }>;
  totals?: { projects: number; users: number; timeEntries: number };
}

export function GlobalSearch() {
  const [, navigate] = useLocation();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(t);
  }, [term]);

  const enabled = debounced.length >= 2;
  const { data, isFetching } = useQuery<SearchResult>({
    queryKey: ["/api/search", debounced],
    queryFn: async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(debounced)}&limit=5`, {
        credentials: "include",
        headers: localStorage.getItem("sessionId")
          ? { "X-Session-Id": localStorage.getItem("sessionId")! }
          : {},
      });
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled,
    staleTime: 15_000,
  });

  // Keyboard shortcut: Ctrl/Cmd+K to focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const close = () => setOpen(false);

  const goTo = (path: string) => {
    close();
    setTerm("");
    navigate(path);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      close();
    } else if (e.key === "Enter" && term.trim().length >= 2) {
      goTo(`/projects?search=${encodeURIComponent(term.trim())}`);
    }
  };

  const projects = data?.projects ?? [];
  const users = data?.users ?? [];
  const timeEntries = data?.timeEntries ?? [];
  const hasResults = projects.length > 0 || users.length > 0 || timeEntries.length > 0;
  const showPanel = open && enabled;

  return (
    <div className="relative w-full max-w-md hidden md:block" data-testid="global-search">
      <Popover open={showPanel} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={inputRef}
              type="search"
              value={term}
              placeholder="Search projects, users, time entries…  (Ctrl+K)"
              className="pl-9 pr-3 h-9"
              onChange={(e) => {
                setTerm(e.target.value);
                setOpen(true);
              }}
              onFocus={() => term.trim().length >= 2 && setOpen(true)}
              onKeyDown={handleKeyDown}
              data-testid="input-global-search"
            />
          </div>
        </PopoverTrigger>
        <PopoverContent
          className="w-[28rem] p-0"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="max-h-[28rem] overflow-y-auto">
            {isFetching && !data && (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Searching…
              </div>
            )}

            {!isFetching && data && !hasResults && (
              <div className="py-6 text-center text-sm text-muted-foreground" data-testid="text-no-results">
                No results for "{debounced}"
              </div>
            )}

            {projects.length > 0 && (
              <div className="py-2">
                <div className="flex items-center justify-between px-3 pb-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Projects
                  </span>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => goTo(`/projects?search=${encodeURIComponent(debounced)}`)}
                    data-testid="link-view-all-projects"
                  >
                    View all{data?.totals?.projects ? ` (${data.totals.projects})` : ""}
                  </button>
                </div>
                {projects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full flex items-start gap-2 px-3 py-2 text-left hover-elevate active-elevate-2 rounded-sm"
                    onClick={() => goTo(`/projects/${p.id}`)}
                    data-testid={`result-project-${p.id}`}
                  >
                    <FolderOpen className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[p.code, p.clientName].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    {p.status && (
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {p.status}
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            )}

            {users.length > 0 && (
              <div className="py-2 border-t border-border">
                <div className="flex items-center justify-between px-3 pb-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Users
                  </span>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => goTo(`/users?search=${encodeURIComponent(debounced)}`)}
                    data-testid="link-view-all-users"
                  >
                    View all{data?.totals?.users ? ` (${data.totals.users})` : ""}
                  </button>
                </div>
                {users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className="w-full flex items-start gap-2 px-3 py-2 text-left hover-elevate active-elevate-2 rounded-sm"
                    onClick={() => goTo(`/users?search=${encodeURIComponent(u.email || u.name)}`)}
                    data-testid={`result-user-${u.id}`}
                  >
                    <UserIcon className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{u.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                    </div>
                    {u.role && (
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {u.role}
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            )}

            {timeEntries.length > 0 && (
              <div className="py-2 border-t border-border">
                <div className="flex items-center justify-between px-3 pb-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Time entries
                  </span>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => goTo(`/time?search=${encodeURIComponent(debounced)}`)}
                    data-testid="link-view-all-time-entries"
                  >
                    View all{data?.totals?.timeEntries ? ` (${data.totals.timeEntries})` : ""}
                  </button>
                </div>
                {timeEntries.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="w-full flex items-start gap-2 px-3 py-2 text-left hover-elevate active-elevate-2 rounded-sm"
                    onClick={() => goTo(`/time?search=${encodeURIComponent(debounced)}`)}
                    data-testid={`result-time-entry-${t.id}`}
                  >
                    <Clock className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {t.description || t.projectName || "Time entry"}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[t.date, t.projectName, t.personName].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {Number(t.hours)}h
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
