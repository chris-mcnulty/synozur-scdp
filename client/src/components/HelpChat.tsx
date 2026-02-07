import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { MessageCircleQuestion, X, Send, ArrowRight, Loader2, Sparkles } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  suggestions?: Array<{ label: string; route: string }>;
}

interface HelpChatResponse {
  answer: string;
  suggestions: Array<{ label: string; route: string }>;
  usage: { totalTokens: number };
}

export function HelpChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const [, navigate] = useLocation();

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
        suggestions: data.suggestions
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
                className="flex-1 bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground"
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
