import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowLeft, Send, LifeBuoy, Clock, AlertCircle, CheckCircle2, MessageSquare, Eye } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface TicketListItem {
  id: string;
  ticketNumber: number;
  tenantId: string;
  userId: string;
  category: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface TicketReply {
  id: string;
  ticketId: string;
  userId: string;
  message: string;
  isInternal: boolean;
  createdAt: string;
  user?: { id: string; firstName: string; lastName: string; email: string } | null;
}

interface TicketDetailType {
  id: string;
  ticketNumber: number;
  tenantId: string;
  userId: string;
  category: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  assignedTo: string | null;
  metadata: object | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  replies: TicketReply[];
  author: { id: string; email: string; firstName: string; lastName: string } | null;
  tenant: { id: string; name: string } | null;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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

function getStatusIcon(status: string) {
  switch (status) {
    case "open":
      return <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
    case "in_progress":
      return <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />;
    case "resolved":
      return <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />;
    case "closed":
      return <CheckCircle2 className="h-4 w-4 text-muted-foreground" />;
    default:
      return null;
  }
}

export function AdminSupportTab() {
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const filters: Record<string, string> = {};
  if (statusFilter !== "all") filters.status = statusFilter;
  if (priorityFilter !== "all") filters.priority = priorityFilter;
  if (categoryFilter !== "all") filters.category = categoryFilter;

  const { data: tickets, isLoading } = useQuery<TicketListItem[]>({
    queryKey: ["/api/support/tickets", filters],
  });

  const openCount = tickets?.filter((t) => t.status === "open").length ?? 0;
  const inProgressCount = tickets?.filter((t) => t.status === "in_progress").length ?? 0;
  const totalCount = tickets?.length ?? 0;

  if (selectedTicketId) {
    return (
      <TicketDetailView
        ticketId={selectedTicketId}
        onBack={() => setSelectedTicketId(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card data-testid="stat-card-total">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tickets</CardTitle>
            <LifeBuoy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total-count">{totalCount}</div>
          </CardContent>
        </Card>
        <Card data-testid="stat-card-open">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open</CardTitle>
            <AlertCircle className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400" data-testid="stat-open-count">{openCount}</div>
          </CardContent>
        </Card>
        <Card data-testid="stat-card-in-progress">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400" data-testid="stat-in-progress-count">{inProgressCount}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="min-w-[160px]">
              <Label className="text-xs text-muted-foreground mb-1 block">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger data-testid="trigger-status-filter">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[160px]">
              <Label className="text-xs text-muted-foreground mb-1 block">Priority</Label>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger data-testid="trigger-priority-filter">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[160px]">
              <Label className="text-xs text-muted-foreground mb-1 block">Category</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger data-testid="trigger-category-filter">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="bug">Bug</SelectItem>
                  <SelectItem value="feature_request">Feature Request</SelectItem>
                  <SelectItem value="question">Question</SelectItem>
                  <SelectItem value="feedback">Feedback</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !tickets || tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <LifeBuoy className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground" data-testid="text-empty-admin-tickets">No tickets found</p>
          <p className="text-sm text-muted-foreground mt-1">
            Adjust filters or wait for new tickets to arrive.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <Card
              key={ticket.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedTicketId(ticket.id)}
              data-testid={`card-admin-ticket-${ticket.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground font-mono" data-testid={`text-ticket-number-${ticket.id}`}>
                        #{ticket.ticketNumber}
                      </span>
                      <Badge className={getStatusBadgeClass(ticket.status)} data-testid={`badge-status-${ticket.id}`}>
                        {formatLabel(ticket.status)}
                      </Badge>
                      <Badge className={`text-xs ${getPriorityBadgeClass(ticket.priority)}`} data-testid={`badge-priority-${ticket.id}`}>
                        {formatLabel(ticket.priority)}
                      </Badge>
                      <Badge variant="outline" className="text-xs" data-testid={`badge-category-${ticket.id}`}>
                        {formatLabel(ticket.category)}
                      </Badge>
                    </div>
                    <p className="font-medium truncate" data-testid={`text-ticket-subject-${ticket.id}`}>
                      {ticket.subject}
                    </p>
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

function TicketDetailView({ ticketId, onBack }: { ticketId: string; onBack: () => void }) {
  const { toast } = useToast();
  const [replyMessage, setReplyMessage] = useState("");
  const [isInternal, setIsInternal] = useState(false);

  const { data: ticket, isLoading } = useQuery<TicketDetailType>({
    queryKey: ["/api/support/tickets", ticketId],
  });

  const updateTicket = useMutation({
    mutationFn: async (updates: { status?: string; priority?: string }) => {
      return await apiRequest(`/api/support/tickets/${ticketId}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
    },
    onSuccess: () => {
      toast({ title: "Ticket updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets", ticketId] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const addReply = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/support/tickets/${ticketId}/replies`, {
        method: "POST",
        body: JSON.stringify({
          message: replyMessage,
          isInternal,
        }),
      });
    },
    onSuccess: () => {
      toast({ title: "Reply added" });
      setReplyMessage("");
      setIsInternal(false);
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets", ticketId] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        Ticket not found.
      </div>
    );
  }

  const authorName = ticket.author
    ? `${ticket.author.firstName} ${ticket.author.lastName}`.trim()
    : "Unknown";
  const authorEmail = ticket.author?.email ?? "N/A";
  const tenantName = ticket.tenant?.name ?? "Unknown Tenant";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-to-tickets">
          <ArrowLeft />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground font-mono" data-testid="text-detail-ticket-number">
              #{ticket.ticketNumber}
            </span>
            <Badge className={getStatusBadgeClass(ticket.status)} data-testid="badge-detail-status">
              {formatLabel(ticket.status)}
            </Badge>
          </div>
          <h2 className="text-xl font-semibold mt-1 truncate" data-testid="text-detail-subject">
            {ticket.subject}
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap" data-testid="text-detail-description">
                {ticket.description}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Replies ({ticket.replies?.length ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {ticket.replies && ticket.replies.length > 0 ? (
                ticket.replies.map((reply) => {
                  const replyName = reply.user
                    ? `${reply.user.firstName} ${reply.user.lastName}`.trim()
                    : "System";
                  const replyInitials = reply.user
                    ? `${reply.user.firstName?.[0] ?? ""}${reply.user.lastName?.[0] ?? ""}`.toUpperCase()
                    : "S";

                  return (
                    <div
                      key={reply.id}
                      className={`rounded-md p-3 ${
                        reply.isInternal
                          ? "bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800"
                          : "bg-muted/50"
                      }`}
                      data-testid={`reply-${reply.id}`}
                    >
                      <div className="flex items-start gap-3">
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback className="text-xs">{replyInitials}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium" data-testid={`text-reply-author-${reply.id}`}>
                              {replyName}
                            </span>
                            {reply.isInternal && (
                              <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-transparent text-xs" data-testid={`badge-internal-${reply.id}`}>
                                <Eye className="h-3 w-3 mr-1" />
                                Internal
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {formatDate(reply.createdAt)}
                            </span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap" data-testid={`text-reply-message-${reply.id}`}>
                            {reply.message}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-replies">
                  No replies yet
                </p>
              )}

              <div className="border-t pt-4 space-y-3">
                <Textarea
                  placeholder="Write a reply..."
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  className="min-h-[80px]"
                  data-testid="textarea-reply"
                />
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="internal-note"
                      checked={isInternal}
                      onCheckedChange={(checked) => setIsInternal(checked === true)}
                      data-testid="checkbox-internal"
                    />
                    <Label htmlFor="internal-note" className="text-sm cursor-pointer">
                      Internal note (not visible to user)
                    </Label>
                  </div>
                  <Button
                    onClick={() => addReply.mutate()}
                    disabled={!replyMessage.trim() || addReply.isPending}
                    data-testid="button-send-reply"
                  >
                    {addReply.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    Send Reply
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Tenant</Label>
                <p className="text-sm font-medium" data-testid="text-detail-tenant">{tenantName}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Submitted By</Label>
                <p className="text-sm font-medium" data-testid="text-detail-author">{authorName}</p>
                <p className="text-xs text-muted-foreground" data-testid="text-detail-email">{authorEmail}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Category</Label>
                <div className="mt-1">
                  <Badge variant="outline" data-testid="badge-detail-category">
                    {formatLabel(ticket.category)}
                  </Badge>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Created</Label>
                <p className="text-sm" data-testid="text-detail-created">{formatDate(ticket.createdAt)}</p>
              </div>
              {ticket.resolvedAt && (
                <div>
                  <Label className="text-xs text-muted-foreground">Resolved</Label>
                  <p className="text-sm" data-testid="text-detail-resolved">{formatDate(ticket.resolvedAt)}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Status</Label>
                <Select
                  value={ticket.status}
                  onValueChange={(value) => updateTicket.mutate({ status: value })}
                >
                  <SelectTrigger data-testid="trigger-update-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">
                      <div className="flex items-center gap-2">
                        {getStatusIcon("open")}
                        Open
                      </div>
                    </SelectItem>
                    <SelectItem value="in_progress">
                      <div className="flex items-center gap-2">
                        {getStatusIcon("in_progress")}
                        In Progress
                      </div>
                    </SelectItem>
                    <SelectItem value="resolved">
                      <div className="flex items-center gap-2">
                        {getStatusIcon("resolved")}
                        Resolved
                      </div>
                    </SelectItem>
                    <SelectItem value="closed">
                      <div className="flex items-center gap-2">
                        {getStatusIcon("closed")}
                        Closed
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Priority</Label>
                <Select
                  value={ticket.priority}
                  onValueChange={(value) => updateTicket.mutate({ priority: value })}
                >
                  <SelectTrigger data-testid="trigger-update-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
