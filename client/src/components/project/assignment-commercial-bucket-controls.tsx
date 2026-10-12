import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ASSIGNMENT_BUCKET_HELP, NO_ASSIGNMENT_BUCKET, assignmentBucketLabel,
  assignmentBucketWindowWarning, type AssignmentCommercialBucket,
} from "@/lib/assignment-commercial-buckets";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface BucketSelectProps {
  buckets: AssignmentCommercialBucket[];
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  testId: string;
}

export function AssignmentBucketSelect({ buckets, value, onChange, disabled, testId }: BucketSelectProps) {
  const unavailable = value && !buckets.some(bucket => bucket.id === value);
  return (
    <Select value={value === undefined ? "" : value || "none"} onValueChange={next => {
      // Radix's form bridge can emit an empty native-select value on mount.
      // That is not an operator's explicit clear or a valid new mapping.
      if (next === "none") onChange(null);
      else if (buckets.some(bucket => bucket.id === next && bucket.isActive)) onChange(next);
    }} disabled={disabled}>
      <SelectTrigger id={testId} aria-label="Commercial bucket" data-testid={testId}>
        <SelectValue placeholder="Choose a mapping" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{NO_ASSIGNMENT_BUCKET}</SelectItem>
        {buckets.filter(bucket => bucket.isActive || bucket.id === value).map(bucket => (
          <SelectItem key={bucket.id} value={bucket.id} disabled={!bucket.isActive}>
            {assignmentBucketLabel(bucket.id, buckets)}
          </SelectItem>
        ))}
        {unavailable && <SelectItem value={value} disabled>{assignmentBucketLabel(value, buckets)}</SelectItem>}
      </SelectContent>
    </Select>
  );
}

export function AssignmentBucketField({ buckets, value, onChange, disabled, start, end }: Omit<BucketSelectProps, "testId"> & { start: string; end: string }) {
  const warning = assignmentBucketWindowWarning(buckets.find(bucket => bucket.id === value), start, end);
  if (!buckets.length) return null;
  return (
    <div className="space-y-2">
      <Label htmlFor="select-assignment-commercial-bucket">Commercial bucket (optional)</Label>
      <AssignmentBucketSelect buckets={buckets} value={value} onChange={onChange} disabled={disabled} testId="select-assignment-commercial-bucket" />
      <p className="text-xs text-muted-foreground">{ASSIGNMENT_BUCKET_HELP}</p>
      {warning && <p role="status" className="text-xs text-amber-700 dark:text-amber-400">{warning}</p>}
    </div>
  );
}

export interface BucketAssignment {
  id: string;
  commercialBucketId?: string | null;
  taskDescription?: string | null;
  resourceName?: string | null;
  person?: { name: string } | null;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
}

export function BulkAssignmentBucketControl({ projectId, buckets, assignments, onSaved }: {
  projectId: string;
  buckets: AssignmentCommercialBucket[];
  assignments: BucketAssignment[];
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string | null | undefined>(undefined);
  const [snapshot, setSnapshot] = useState<BucketAssignment[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const validTarget = target === null || buckets.some(bucket => bucket.id === target && bucket.isActive);
  const mutation = useMutation({
    mutationFn: (data: { ids: string[]; commercialBucketId: string | null }) => apiRequest(
      `/api/projects/${projectId}/allocations/commercial-bucket`,
      { method: "PUT", body: JSON.stringify(data) },
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/allocations`] });
      setOpen(false);
      onSaved();
      toast({ title: "Commercial mappings updated", description: "Assignment dates, status, and existing time classifications were not changed." });
    },
    onError: (error: Error) => setFailure(error.message || "Could not update mappings. Retry after reviewing the selection."),
  });
  if (!buckets.length) return null;
  return (
    <>
      <Button size="sm" variant="outline" disabled={!assignments.length} data-testid="button-bulk-assignment-bucket" onClick={() => {
        setSnapshot(assignments.map(assignment => ({ ...assignment })));
        setTarget(undefined); setReviewing(false); setFailure(null); setOpen(true);
      }}>Change commercial bucket</Button>
      <Dialog open={open} onOpenChange={next => { if (!mutation.isPending) setOpen(next); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{reviewing ? "Confirm commercial mappings" : "Change commercial bucket"}</DialogTitle>
            <DialogDescription>
              {snapshot.length} selected assignment{snapshot.length === 1 ? "" : "s"}. Only the commercial mapping changes; dates, status, and existing time classifications stay unchanged.
            </DialogDescription>
          </DialogHeader>
          {!reviewing ? (
            <div className="space-y-2">
              <Label>New mapping (optional bucket)</Label>
              <AssignmentBucketSelect buckets={buckets} value={target} onChange={setTarget} testId="select-bulk-assignment-commercial-bucket" />
              <p className="text-xs text-muted-foreground">{ASSIGNMENT_BUCKET_HELP}</p>
            </div>
          ) : (
            <div className="max-h-[50dvh] overflow-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Assignment / resource</TableHead><TableHead>Before</TableHead><TableHead>After</TableHead></TableRow></TableHeader>
                <TableBody>{snapshot.map(assignment => {
                  const warning = assignmentBucketWindowWarning(buckets.find(bucket => bucket.id === target), assignment.plannedStartDate, assignment.plannedEndDate);
                  return <TableRow key={assignment.id}>
                    <TableCell>
                      <p>{assignment.taskDescription || assignment.id}</p>
                      <p className="text-xs text-muted-foreground">{assignment.person?.name || assignment.resourceName || "Unassigned"}</p>
                      {warning && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{warning}</p>}
                    </TableCell>
                    <TableCell>{assignmentBucketLabel(assignment.commercialBucketId, buckets)}</TableCell>
                    <TableCell>{assignmentBucketLabel(target, buckets)}</TableCell>
                  </TableRow>;
                })}</TableBody>
              </Table>
            </div>
          )}
          {!validTarget && reviewing && <p role="alert" className="text-sm text-destructive">This bucket is no longer available. Choose another mapping.</p>}
          {failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}
          <DialogFooter>
            <Button variant="outline" disabled={mutation.isPending} onClick={() => setOpen(false)}>Cancel</Button>
            {reviewing ? <>
              <Button variant="outline" disabled={mutation.isPending} onClick={() => { setReviewing(false); setFailure(null); }}>Back</Button>
              <Button data-testid="button-confirm-assignment-bucket" disabled={mutation.isPending || !validTarget} onClick={() => {
                if (target === undefined || !validTarget) return;
                setFailure(null);
                mutation.mutate({ ids: snapshot.map(assignment => assignment.id), commercialBucketId: target });
              }}>{mutation.isPending ? "Saving mappings…" : failure ? "Retry update" : "Confirm update"}</Button>
            </> : <Button disabled={!validTarget || !snapshot.length} data-testid="button-review-assignment-bucket" onClick={() => setReviewing(true)}>Review changes</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
