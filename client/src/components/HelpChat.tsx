import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { MessageCircleQuestion, X, Send, ArrowRight, Loader2, Sparkles, TicketCheck, Pencil, Check } from "lucide-react";

interface TicketSuggestion {
  category: "bug" | "feature_request" | "question" | "feedback";
  subject: string;
  description: string;
  priority: "low" | "medium" | "high";
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  suggestions?: Array<{ label: string; route: string }>;
  ticketSuggestion?: TicketSuggestion | null;
}

interface HelpChatResponse {
  answer: string;
  suggestions: Array<{ label: string; route: string }>;
  ticketSuggestion?: TicketSuggestion | null;
  usage: { totalTokens: number };
}

const CATEGORY_LABELS: Record<string, string> = {
  bug: "Bug",
  feature_request: "Feature Request",
  question: "Question",
  feedback: "Feedback",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

function TicketDraftCard({
  draft,
  onSubmit,
  onDismiss,
  isSubmitting,
}: {
  draft: TicketSuggestion;
  onSubmit: (ticket: TicketSuggestion) => void;
  onDismiss: () => void;
  isSubmitting: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedDraft, setEditedDraft] = useState<TicketSuggestion>({ ...draft });

  if (isEditing) {
    return (
      <div className="border border-primary/30 rounded-lg p-3 bg-primary/5 space-y-2.5 mt-2">
        <p className="text-xs font-semibold text-primary">Edit Support Ticket</p>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Category</label>
          <select
            value={editedDraft.category}
            onChange={(e) => setEditedDraft(d => ({ ...d, category: e.target.value as TicketSuggestion["category"] }))}
            className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
          >
            <option value="bug">Bug</option>
            <option value="feature_request">Feature Request</option>
            <option value="question">Question</option>
            <option value="feedback">Feedback</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Priority</label>
          <select
            value={editedDraft.priority}
            onChange={(e) => setEditedDraft(d => ({ ...d, priority: e.target.value as TicketSuggestion["priority"] }))}
            className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Subject</label>
          <input
            type="text"
            value={editedDraft.subject}
            onChange={(e) => setEditedDraft(d => ({ ...d, subject: e.target.value }))}
            className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
            maxLength={200}
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Description</label>
          <textarea
            value={editedDraft.description}
            onChange={(e) => setEditedDraft(d => ({ ...d, description: e.target.value }))}
            className="w-full mt-0.5 text-xs border border-border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary/50 min-h-[80px] resize-y"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => { setIsEditing(false); setEditedDraft({ ...draft }); }}
            className="text-xs px-2.5 py-1.5 rounded border border-border text-muted-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => { onSubmit(editedDraft); }}
            disabled={!editedDraft.subject.trim() || !editedDraft.description.trim() || isSubmitting}
            className="flex-1 text-xs px-2.5 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1"
          >
            {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Submit Ticket
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-primary/30 rounded-lg p-3 bg-primary/5 space-y-2 mt-2">
      <div className="flex items-center gap-1.5">
        <TicketCheck className="h-3.5 w-3.5 text-primary" />
        <p className="text-xs font-semibold text-primary">Would you like to open a support ticket?</p>
      </div>
      <div className="space-y-1.5 text-xs">
        <div className="flex gap-2">
          <span className="text-muted-foreground shrink-0">Category:</span>
          <span className="font-medium">{CATEGORY_LABELS[draft.category] || draft.category}</span>
        </div>
        <div className="flex gap-2">
          <span className="text-muted-foreground shrink-0">Priority:</span>
          <span className="font-medium">{PRIORITY_LABELS[draft.priority] || draft.priority}</span>
        </div>
        <div className="flex gap-2">
          <span className="text-muted-foreground shrink-0">Subject:</span>
          <span className="font-medium">{draft.subject}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Description:</span>
          <p className="mt-0.5 text-foreground/80 whitespace-pre-wrap line-clamp-4">{draft.description}</p>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={onDismiss}
          className="text-xs px-2.5 py-1.5 rounded border border-border text-muted-foreground hover:bg-accent transition-colors"
        >
          No thanks
        </button>
        <button
          onClick={() => setIsEditing(true)}
          className="text-xs px-2.5 py-1.5 rounded border border-primary/30 text-primary hover:bg-primary/10 transition-colors flex items-center gap-1"
        >
          <Pencil className="h-3 w-3" />
          Edit
        </button>
        <button
          onClick={() => onSubmit(draft)}
          disabled={isSubmitting}
          className="flex-1 text-xs px-2.5 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1"
        >
          {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Submit
        </button>
      </div>
    </div>
  );
}

export function HelpChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [dismissedTicketIndices, setDismissedTicketIndices] = useState<Set<number>>(new Set());
  const [submittedTicketIndices, setSubmittedTicketIndices] = useState<Set<number>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await apiRequest("/api/ai/help-chat", {
        method: "POST",
        body: JSON.stringify({
          message,
          history: messages.slice(-8).map(m => ({
            role: m.role,
            content: m.content
          }))
        }),
      });
      return response as HelpChatResponse;
    },
    onSuccess: (data) => {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.answer,
        suggestions: data.suggestions,
        ticketSuggestion: data.ticketSuggestion || null
      }]);
    },
    onError: (error: Error) => {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `Sorry, I couldn't process that request. ${error.message || "Please try again."}`,
        suggestions: []
      }]);
    }
  });

  const submitTicketMutation = useMutation({
    mutationFn: async (ticket: TicketSuggestion) => {
      return await apiRequest("/api/support/tickets", {
        method: "POST",
        body: JSON.stringify(ticket),
      });
    },
    onSuccess: (_data, _variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
      toast({
        title: "Ticket created",
        description: "Your support ticket has been submitted successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create support ticket.",
        variant: "destructive",
      });
    },
  });

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || chatMutation.isPending) return;

    setMessages(prev => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    chatMutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNavigate = (route: string) => {
    navigate(route);
    setIsOpen(false);
  };

  const handleClearChat = () => {
    setMessages([]);
    setDismissedTicketIndices(new Set());
    setSubmittedTicketIndices(new Set());
  };

  const handleTicketSubmit = (ticket: TicketSuggestion, messageIndex: number) => {
    submitTicketMutation.mutate(ticket, {
      onSuccess: () => {
        setSubmittedTicketIndices(prev => new Set(prev).add(messageIndex));
        setMessages(prev => [...prev, {
          role: "assistant",
          content: "Your support ticket has been created! You can view and track it on the **Support** page.",
          suggestions: [{ label: "View My Tickets", route: "/support" }]
        }]);
      }
    });
  };

  const handleTicketDismiss = (messageIndex: number) => {
    setDismissedTicketIndices(prev => new Set(prev).add(messageIndex));
  };

  if (!user) return null;

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-primary text-primary-foreground px-4 py-3 rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105 group"
          aria-label="Open help chat"
        >
          <MessageCircleQuestion className="h-5 w-5" />
          <span className="text-sm font-medium">Help</span>
        </button>
      )}

      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-96 max-w-[calc(100vw-2rem)] bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden" style={{ height: "min(600px, calc(100vh - 6rem))" }}>
          <div className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground rounded-t-xl">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <h3 className="font-semibold text-sm">Constellation Help</h3>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  onClick={handleClearChat}
                  className="text-primary-foreground/70 hover:text-primary-foreground text-xs px-2 py-1 rounded hover:bg-white/10 transition-colors"
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="text-primary-foreground/70 hover:text-primary-foreground p-1 rounded hover:bg-white/10 transition-colors"
                aria-label="Close help chat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-8 space-y-3">
                <MessageCircleQuestion className="h-10 w-10 mx-auto text-muted-foreground/50" />
                <div>
                  <p className="text-sm font-medium text-foreground">How can I help?</p>
                  <p className="text-xs text-muted-foreground mt-1">Ask me anything about using Constellation</p>
                </div>
                <div className="space-y-2 pt-2">
                  {[
                    "How do I submit an expense report?",
                    "How do I track my time?",
                    "How do I create a new project?"
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => {
                        setInput(q);
                        setMessages(prev => [...prev, { role: "user", content: q }]);
                        chatMutation.mutate(q);
                      }}
                      className="block w-full text-left text-xs px-3 py-2 rounded-lg border border-border hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}>
                  {msg.role === "assistant" ? (
                    <div className="space-y-2">
                      <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-1 [&>ul]:mb-1 [&>ol]:mb-1 [&>p:last-child]:mb-0">
                        {msg.content.split('\n').map((line, li) => {
                          if (line.startsWith('- ') || line.startsWith('* ')) {
                            return <div key={li} className="pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-muted-foreground">{line.slice(2)}</div>;
                          }
                          if (/^\d+\.\s/.test(line)) {
                            const match = line.match(/^(\d+)\.\s(.*)/);
                            if (match) {
                              return <div key={li} className="pl-4 relative"><span className="absolute left-0 text-muted-foreground">{match[1]}.</span> {match[2]}</div>;
                            }
                          }
                          if (line.startsWith('**') && line.endsWith('**')) {
                            return <p key={li} className="font-semibold">{line.slice(2, -2)}</p>;
                          }
                          if (line.trim() === '') return <br key={li} />;
                          return <p key={li}>{line.replace(/\*\*(.*?)\*\*/g, '$1')}</p>;
                        })}
                      </div>
                      {msg.suggestions && msg.suggestions.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/50">
                          {msg.suggestions.map((s, si) => (
                            <button
                              key={si}
                              onClick={() => handleNavigate(s.route)}
                              className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
                            >
                              {s.label}
                              <ArrowRight className="h-3 w-3" />
                            </button>
                          ))}
                        </div>
                      )}
                      {msg.ticketSuggestion && !dismissedTicketIndices.has(i) && !submittedTicketIndices.has(i) && (
                        <TicketDraftCard
                          draft={msg.ticketSuggestion}
                          onSubmit={(ticket) => handleTicketSubmit(ticket, i)}
                          onDismiss={() => handleTicketDismiss(i)}
                          isSubmitting={submitTicketMutation.isPending}
                        />
                      )}
                      {submittedTicketIndices.has(i) && (
                        <div className="flex items-center gap-1.5 mt-2 text-xs text-green-600 dark:text-green-400">
                          <Check className="h-3.5 w-3.5" />
                          <span>Ticket submitted</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p>{msg.content}</p>
                  )}
                </div>
              </div>
            ))}

            {chatMutation.isPending && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-3 py-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Thinking...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-border p-3">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question..."
                className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground"
                disabled={chatMutation.isPending}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || chatMutation.isPending}
                className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
