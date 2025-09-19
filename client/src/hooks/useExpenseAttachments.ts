import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { type ExpenseAttachment } from "@shared/schema";

// File validation constants
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes
export const ALLOWED_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'application/pdf'
];

export const ALLOWED_FILE_EXTENSIONS = [
  '.jpg',
  '.jpeg', 
  '.png',
  '.heic',
  '.heif',
  '.pdf'
];

// Error types for better error handling
export interface AttachmentError {
  message: string;
  type: 'validation' | 'rate_limit' | 'sharepoint' | 'network' | 'server';
  details?: string[];
}

// File validation utilities
export const validateFile = (file: File): { isValid: boolean; error?: AttachmentError } => {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      isValid: false,
      error: {
        message: `File size must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        type: 'validation'
      }
    };
  }

  // Check file type
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return {
      isValid: false,
      error: {
        message: 'File type not allowed. Please upload images (JPG, PNG, HEIC, HEIF) or PDF files only.',
        type: 'validation'
      }
    };
  }

  // Check file extension
  const extension = '.' + file.name.split('.').pop()?.toLowerCase();
  if (!ALLOWED_FILE_EXTENSIONS.includes(extension)) {
    return {
      isValid: false,
      error: {
        message: 'File extension not allowed. Please use .jpg, .jpeg, .png, .heic, .heif, or .pdf files.',
        type: 'validation'
      }
    };
  }

  // Check for empty file
  if (file.size === 0) {
    return {
      isValid: false,
      error: {
        message: 'File cannot be empty',
        type: 'validation'
      }
    };
  }

  return { isValid: true };
};

export const validateMultipleFiles = (files: FileList | File[]): { isValid: boolean; errors?: AttachmentError[] } => {
  const fileArray = Array.from(files);
  const errors: AttachmentError[] = [];

  // Check individual files
  fileArray.forEach((file, index) => {
    const validation = validateFile(file);
    if (!validation.isValid && validation.error) {
      errors.push({
        ...validation.error,
        message: `File ${index + 1} (${file.name}): ${validation.error.message}`
      });
    }
  });

  return {
    isValid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined
  };
};

// Parse API error to AttachmentError
const parseApiError = (error: Error): AttachmentError => {
  const errorMessage = error.message.toLowerCase();
  
  if (errorMessage.includes('429')) {
    return {
      message: 'Too many requests. Please wait a moment before uploading again.',
      type: 'rate_limit'
    };
  }
  
  if (errorMessage.includes('sharepoint')) {
    return {
      message: 'SharePoint service temporarily unavailable. Please try again later.',
      type: 'sharepoint'
    };
  }
  
  if (errorMessage.includes('file size') || errorMessage.includes('invalid file')) {
    return {
      message: error.message,
      type: 'validation'
    };
  }
  
  if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
    return {
      message: 'Network error. Please check your connection and try again.',
      type: 'network'
    };
  }
  
  return {
    message: error.message || 'An unexpected error occurred',
    type: 'server'
  };
};

// Query key factories following URL hierarchy pattern
const expenseAttachmentKeys = {
  all: ['/api/expenses'] as const,
  lists: () => [...expenseAttachmentKeys.all, 'attachments'] as const,
  list: (expenseId: string) => ['/api/expenses', expenseId, 'attachments'] as const,
  detail: (expenseId: string, attachmentId: string) => ['/api/expenses', expenseId, 'attachments', attachmentId] as const,
};

// Hook to list attachments for an expense
export const useExpenseAttachments = (expenseId: string) => {
  return useQuery<ExpenseAttachment[], AttachmentError>({
    queryKey: expenseAttachmentKeys.list(expenseId),
    enabled: !!expenseId,
  });
};

// Hook to upload expense attachment
export const useUploadExpenseAttachment = (expenseId: string) => {
  const queryClient = useQueryClient();
  
  return useMutation<
    ExpenseAttachment, 
    AttachmentError, 
    File,
    { previousAttachments?: ExpenseAttachment[]; tempId?: string }
  >({
    mutationFn: async (file: File) => {
      // Validate file before upload
      const validation = validateFile(file);
      if (!validation.isValid && validation.error) {
        throw validation.error;
      }

      // Create FormData for multipart/form-data upload
      const formData = new FormData();
      formData.append('file', file);

      try {
        // Use fetch directly for FormData uploads (apiRequest adds JSON Content-Type)
        const response = await fetch(`/api/expenses/${expenseId}/attachments`, {
          method: 'POST',
          body: formData,
          credentials: 'include',
          headers: {
            // Don't set Content-Type - let browser set it with boundary for multipart/form-data
            'X-Session-Id': localStorage.getItem('sessionId') || '',
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`${response.status}: ${errorText}`);
        }

        return await response.json();
      } catch (error) {
        throw parseApiError(error as Error);
      }
    },
    onMutate: async (file) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: expenseAttachmentKeys.list(expenseId) });

      // Snapshot the previous value
      const previousAttachments = queryClient.getQueryData<ExpenseAttachment[]>(
        expenseAttachmentKeys.list(expenseId)
      );

      // Optimistically update with temporary attachment
      const tempId = `temp-${Date.now()}`;
      const optimisticAttachment: ExpenseAttachment = {
        id: tempId,
        expenseId,
        fileName: file.name,
        contentType: file.type,
        size: file.size,
        driveId: 'pending',
        itemId: 'pending',
        webUrl: 'pending',
        createdByUserId: 'current-user',
        createdAt: new Date(),
      };

      queryClient.setQueryData<ExpenseAttachment[]>(
        expenseAttachmentKeys.list(expenseId),
        (old) => [...(old || []), optimisticAttachment]
      );

      return { previousAttachments, tempId };
    },
    onError: (error, file, context) => {
      // Rollback optimistic update on error
      if (context?.previousAttachments) {
        queryClient.setQueryData(
          expenseAttachmentKeys.list(expenseId),
          context.previousAttachments
        );
      }
    },
    onSuccess: (newAttachment, file, context) => {
      // Replace temporary attachment with real one
      queryClient.setQueryData<ExpenseAttachment[]>(
        expenseAttachmentKeys.list(expenseId),
        (old) => {
          if (!old) return [newAttachment];
          return old.map(attachment => 
            attachment.id === context?.tempId ? newAttachment : attachment
          );
        }
      );

      // Invalidate queries to ensure fresh data
      queryClient.invalidateQueries({ queryKey: expenseAttachmentKeys.list(expenseId) });
    },
  });
};

// Hook to download attachment
export const useDownloadExpenseAttachment = () => {
  return useMutation<void, AttachmentError, { expenseId: string; attachmentId: string; fileName: string }>({
    mutationFn: async ({ expenseId, attachmentId, fileName }) => {
      try {
        const response = await fetch(`/api/expenses/${expenseId}/attachments/${attachmentId}/content`, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'X-Session-Id': localStorage.getItem('sessionId') || '',
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`${response.status}: ${errorText}`);
        }

        // Create blob and download
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } catch (error) {
        throw parseApiError(error as Error);
      }
    },
  });
};

// Hook to delete attachment
export const useDeleteExpenseAttachment = (expenseId: string) => {
  const queryClient = useQueryClient();
  
  return useMutation<
    void, 
    AttachmentError, 
    string,
    { previousAttachments?: ExpenseAttachment[] }
  >({
    mutationFn: async (attachmentId: string) => {
      try {
        await apiRequest(`/api/expenses/${expenseId}/attachments/${attachmentId}`, {
          method: 'DELETE',
        });
      } catch (error) {
        throw parseApiError(error as Error);
      }
    },
    onMutate: async (attachmentId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: expenseAttachmentKeys.list(expenseId) });

      // Snapshot the previous value
      const previousAttachments = queryClient.getQueryData<ExpenseAttachment[]>(
        expenseAttachmentKeys.list(expenseId)
      );

      // Optimistically remove the attachment
      queryClient.setQueryData<ExpenseAttachment[]>(
        expenseAttachmentKeys.list(expenseId),
        (old) => old?.filter(attachment => attachment.id !== attachmentId) || []
      );

      return { previousAttachments };
    },
    onError: (error, attachmentId, context) => {
      // Rollback optimistic update on error
      if (context?.previousAttachments) {
        queryClient.setQueryData(
          expenseAttachmentKeys.list(expenseId),
          context.previousAttachments
        );
      }
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: expenseAttachmentKeys.list(expenseId) });
    },
  });
};

// Enhanced batch upload with partial success handling and rollback
export const useBatchUploadExpenseAttachments = (expenseId: string) => {
  const queryClient = useQueryClient();
  
  return useMutation<
    { 
      successful: ExpenseAttachment[];
      failed: { file: File; error: AttachmentError }[];
      totalUploaded: number;
    }, 
    AttachmentError, 
    File[],
    { previousAttachments?: ExpenseAttachment[]; tempIds?: string[] }
  >({
    mutationFn: async (files: File[]) => {
      // Validate all files first
      const validation = validateMultipleFiles(files);
      if (!validation.isValid && validation.errors) {
        throw {
          message: 'Multiple file validation errors',
          type: 'validation' as const,
          details: validation.errors.map(e => e.message)
        };
      }

      const successful: ExpenseAttachment[] = [];
      const failed: { file: File; error: AttachmentError }[] = [];

      // Process files sequentially for better error handling
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const formData = new FormData();
          formData.append('file', file);

          const response = await fetch(`/api/expenses/${expenseId}/attachments`, {
            method: 'POST',
            body: formData,
            credentials: 'include',
            headers: {
              'X-Session-Id': localStorage.getItem('sessionId') || '',
            },
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`${response.status}: ${errorText}`);
          }

          const result = await response.json();
          successful.push(result);
        } catch (error) {
          failed.push({ 
            file, 
            error: parseApiError(error as Error) 
          });
        }
      }

      // Return results even if some failed
      return {
        successful,
        failed,
        totalUploaded: successful.length
      };
    },
    onMutate: async (files) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: expenseAttachmentKeys.list(expenseId) });

      // Snapshot the previous value
      const previousAttachments = queryClient.getQueryData<ExpenseAttachment[]>(
        expenseAttachmentKeys.list(expenseId)
      );

      // Create optimistic updates for all files
      const tempIds = files.map((_, index) => `temp-batch-${Date.now()}-${index}`);
      const optimisticAttachments: ExpenseAttachment[] = files.map((file, index) => ({
        id: tempIds[index],
        expenseId,
        fileName: file.name,
        contentType: file.type,
        size: file.size,
        driveId: 'pending',
        itemId: 'pending',
        webUrl: 'pending',
        createdByUserId: 'current-user',
        createdAt: new Date(),
      }));

      queryClient.setQueryData<ExpenseAttachment[]>(
        expenseAttachmentKeys.list(expenseId),
        (old) => [...(old || []), ...optimisticAttachments]
      );

      return { previousAttachments, tempIds };
    },
    onError: (error, files, context) => {
      // Rollback all optimistic updates on complete failure
      if (context?.previousAttachments) {
        queryClient.setQueryData(
          expenseAttachmentKeys.list(expenseId),
          context.previousAttachments
        );
      }
    },
    onSuccess: (result, files, context) => {
      // Replace temp attachments with successful ones, remove failed ones
      queryClient.setQueryData<ExpenseAttachment[]>(
        expenseAttachmentKeys.list(expenseId),
        (old) => {
          if (!old) return result.successful;
          
          // Remove all temp attachments
          let updated = old.filter(attachment => 
            !context?.tempIds?.includes(attachment.id)
          );
          
          // Add successful uploads
          updated = [...updated, ...result.successful];
          
          return updated;
        }
      );

      // Always invalidate to ensure fresh data
      queryClient.invalidateQueries({ queryKey: expenseAttachmentKeys.list(expenseId) });
    },
  });
};

// Hook for attachment preview/metadata
export const useAttachmentPreview = (attachment: ExpenseAttachment) => {
  const isImage = attachment.contentType.startsWith('image/');
  const isPdf = attachment.contentType === 'application/pdf';
  
  const getPreviewUrl = () => {
    if (isImage || isPdf) {
      return `/api/expenses/${attachment.expenseId}/attachments/${attachment.id}/content`;
    }
    return null;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return {
    isImage,
    isPdf,
    canPreview: isImage || isPdf,
    previewUrl: getPreviewUrl(),
    formattedSize: formatFileSize(attachment.size),
    fileExtension: attachment.fileName.split('.').pop()?.toUpperCase() || 'FILE',
  };
};