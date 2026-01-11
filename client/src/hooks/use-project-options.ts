import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Project, Client } from "@shared/schema";
import { formatProjectLabel as formatLabel, getClientShortName } from "@/lib/project-utils";

type ProjectWithClient = Project & { client: Client };

export interface ProjectOption {
  value: string;
  label: string;
  projectName: string;
  clientName: string;
  clientShortName: string;
  status: string;
}

interface UseProjectOptionsParams {
  includeArchived?: boolean;
  defaultToActive?: boolean;
}

export function useProjectOptions(params: UseProjectOptionsParams = {}) {
  const { includeArchived = false, defaultToActive = true } = params;

  const { data: projects = [], isLoading } = useQuery<ProjectWithClient[]>({
    queryKey: ["/api/projects"],
  });

  const projectOptions = useMemo<ProjectOption[]>(() => {
    let filtered = projects;
    
    if (defaultToActive && !includeArchived) {
      filtered = projects.filter(p => p.status === 'active');
    } else if (!includeArchived) {
      filtered = projects.filter(p => p.status !== 'closed' && p.status !== 'archived');
    }

    return filtered
      .map(project => {
        const clientShortName = getClientShortName(project.client);
        return {
          value: project.id,
          label: formatLabel(project),
          projectName: project.name,
          clientName: project.client?.name || 'Unknown',
          clientShortName,
          status: project.status,
        };
      })
      .sort((a, b) => {
        const clientCompare = a.clientShortName.localeCompare(b.clientShortName);
        if (clientCompare !== 0) return clientCompare;
        return a.projectName.localeCompare(b.projectName);
      });
  }, [projects, includeArchived, defaultToActive]);

  const activeProjects = useMemo<ProjectOption[]>(() => 
    projectOptions.filter(p => p.status === 'active'),
    [projectOptions]
  );

  const getProjectById = (projectId: string): ProjectOption | undefined => 
    projectOptions.find(p => p.value === projectId);

  const formatProjectLabel = (projectId: string): string => {
    const project = getProjectById(projectId);
    return project?.label || projectId;
  };

  return {
    projectOptions,
    activeProjects,
    isLoading,
    getProjectById,
    formatProjectLabel,
  };
}
