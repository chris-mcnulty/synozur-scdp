import { db } from "../db";
import type { IStorage } from "./index";
import { eq, and, desc } from "drizzle-orm";
import {
  agentConversations,
  agentMessages,
  agentActions,
  type AgentConversation,
  type AgentMessage,
  type AgentAction,
  type InsertAgentConversation,
  type InsertAgentMessage,
  type InsertAgentAction,
} from "@shared/schema";

export const agentMethods: ThisType<IStorage> = {
  async createAgentConversation(data: InsertAgentConversation): Promise<AgentConversation> {
    const [created] = await db.insert(agentConversations).values(data).returning();
    return created;
  },

  async getAgentConversation(id: string): Promise<AgentConversation | undefined> {
    const [row] = await db.select().from(agentConversations).where(eq(agentConversations.id, id));
    return row;
  },

  async getAgentConversationsForProject(projectId: string, userId?: string): Promise<AgentConversation[]> {
    const conds = [eq(agentConversations.projectId, projectId)];
    if (userId) conds.push(eq(agentConversations.userId, userId));
    return db.select().from(agentConversations).where(and(...conds)).orderBy(desc(agentConversations.updatedAt));
  },

  async touchAgentConversation(id: string, title?: string): Promise<void> {
    await db.update(agentConversations)
      .set({ updatedAt: new Date(), ...(title ? { title } : {}) })
      .where(eq(agentConversations.id, id));
  },

  async createAgentMessage(data: InsertAgentMessage): Promise<AgentMessage> {
    // The jsonb $type<>() declaration forces an over-tight tuple inference;
    // we cast the single field rather than the whole row to keep type safety
    // on every other field.
    const toolCalls = (data.toolCalls ?? null) as typeof agentMessages.$inferInsert.toolCalls;
    const [created] = await db.insert(agentMessages).values({
      ...data,
      toolCalls,
    }).returning();
    return created;
  },

  async getAgentMessages(conversationId: string): Promise<AgentMessage[]> {
    return db.select().from(agentMessages)
      .where(eq(agentMessages.conversationId, conversationId))
      .orderBy(agentMessages.createdAt);
  },

  async createAgentAction(data: InsertAgentAction): Promise<AgentAction> {
    const [created] = await db.insert(agentActions).values(data).returning();
    return created;
  },

  async getAgentAction(id: string): Promise<AgentAction | undefined> {
    const [row] = await db.select().from(agentActions).where(eq(agentActions.id, id));
    return row;
  },

  async getAgentActionsForConversation(conversationId: string): Promise<AgentAction[]> {
    return db.select().from(agentActions)
      .where(eq(agentActions.conversationId, conversationId))
      .orderBy(agentActions.createdAt);
  },

  async getAgentActionsForProject(projectId: string, limit: number = 100): Promise<AgentAction[]> {
    return db.select().from(agentActions)
      .where(eq(agentActions.projectId, projectId))
      .orderBy(desc(agentActions.createdAt))
      .limit(limit);
  },

  async updateAgentAction(id: string, patch: Partial<AgentAction>): Promise<AgentAction> {
    const [updated] = await db.update(agentActions)
      .set(patch)
      .where(eq(agentActions.id, id))
      .returning();
    return updated;
  },
};
