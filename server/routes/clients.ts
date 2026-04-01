import type { Express } from "express";
import { storage } from "../storage";
import { SharePointFileStorage } from "../services/sharepoint-file-storage.js";
import multer from "multer";

interface ClientRouteDeps {
  requireAuth: any;
  requireRole: (roles: string[]) => any;
  sharePointFileStorage?: InstanceType<typeof SharePointFileStorage>;
}

export function registerClientRoutes(app: Express, deps: ClientRouteDeps) {

  const sharePointFileStorage = deps.sharePointFileStorage || new SharePointFileStorage();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req: any, file: any, cb: any) => {
      const allowedMimeTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain', 'text/csv'
      ];
      if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`File type ${file.mimetype} not allowed`));
      }
    }
  });

  app.post("/api/clients/:clientId/microsoft-team", deps.requireAuth, deps.requireRole(["admin", "pm", "portfolio-manager"]), async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user?.activeTenantId || user?.primaryTenantId || user?.tenantId;
      const { clientId } = req.params;
      const { teamId, teamName } = req.body;
      if (!teamId) return res.status(400).json({ message: "teamId is required" });

      const client = await storage.getClient(clientId);
      if (!client) return res.status(404).json({ message: "Client not found" });
      if (tenantId && client.tenantId && client.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }

      let teamWebUrl: string | null = null;
      try {
        const { plannerService } = await import('../services/planner-service');
        const teamData = await plannerService.getTeam(teamId);
        teamWebUrl = teamData?.webUrl || null;
      } catch { /* non-blocking */ }

      await storage.updateClient(clientId, {
        microsoftTeamId: teamId,
        microsoftTeamName: teamName || null,
        microsoftTeamWebUrl: teamWebUrl,
      });

      const updated = await storage.getClient(clientId);
      res.json(updated);
    } catch (error: any) {
      console.error("[PLANNER] Failed to link team to client:", error);
      res.status(500).json({ message: "Failed to link team: " + error.message });
    }
  });

  app.delete("/api/clients/:clientId/microsoft-team", deps.requireAuth, deps.requireRole(["admin", "pm", "portfolio-manager"]), async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user?.activeTenantId || user?.primaryTenantId || user?.tenantId;
      const { clientId } = req.params;
      const client = await storage.getClient(clientId);
      if (!client) return res.status(404).json({ message: "Client not found" });
      if (tenantId && client.tenantId && client.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }

      await storage.updateClient(clientId, {
        microsoftTeamId: null,
        microsoftTeamName: null,
        microsoftTeamWebUrl: null,
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("[PLANNER] Failed to unlink team from client:", error);
      res.status(500).json({ message: "Failed to unlink team: " + error.message });
    }
  });

  app.post("/api/clients/:id/upload-msa", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "pm", "portfolio-manager", "executive"]), upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const client = await storage.getClient(req.params.id);
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      const tenantId = (req as any).user?.primaryTenantId || (req as any).user?.tenantId;
      if (client.tenantId && tenantId && client.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      if (client.msaDocument) {
        try {
          await sharePointFileStorage.deleteFile(client.msaDocument, tenantId);
        } catch (e) {
          console.log(`[MSA UPLOAD] No previous MSA document to delete`);
        }
      }
      const savedFile = await sharePointFileStorage.storeFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        {
          documentType: 'msa',
          clientId: client.id,
          clientName: client.name,
          createdByUserId: req.user!.id,
          metadataVersion: 1,
          tags: `msa,${client.name?.toLowerCase().replace(/\s+/g, '-')}`
        },
        req.user!.email,
        `msa-${client.id}`,
        tenantId
      );
      const updated = await storage.updateClient(client.id, {
        msaDocument: savedFile.id,
        hasMsa: true,
      });
      res.json({
        message: "MSA document uploaded successfully",
        client: updated,
        file: { id: savedFile.id, name: savedFile.fileName, size: savedFile.size }
      });
    } catch (error: any) {
      console.error("[MSA UPLOAD] Error:", error);
      res.status(500).json({ message: error.message || "Failed to upload MSA document" });
    }
  });

  app.get("/api/clients/:id/download-msa", deps.requireAuth, async (req, res) => {
    try {
      const client = await storage.getClient(req.params.id);
      if (!client) return res.status(404).json({ message: "Client not found" });
      const tenantId = (req as any).user?.primaryTenantId || (req as any).user?.tenantId;
      if (client.tenantId && tenantId && client.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      if (!client.msaDocument) return res.status(404).json({ message: "No MSA document attached to this client" });
      const fileData = await sharePointFileStorage.getFileContent(client.msaDocument, tenantId);
      if (!fileData) return res.status(404).json({ message: "MSA document not found in storage" });
      const msaClientId = fileData.metadata.metadata.clientId;
      if (msaClientId && msaClientId !== req.params.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      res.setHeader('Content-Type', fileData.metadata.contentType);
      const msaFileName = fileData.metadata.originalName || fileData.metadata.fileName || `MSA_${client.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
      res.setHeader('Content-Disposition', `attachment; filename="${msaFileName.replace(/"/g, '_')}"`);
      res.send(fileData.buffer);
    } catch (error: any) {
      console.error("[MSA DOWNLOAD] Error:", error);
      res.status(500).json({ message: "Failed to download MSA document" });
    }
  });

  app.post("/api/clients/:id/upload-nda", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "pm", "portfolio-manager", "executive"]), upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const client = await storage.getClient(req.params.id);
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      const tenantId = (req as any).user?.primaryTenantId || (req as any).user?.tenantId;
      if (client.tenantId && tenantId && client.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      if (client.ndaDocument) {
        try {
          await sharePointFileStorage.deleteFile(client.ndaDocument, tenantId);
        } catch (e) {
          console.log(`[NDA UPLOAD] No previous NDA document to delete`);
        }
      }
      const savedFile = await sharePointFileStorage.storeFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        {
          documentType: 'nda',
          clientId: client.id,
          clientName: client.name,
          createdByUserId: req.user!.id,
          metadataVersion: 1,
          tags: `nda,${client.name?.toLowerCase().replace(/\s+/g, '-')}`
        },
        req.user!.email,
        `nda-${client.id}`,
        tenantId
      );
      const updated = await storage.updateClient(client.id, {
        ndaDocument: savedFile.id,
        hasNda: true,
      });
      res.json({
        message: "NDA document uploaded successfully",
        client: updated,
        file: { id: savedFile.id, name: savedFile.fileName, size: savedFile.size }
      });
    } catch (error: any) {
      console.error("[NDA UPLOAD] Error:", error);
      res.status(500).json({ message: error.message || "Failed to upload NDA document" });
    }
  });

  app.get("/api/clients/:id/download-nda", deps.requireAuth, async (req, res) => {
    try {
      const client = await storage.getClient(req.params.id);
      if (!client) return res.status(404).json({ message: "Client not found" });
      const tenantId = (req as any).user?.primaryTenantId || (req as any).user?.tenantId;
      if (client.tenantId && tenantId && client.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      if (!client.ndaDocument) return res.status(404).json({ message: "No NDA document attached to this client" });
      const fileData = await sharePointFileStorage.getFileContent(client.ndaDocument, tenantId);
      if (!fileData) return res.status(404).json({ message: "NDA document not found in storage" });
      const ndaClientId = fileData.metadata.metadata.clientId;
      if (ndaClientId && ndaClientId !== req.params.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      res.setHeader('Content-Type', fileData.metadata.contentType);
      const ndaFileName = fileData.metadata.originalName || fileData.metadata.fileName || `NDA_${client.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
      res.setHeader('Content-Disposition', `attachment; filename="${ndaFileName.replace(/"/g, '_')}"`);
      res.send(fileData.buffer);
    } catch (error: any) {
      console.error("[NDA DOWNLOAD] Error:", error);
      res.status(500).json({ message: "Failed to download NDA document" });
    }
  });

  app.get("/api/clients/:id/documents", deps.requireAuth, async (req, res) => {
    try {
      const client = await storage.getClient(req.params.id);
      if (!client) return res.status(404).json({ message: "Client not found" });
      const tenantId = (req as any).user?.primaryTenantId || (req as any).user?.tenantId;
      if (client.tenantId && tenantId && client.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const files = await sharePointFileStorage.listFiles({ clientId: req.params.id }, tenantId);
      res.json(files);
    } catch (error: any) {
      console.error("[CLIENT DOCUMENTS] Error:", error);
      res.status(500).json({ message: "Failed to list client documents" });
    }
  });

  app.get("/api/clients/:id/documents/:fileId/download", deps.requireAuth, async (req, res) => {
    try {
      const client = await storage.getClient(req.params.id);
      if (!client) return res.status(404).json({ message: "Client not found" });
      const tenantId = (req as any).user?.primaryTenantId || (req as any).user?.tenantId;
      if (client.tenantId && tenantId && client.tenantId !== tenantId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const fileData = await sharePointFileStorage.getFileContent(req.params.fileId, tenantId);
      if (!fileData) return res.status(404).json({ message: "Document not found in storage" });
      const storedFile = fileData.metadata;
      if (storedFile.metadata.clientId !== req.params.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      res.setHeader('Content-Type', storedFile.contentType);
      const displayName = storedFile.originalName || storedFile.fileName || 'document';
      res.setHeader('Content-Disposition', `attachment; filename="${displayName.replace(/"/g, '_')}"`);
      res.send(fileData.buffer);
    } catch (error: any) {
      console.error("[CLIENT DOC DOWNLOAD] Error:", error);
      res.status(500).json({ message: "Failed to download document" });
    }
  });

}
