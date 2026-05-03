import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Bot, User as UserIcon, Send, Check, X, Loader2, AlertTriangle, ListPlus, History, ShieldCheck } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { formatDistanceToNow } from "date-fns";

interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  createdAt: string;
}

interface AgentAction {
  id: string;
  tool: string;
  args: Record<string, any>;
  previewDiff: Record<string, any> | null;
  status: 'proposed' | 'applied' | 'rejected' | 'failed';
  errorMessage?: string | null;
  result?: Record<string, any> | null;
  messageId?: string | null;
}

interface AgentConversation {
  id: string;
  title: string | null;
  updatedAt: string;
}

interface SendResponse {
  conversationId: string;
  userMessage: AgentMessage;
  assistantMessage: AgentMessage;
  actions: AgentAction[];
}

interface Props {
  projectId: string;
  projectName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TOOL_LABELS: Record<string, string> = {
  reschedule_milestone: "Reschedule milestone",
  shift_allocations: "Shift allocations",
  reassign_allocations: "Reassign allocations",
  create_raidd_entry: "Create RAIDD entry",
  update_raidd_entry: "Update RAIDD entry",
  split_deliverable: "Split deliverable",
};

function ActionCard({ action, projectId, onMutated }: { action: AgentAction; projectId: string; onMutated: () => void }) {
  const { toast } = useToast();

  const apply = async (confirmLargeChange = false): Promise<any> => {
    const body: Record<string, unknown> = { confirmLargeChange };
    if (action.tool === 'split_deliverable') {
      body.overrides = { children: editedChildren.filter(c => c.name.trim()) };
    }
    return apiRequest(`/api/projects/${projectId}/agent/actions/${action.id}/apply`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  };

  const applyMut = useMutation<any, Error, boolean>({
    mutationFn: (confirm) => apply(confirm),
    onSuccess: () => {
      toast({ title: "Applied", description: TOOL_LABELS[action.tool] || action.tool });
      // Invalidate every project-detail-derived query so allocations,
      // milestones, deliverables, RAIDD, analytics, etc. refetch immediately.
      queryClient.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey;
          if (!Array.isArray(k) || k.length === 0) return false;
          const head = String(k[0] || '');
          if (head.includes('/api/projects')) return true;
          if (head.includes('/api/raidd')) return true;
          if (head.includes('/api/deliverables')) return true;
          if (head.includes('/api/allocations')) return true;
          if (head.includes('/api/milestones')) return true;
          if (head.includes('/api/portfolio')) return true;
          return false;
        },
      });
      onMutated();
    },
    onError: (err: any) => {
      // Confirmation-required → 409 with code CONFIRM_REQUIRED
      if (err?.message?.includes('confirmLargeChange')) {
        if (window.confirm(`${err.message}\n\nProceed?`)) {
          applyMut.mutate(true);
          return;
        }
      }
      toast({ title: "Apply failed", description: err?.message || 'Error', variant: 'destructive' });
    },
  });

  const rejectMut = useMutation({
    mutationFn: () => apiRequest(`/api/projects/${projectId}/agent/actions/${action.id}/reject`, { method: 'POST' }),
    onSuccess: () => onMutated(),
  });

  type PreviewDiff = {
    affectedCount?: number;
    error?: string;
    children?: Array<{ name: string; description?: string | null; ownerName?: string; targetDate?: string | null }>;
    parentName?: string;
    [key: string]: unknown;
  };
  const diff: PreviewDiff = (action.previewDiff || {}) as PreviewDiff;
  const affected = diff.affectedCount;
  const hasError = !!diff.error;
  const isSplit = action.tool === 'split_deliverable' && Array.isArray(diff.children);
  const [editedChildren, setEditedChildren] = useState(
    isSplit ? (diff.children || []).map(c => ({ ...c })) : []
  );

  return (
    <Card className="border-l-4 border-l-primary" data-testid={`action-card-${action.id}`}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary">{TOOL_LABELS[action.tool] || action.tool}</Badge>
          <Badge variant={
            action.status === 'applied' ? 'default' :
            action.status === 'failed' ? 'destructive' :
            action.status === 'rejected' ? 'outline' : 'secondary'
          }>
            {action.status}
          </Badge>
          {typeof affected === 'number' && (
            <span className="text-xs text-muted-foreground">{affected} affected</span>
          )}
        </div>
        {hasError && (
          <div className="flex items-start gap-1 text-xs text-destructive">
            <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <span>{diff.error}</span>
          </div>
        )}
        {isSplit ? (
          <div className="space-y-2">
            {diff.parentName && (
              <div className="text-xs text-muted-foreground">Splitting "<span className="font-medium">{diff.parentName}</span>" into:</div>
            )}
            {editedChildren.map((c, i) => (
              <div key={i} className="border rounded p-2 space-y-1 bg-muted/30">
                <input
                  className="w-full text-sm font-medium bg-transparent outline-none border-b border-transparent focus:border-primary"
                  value={c.name}
                  onChange={(e) => setEditedChildren(prev => prev.map((p, idx) => idx === i ? { ...p, name: e.target.value } : p))}
                  data-testid={`split-child-name-${i}`}
                  disabled={action.status !== 'proposed'}
                />
                <input
                  className="w-full text-xs bg-transparent outline-none border-b border-transparent focus:border-primary text-muted-foreground"
                  placeholder="Description"
                  value={c.description || ''}
                  onChange={(e) => setEditedChildren(prev => prev.map((p, idx) => idx === i ? { ...p, description: e.target.value } : p))}
                  data-testid={`split-child-description-${i}`}
                  disabled={action.status !== 'proposed'}
                />
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {c.ownerName && <span>Owner: {c.ownerName}</span>}
                  {c.targetDate && <span>Target: {c.targetDate}</span>}
                </div>
              </div>
            ))}
            {action.status === 'proposed' && (
              <Button size="sm" variant="ghost" className="text-xs"
                onClick={() => setEditedChildren(prev => [...prev, { name: '', description: '', targetDate: null }])}
                data-testid="button-add-split-child"
              >
                + Add child
              </Button>
            )}
          </div>
        ) : (
          <pre className="text-xs bg-muted p-2 rounded max-h-40 overflow-auto whitespace-pre-wrap break-words">
{JSON.stringify(diff, null, 2)}
          </pre>
        )}
        {action.errorMessage && (
          <div className="text-xs text-destructive">{action.errorMessage}</div>
        )}
        {action.status === 'proposed' && !hasError && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => applyMut.mutate(false)} disabled={applyMut.isPending} data-testid={`button-apply-${action.id}`}>
              {applyMut.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Check className="w-3 h-3 mr-1" />}
              Apply
            </Button>
            <Button size="sm" variant="outline" onClick={() => rejectMut.mutate()} disabled={rejectMut.isPending} data-testid={`button-reject-${action.id}`}>
              <X className="w-3 h-3 mr-1" />
              Reject
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ProjectAgentSheet({ projectId, projectName, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const { data: conversations = [] } = useQuery<AgentConversation[]>({
    queryKey: ['/api/projects', projectId, 'agent', 'conversations'],
    enabled: open,
  });

  const { data: convData, refetch } = useQuery<{ messages: AgentMessage[]; actions: AgentAction[] }>({
    queryKey: ['/api/projects', projectId, 'agent', 'conversations', conversationId],
    enabled: !!conversationId && open,
  });

  const messages = convData?.messages || [];
  const actions = convData?.actions || [];

  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const auditQuery = useQuery<any[]>({
    queryKey: ['/api/projects', projectId, 'agent', 'actions'],
    enabled: open && isAdmin && showAudit,
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, actions.length]);

  const sendMut = useMutation<SendResponse, Error, string>({
    mutationFn: async (message) => {
      return apiRequest(`/api/projects/${projectId}/agent/messages`, {
        method: 'POST',
        body: JSON.stringify({ conversationId, message }),
      });
    },
    onSuccess: (data) => {
      setConversationId(data.conversationId);
      setInput("");
      refetch();
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'agent', 'conversations'] });
    },
    onError: (err: any) => toast({ title: "Agent error", description: err?.message || 'Error', variant: 'destructive' }),
  });

  const handleSend = () => {
    const msg = input.trim();
    if (!msg || sendMut.isPending) return;
    sendMut.mutate(msg);
  };

  const handleNewChat = () => {
    setConversationId(null);
    setInput("");
    setShowHistory(false);
    setShowAudit(false);
  };

  const handlePickConversation = (id: string) => {
    setConversationId(id);
    setShowHistory(false);
  };

  const actionsByMessageId = actions.reduce<Record<string, AgentAction[]>>((acc, a) => {
    const k = a.messageId || '__';
    (acc[k] = acc[k] || []).push(a);
    return acc;
  }, {});

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl flex flex-col p-0" data-testid="sheet-project-agent">
        <SheetHeader className="px-4 py-3 border-b">
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle className="flex items-center gap-2">
                <Bot className="w-4 h-4" /> AI Project Manager
              </SheetTitle>
              <SheetDescription className="text-xs">
                {projectName ? `${projectName} • ` : ''}Reschedule, reassign, manage RAIDD — preview before apply.
              </SheetDescription>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setShowHistory(s => !s)} data-testid="button-toggle-history" title="Conversation history">
                <History className="w-4 h-4" />
              </Button>
              {isAdmin && (
                <Button size="sm" variant="ghost" onClick={() => setShowAudit(s => !s)} data-testid="button-toggle-audit" title="Admin audit log">
                  <ShieldCheck className="w-4 h-4" />
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={handleNewChat} data-testid="button-new-chat" title="New chat">
                <ListPlus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        {showAudit && isAdmin && (
          <div className="border-b max-h-72 overflow-auto">
            <div className="px-4 py-2 text-xs font-medium text-muted-foreground flex items-center gap-2">
              <ShieldCheck className="w-3 h-3" /> Admin audit log
            </div>
            {auditQuery.isLoading && <div className="px-4 pb-3 text-xs text-muted-foreground">Loading…</div>}
            {!auditQuery.isLoading && (auditQuery.data || []).length === 0 && (
              <div className="px-4 pb-3 text-xs text-muted-foreground">No actions recorded yet.</div>
            )}
            {(auditQuery.data || []).map((a: AgentAction & { createdAt?: string; appliedAt?: string | null; tool: string; status: string }) => (
              <div key={a.id} className="px-4 py-2 border-t text-xs flex items-center justify-between gap-2" data-testid={`audit-action-${a.id}`}>
                <div className="truncate">
                  <span className="font-medium">{TOOL_LABELS[a.tool] || a.tool}</span>
                  {a.errorMessage && <span className="text-red-600 ml-2">{a.errorMessage}</span>}
                </div>
                <div className="flex-shrink-0 flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{a.status}</Badge>
                  {a.createdAt && (
                    <span className="text-muted-foreground">{formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {showHistory && (
          <div className="border-b max-h-60 overflow-auto">
            <div className="px-4 py-2 text-xs font-medium text-muted-foreground">Recent conversations</div>
            {conversations.length === 0 && (
              <div className="px-4 pb-3 text-xs text-muted-foreground">No previous conversations.</div>
            )}
            {conversations.map(c => (
              <button
                key={c.id}
                onClick={() => handlePickConversation(c.id)}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-muted flex justify-between items-center gap-2 ${conversationId === c.id ? 'bg-muted/50' : ''}`}
                data-testid={`conversation-${c.id}`}
              >
                <span className="truncate">{c.title || '(untitled)'}</span>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {formatDistanceToNow(new Date(c.updatedAt), { addSuffix: true })}
                </span>
              </button>
            ))}
          </div>
        )}

        <ScrollArea className="flex-1 px-4 py-3" ref={scrollRef}>
          {!conversationId && messages.length === 0 && (
            <div className="text-center text-sm text-muted-foreground mt-12 space-y-2">
              <Bot className="w-8 h-8 mx-auto opacity-40" />
              <p className="font-medium">How can I help with this project?</p>
              <div className="text-xs space-y-1 mt-4">
                <p>"Push the Discovery milestone end date to Nov 15"</p>
                <p>"Reassign Sarah's allocations to Mark"</p>
                <p>"Add a high-priority risk about the data migration"</p>
              </div>
            </div>
          )}
          <div className="space-y-3">
            {messages.map(m => (
              <div key={m.id} className="space-y-2">
                <div className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {m.role !== 'user' && <Bot className="w-5 h-5 mt-1 text-muted-foreground flex-shrink-0" />}
                  <div className={`rounded-lg px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap break-words ${
                    m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  }`} data-testid={`message-${m.role}-${m.id}`}>
                    {m.content}
                  </div>
                  {m.role === 'user' && <UserIcon className="w-5 h-5 mt-1 text-muted-foreground flex-shrink-0" />}
                </div>
                {m.role === 'assistant' && actionsByMessageId[m.id]?.length > 0 && (
                  <div className="ml-7 space-y-2">
                    {actionsByMessageId[m.id].map(a => (
                      <ActionCard key={a.id} action={a} projectId={projectId} onMutated={() => refetch()} />
                    ))}
                  </div>
                )}
              </div>
            ))}
            {sendMut.isPending && (
              <div className="flex gap-2 items-center text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Thinking…
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t p-3 flex flex-col gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask the AI to update milestones, allocations, or RAIDD…"
            rows={2}
            className="resize-none"
            disabled={sendMut.isPending}
            data-testid="input-agent-message"
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={handleSend} disabled={!input.trim() || sendMut.isPending} data-testid="button-send-message">
              {sendMut.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Send className="w-3 h-3 mr-1" />}
              Send
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
