import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { AssignmentCommercialBucket } from "@/lib/assignment-commercial-buckets";

export function useAssignmentCommercialBuckets(projectId: string | undefined) {
  return useQuery<{ buckets: AssignmentCommercialBucket[]; required: boolean }>({
    queryKey: ["/api/projects", projectId, "commercial-buckets"],
    queryFn: () => apiRequest(`/api/projects/${projectId}/commercial-buckets`),
    enabled: !!projectId,
  });
}
