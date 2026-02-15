import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, ArrowLeft, Send, LifeBuoy, Clock, Pencil, X, Check, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const ticketFormSchema = z.object({
  category: z.enum(["bug", "feature_request", "question", "feedback"]),
  subject: z.string().min(1, "Subject is required").max(200),
  description: z.string().min(1, "Description is required"),
  priority: z.enum(["low", "medium", "high"]),
});

type TicketFormValues = z.infer<typeof ticketFormSchema>;

interface Ticket {
  id: string;
  ticketNumber: number;
  subject: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  replies?: Reply[];
  author?: { id: string; email: string; firstName: string; lastName: string } | null;
  tenant?: { id: string; name: string } | null;
}

interface Reply {
  id: string;
  ticketId: string;
  userId: string;
  message: string;
  isInternal: boolean;
  createdAt: string;
  user?: { id: string; firstName: string; lastName: string; email: string } | null;
}

function getStatusBadgeClass(status: string) {
  switch (status) {
    case "open":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-transparent";
    case "in_progress":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 border-transparent";
    case "resolved":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-transparent";
    case "closed":
      return "bg-muted text-muted-foreground border-transparent";
    default:
      return "";
  }
}

function getPriorityBadgeClass(priority: string) {
  switch (priority) {
    case "high":
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-transparent";
    case "medium":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 border-transparent";
    case "low":
      return "bg-muted text-muted-foreground border-transparent";
    default:
      return "";
  }
}

function formatLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function TicketList({
  onSelectTicket,
  onNewTicket,
}: {
  onSelectTicket: (id: string) => void;
  onNewTicket: () => void;
}) {
  const { data: tickets, isLoading } = useQuery<Ticket[]>({
    queryKey: ["/api/support/tickets"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-support-title">Support</h1>
          <p className="text-muted-foreground text-sm">View and manage your support tickets</p>
        </div>
        <Button onClick={onNewTicket} data-testid="button-new-ticket">
          <Plus className="mr-2 h-4 w-4" />
          New Ticket
        </Button>
      </div>

      {!tickets || tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <LifeBuoy className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground" data-testid="text-empty-tickets">No support tickets yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Click "New Ticket" to create your first support request.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <Card
              key={ticket.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => onSelectTicket(ticket.id)}
              data-testid={`card-ticket-${ticket.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground font-mono" data-testid={`text-ticket-number-${ticket.id}`}>
                        #{ticket.ticketNumber}
                      </span>
                      <Badge className={getStatusBadgeClass(ticket.status)} data-testid={`badge-status-${ticket.id}`}>
                        {formatLabel(ticket.status)}
                      </Badge>
                    </div>
                    <p className="font-medium truncate" data-testid={`text-ticket-subject-${ticket.id}`}>
                      {ticket.subject}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs" data-testid={`badge-category-${ticket.id}`}>
                        {formatLabel(ticket.category)}
                      </Badge>
                      <Badge className={`text-xs ${getPriorityBadgeClass(ticket.priority)}`} data-testid={`badge-priority-${ticket.id}`}>
                        {formatLabel(ticket.priority)}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                    <Clock className="h-3 w-3" />
                    <span data-testid={`text-ticket-date-${ticket.id}`}>{formatDate(ticket.createdAt)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function NewTicketForm({ onBack, initialDescription }: { onBack: () => void; initialDescription?: string }) {
  const { toast } = useToast();

  const form = useForm<TicketFormValues>({
    resolver: zodResolver(ticketFormSchema),
    defaultValues: {
      category: "question",
      subject: "",
      description: initialDescription || "",
      priority: "medium",
    },
  });

  const createTicket = useMutation({
    mutationFn: async (values: TicketFormValues) => {
      return await apiRequest("/api/support/tickets", {
        method: "POST",
        body: JSON.stringify(values),
      });
    },
    onSuccess: () => {
      toast({ title: "Ticket created", description: "Your support ticket has been submitted." });
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
      onBack();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-to-list">
          <ArrowLeft />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">New Support Ticket</h1>
          <p className="text-muted-foreground text-sm">Describe your issue or request</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => createTicket.mutate(v))} className="space-y-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="bug">Bug</SelectItem>
                        <SelectItem value="feature_request">Feature Request</SelectItem>
                        <SelectItem value="question">Question</SelectItem>
                        <SelectItem value="feedback">Feedback</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subject</FormLabel>
                    <FormControl>
                      <Input placeholder="Brief summary of your issue" {...field} data-testid="input-subject" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe your issue or request in detail"
                        className="min-h-[120px]"
                        {...field}
                        data-testid="input-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-priority">
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={onBack} data-testid="button-cancel-ticket">
                  Cancel
                </Button>
                <Button type="submit" disabled={createTicket.isPending} data-testid="button-submit-ticket">
                  {createTicket.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Submit Ticket
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

function TicketDetail({ ticketId, onBack }: { ticketId: string; onBack: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [replyText, setReplyText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [editCategory, setEditCategory] = useState("");

  const { data: ticket, isLoading } = useQuery<Ticket>({
    queryKey: ["/api/support/tickets", ticketId],
  });

  const isOwner = ticket && user && ticket.author?.id === user.id;
  const canEdit = isOwner && ticket.status !== 'resolved' && ticket.status !== 'closed';

  const sendReply = useMutation({
    mutationFn: async (message: string) => {
      return await apiRequest(`/api/support/tickets/${ticketId}/replies`, {
        method: "POST",
        body: JSON.stringify({ message }),
      });
    },
    onSuccess: () => {
      setReplyText("");
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateTicket = useMutation({
    mutationFn: async (updates: Record<string, string>) => {
      return await apiRequest(`/api/support/tickets/${ticketId}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
    },
    onSuccess: () => {
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
      toast({ title: "Ticket updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const closeTicket = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/support/tickets/${ticketId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "closed" }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
      toast({ title: "Ticket closed", description: "Your ticket has been closed." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const startEditing = () => {
    if (!ticket) return;
    setEditSubject(ticket.subject);
    setEditDescription(ticket.description);
    setEditPriority(ticket.priority);
    setEditCategory(ticket.category);
    setIsEditing(true);
  };

  const saveEdits = () => {
    if (!ticket) return;
    const updates: Record<string, string> = {};
    if (editSubject !== ticket.subject) updates.subject = editSubject;
    if (editDescription !== ticket.description) updates.description = editDescription;
    if (editPriority !== ticket.priority) updates.priority = editPriority;
    if (editCategory !== ticket.category) updates.category = editCategory;
    if (Object.keys(updates).length === 0) {
      setIsEditing(false);
      return;
    }
    updateTicket.mutate(updates);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-to-list">
          <ArrowLeft />
        </Button>
        <p className="text-muted-foreground">Ticket not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-to-list">
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <Input
              value={editSubject}
              onChange={(e) => setEditSubject(e.target.value)}
              className="text-xl font-semibold"
              data-testid="input-edit-subject"
            />
          ) : (
            <h1 className="text-2xl font-semibold truncate" data-testid="text-detail-subject">
              {ticket.subject}
            </h1>
          )}
          <p className="text-sm text-muted-foreground font-mono" data-testid="text-detail-ticket-number">
            #{ticket.ticketNumber}
          </p>
        </div>
        {canEdit && !isEditing && (
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={startEditing} data-testid="button-edit-ticket">
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              Edit
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" data-testid="button-close-ticket">
                  <XCircle className="h-3.5 w-3.5 mr-1.5" />
                  Close Ticket
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Close this ticket?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will close ticket #{ticket.ticketNumber}. You won't be able to edit it after closing. Are you sure?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => closeTicket.mutate()}
                    disabled={closeTicket.isPending}
                  >
                    {closeTicket.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Close Ticket
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
        {isEditing && (
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => setIsEditing(false)} data-testid="button-cancel-edit">
              <X className="h-3.5 w-3.5 mr-1.5" />
              Cancel
            </Button>
            <Button size="sm" onClick={saveEdits} disabled={updateTicket.isPending} data-testid="button-save-edit">
              {updateTicket.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
              Save
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 flex-wrap">
            {isEditing ? (
              <>
                <Select value={editCategory} onValueChange={setEditCategory}>
                  <SelectTrigger className="w-[160px]" data-testid="select-edit-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bug">Bug</SelectItem>
                    <SelectItem value="feature_request">Feature Request</SelectItem>
                    <SelectItem value="question">Question</SelectItem>
                    <SelectItem value="feedback">Feedback</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={editPriority} onValueChange={setEditPriority}>
                  <SelectTrigger className="w-[120px]" data-testid="select-edit-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </>
            ) : (
              <>
                <Badge variant="outline" data-testid="badge-detail-category">
                  {formatLabel(ticket.category)}
                </Badge>
                <Badge className={getPriorityBadgeClass(ticket.priority)} data-testid="badge-detail-priority">
                  {formatLabel(ticket.priority)}
                </Badge>
              </>
            )}
            <Badge className={getStatusBadgeClass(ticket.status)} data-testid="badge-detail-status">
              {formatLabel(ticket.status)}
            </Badge>
            <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDate(ticket.createdAt)}
            </span>
          </div>
          {isEditing ? (
            <Textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="mt-4 min-h-[100px]"
              data-testid="input-edit-description"
            />
          ) : ticket.description ? (
            <p className="mt-4 text-sm whitespace-pre-wrap" data-testid="text-detail-description">
              {ticket.description}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-lg font-medium">Replies</h2>

        {(!ticket.replies || ticket.replies.length === 0) ? (
          <p className="text-sm text-muted-foreground" data-testid="text-no-replies">No replies yet.</p>
        ) : (
          <div className="space-y-3">
            {ticket.replies.map((reply: Reply) => {
              const authorName = reply.user
                ? `${reply.user.firstName || ''} ${reply.user.lastName || ''}`.trim() || reply.user.email
                : "Unknown";
              return (
              <Card key={reply.id} data-testid={`card-reply-${reply.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="text-xs">
                        {authorName
                          .split(" ")
                          .map((n: string) => n[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2) || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium" data-testid={`text-reply-author-${reply.id}`}>
                          {authorName}
                        </span>
                        <span className="text-xs text-muted-foreground" data-testid={`text-reply-time-${reply.id}`}>
                          {formatDate(reply.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm mt-1 whitespace-pre-wrap" data-testid={`text-reply-message-${reply.id}`}>
                        {reply.message}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              );
            })}
          </div>
        )}

        {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
          <div className="flex items-start gap-3">
            <Textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Write a reply..."
              className="flex-1 min-h-[80px]"
              data-testid="input-reply"
            />
            <Button
              size="icon"
              disabled={!replyText.trim() || sendReply.isPending}
              onClick={() => sendReply.mutate(replyText.trim())}
              data-testid="button-send-reply"
            >
              {sendReply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send />}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Support() {
  const [view, setView] = useState<"list" | "new" | "detail">("list");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [location, setLocation] = useLocation();

  const searchParams = new URLSearchParams(location.split("?")[1] || "");
  const urlTicketId = searchParams.get("ticketId");
  const isNewPath = location.startsWith("/support/new");

  const activeView = isNewPath ? "new" : urlTicketId ? "detail" : view;
  const activeTicketId = urlTicketId || selectedTicketId;

  const handleSelectTicket = (id: string) => {
    setSelectedTicketId(id);
    setView("detail");
  };

  const handleBackToList = () => {
    setSelectedTicketId(null);
    setView("list");
    if (urlTicketId) {
      setLocation("/support");
    }
  };

  const handleNewTicket = () => {
    setView("new");
  };

  return (
    <Layout>
      <div className="flex-1 p-6 max-w-3xl mx-auto">
        {activeView === "list" && (
          <TicketList onSelectTicket={handleSelectTicket} onNewTicket={handleNewTicket} />
        )}
        {activeView === "new" && (
          <NewTicketForm
            onBack={handleBackToList}
            initialDescription={searchParams.get("summary") || undefined}
          />
        )}
        {activeView === "detail" && activeTicketId && (
          <TicketDetail ticketId={activeTicketId} onBack={handleBackToList} />
        )}
      </div>
    </Layout>
  );
}
