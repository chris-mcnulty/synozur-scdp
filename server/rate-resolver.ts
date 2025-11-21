import { db } from "./db";
import { 
  estimateRateOverrides,
  clientRateOverrides,
  estimateLineItems,
  estimates,
  users, 
  roles,
  type EstimateLineItem,
  type EstimateRateOverride,
  type ClientRateOverride,
  type User,
  type Role
} from "@shared/schema";
import { eq, and, lte, or, isNull, inArray, gte, desc } from "drizzle-orm";

export type RatePrecedence = 
  | 'manual_override'      // Highest: Manual inline edit on line item
  | 'estimate_override'    // Estimate-level rate override
  | 'client_override'      // Client-level rate override (default for all estimates)
  | 'user_default'         // User's default rate
  | 'role_default'         // Role's default rate
  | 'none';                // No rate found

export interface EffectiveRate {
  billingRate: number | null;
  costRate: number | null;
  precedence: RatePrecedence;
  source: string; // Human-readable description of rate source
  overrideId?: string; // ID of the override if applicable
}

export class RateResolver {
  /**
   * Resolve the effective rates for a line item or resource assignment
   * @param estimateId The estimate ID
   * @param lineItemId Optional line item ID (if resolving for existing line item)
   * @param userId Optional user ID (if assigned to a specific person)
   * @param roleId Optional role ID (if assigned to a role)
   * @param effectiveDate The date to check rate overrides (defaults to today)
   * @returns The effective rates with precedence information
   */
  static async resolveRates(params: {
    estimateId: string;
    lineItemId?: string;
    userId?: string;
    roleId?: string;
    effectiveDate?: Date;
  }): Promise<EffectiveRate> {
    const { estimateId, lineItemId, userId, roleId, effectiveDate = new Date() } = params;

    // 1. Check for manual override on the line item (highest precedence)
    if (lineItemId) {
      const [lineItem] = await db.select()
        .from(estimateLineItems)
        .where(eq(estimateLineItems.id, lineItemId));
      
      if (lineItem?.hasManualRateOverride) {
        return {
          billingRate: lineItem.rate ? Number(lineItem.rate) : null,
          costRate: lineItem.costRate ? Number(lineItem.costRate) : null,
          precedence: 'manual_override',
          source: 'Manual inline edit'
        };
      }
    }

    // 2. Check for estimate-level rate override
    const estimateOverride = await this.findEstimateOverride({
      estimateId,
      lineItemId,
      userId,
      roleId,
      effectiveDate
    });

    if (estimateOverride) {
      const sourceType = estimateOverride.subjectType === 'person' ? 'person' : 'role';
      return {
        billingRate: estimateOverride.billingRate ? Number(estimateOverride.billingRate) : null,
        costRate: estimateOverride.costRate ? Number(estimateOverride.costRate) : null,
        precedence: 'estimate_override',
        source: `Estimate override (${sourceType})`,
        overrideId: estimateOverride.id
      };
    }

    // 3. Check for client-level rate override
    // Get the client ID from the estimate
    const [estimate] = await db.select()
      .from(estimates)
      .where(eq(estimates.id, estimateId));
    
    if (estimate?.clientId) {
      const clientOverride = await this.findClientOverride({
        clientId: estimate.clientId,
        userId,
        roleId,
        effectiveDate
      });

      // Client overrides only apply to estimates created AFTER the override was established
      // This prevents retroactive application to existing estimates
      if (clientOverride) {
        const estimateCreatedAt = new Date(estimate.createdAt);
        const overrideEffectiveStart = new Date(clientOverride.effectiveStart);
        
        // Only use the override if the estimate was created on or after the override's effective start date
        if (estimateCreatedAt >= overrideEffectiveStart) {
          const sourceType = clientOverride.subjectType === 'person' ? 'person' : 'role';
          return {
            billingRate: clientOverride.billingRate ? Number(clientOverride.billingRate) : null,
            costRate: clientOverride.costRate ? Number(clientOverride.costRate) : null,
            precedence: 'client_override',
            source: `Client override (${sourceType})`,
            overrideId: clientOverride.id
          };
        }
      }
    }

    // 4. Check for user default rates
    if (userId) {
      const [user] = await db.select()
        .from(users)
        .where(eq(users.id, userId));
      
      if (user && (user.defaultBillingRate || user.defaultCostRate)) {
        return {
          billingRate: user.defaultBillingRate ? Number(user.defaultBillingRate) : null,
          costRate: user.defaultCostRate ? Number(user.defaultCostRate) : null,
          precedence: 'user_default',
          source: `User default (${user.name})`
        };
      }
    }

    // 5. Check for role default rates (lowest precedence)
    if (roleId) {
      const [role] = await db.select()
        .from(roles)
        .where(eq(roles.id, roleId));
      
      if (role && role.defaultRackRate) {
        return {
          billingRate: Number(role.defaultRackRate),
          costRate: null, // Roles don't have separate cost rates
          precedence: 'role_default',
          source: `Role default (${role.name})`
        };
      }
    }

    // No rates found
    return {
      billingRate: null,
      costRate: null,
      precedence: 'none',
      source: 'No rates configured'
    };
  }

  /**
   * Find applicable estimate-level rate override
   * Checks for person-specific override first, then role-based override
   */
  private static async findEstimateOverride(params: {
    estimateId: string;
    lineItemId?: string;
    userId?: string;
    roleId?: string;
    effectiveDate: Date;
  }): Promise<EstimateRateOverride | null> {
    const { estimateId, lineItemId, userId, roleId, effectiveDate } = params;

    // Build conditions for date range check
    const dateConditions = and(
      lte(estimateRateOverrides.effectiveStart, effectiveDate.toISOString().split('T')[0]),
      or(
        isNull(estimateRateOverrides.effectiveEnd),
        gte(estimateRateOverrides.effectiveEnd, effectiveDate.toISOString().split('T')[0])
      )
    );

    // Try person-specific override first (higher precedence)
    if (userId) {
      const personOverrides = await db.select()
        .from(estimateRateOverrides)
        .where(and(
          eq(estimateRateOverrides.estimateId, estimateId),
          eq(estimateRateOverrides.subjectType, 'person'),
          eq(estimateRateOverrides.subjectId, userId),
          dateConditions as any
        ));

      // Filter by line item if specified
      const applicable = personOverrides.find(override => {
        if (!lineItemId) return true; // No line item specified, use general override
        if (!override.lineItemIds || override.lineItemIds.length === 0) return true; // General override applies to all
        return override.lineItemIds.includes(lineItemId); // Check if line item is in list
      });

      if (applicable) return applicable;
    }

    // Try role-based override
    if (roleId) {
      const roleOverrides = await db.select()
        .from(estimateRateOverrides)
        .where(and(
          eq(estimateRateOverrides.estimateId, estimateId),
          eq(estimateRateOverrides.subjectType, 'role'),
          eq(estimateRateOverrides.subjectId, roleId),
          dateConditions as any
        ));

      // Filter by line item if specified
      const applicable = roleOverrides.find(override => {
        if (!lineItemId) return true;
        if (!override.lineItemIds || override.lineItemIds.length === 0) return true;
        return override.lineItemIds.includes(lineItemId);
      });

      if (applicable) return applicable;
    }

    return null;
  }

  /**
   * Find applicable client-level rate override
   * Checks for person-specific override first, then role-based override
   */
  private static async findClientOverride(params: {
    clientId: string;
    userId?: string;
    roleId?: string;
    effectiveDate: Date;
  }): Promise<ClientRateOverride | null> {
    const { clientId, userId, roleId, effectiveDate } = params;

    // Build conditions for date range check
    const dateConditions = and(
      lte(clientRateOverrides.effectiveStart, effectiveDate.toISOString().split('T')[0]),
      or(
        isNull(clientRateOverrides.effectiveEnd),
        gte(clientRateOverrides.effectiveEnd, effectiveDate.toISOString().split('T')[0])
      )
    );

    // Try person-specific override first (higher precedence)
    if (userId) {
      const personOverrides = await db.select()
        .from(clientRateOverrides)
        .where(and(
          eq(clientRateOverrides.clientId, clientId),
          eq(clientRateOverrides.subjectType, 'person'),
          eq(clientRateOverrides.subjectId, userId),
          dateConditions as any
        ))
        .orderBy(desc(clientRateOverrides.effectiveStart))
        .limit(1);

      if (personOverrides.length > 0) {
        return personOverrides[0];
      }
    }

    // Try role-based override
    if (roleId) {
      const roleOverrides = await db.select()
        .from(clientRateOverrides)
        .where(and(
          eq(clientRateOverrides.clientId, clientId),
          eq(clientRateOverrides.subjectType, 'role'),
          eq(clientRateOverrides.subjectId, roleId),
          dateConditions as any
        ))
        .orderBy(desc(clientRateOverrides.effectiveStart))
        .limit(1);

      if (roleOverrides.length > 0) {
        return roleOverrides[0];
      }
    }

    return null;
  }

  /**
   * Get all applicable overrides for an estimate (for UI display)
   */
  static async getEstimateOverrides(estimateId: string): Promise<(EstimateRateOverride & { 
    subjectName?: string; 
    appliesTo?: 'all' | 'specific';
  })[]> {
    const overrides = await db.select()
      .from(estimateRateOverrides)
      .where(eq(estimateRateOverrides.estimateId, estimateId));

    // Enrich with subject names
    const enriched = await Promise.all(overrides.map(async (override) => {
      let subjectName = 'Unknown';
      
      if (override.subjectType === 'person') {
        const [user] = await db.select().from(users).where(eq(users.id, override.subjectId));
        subjectName = user?.name || 'Unknown User';
      } else if (override.subjectType === 'role') {
        const [role] = await db.select().from(roles).where(eq(roles.id, override.subjectId));
        subjectName = role?.name || 'Unknown Role';
      }

      return {
        ...override,
        subjectName,
        appliesTo: (!override.lineItemIds || override.lineItemIds.length === 0) ? 'all' as const : 'specific' as const
      };
    }));

    return enriched;
  }

  /**
   * Batch resolve effective rates for all line items in an estimate
   * Optimized to avoid N+1 queries by preloading users, roles, and overrides
   */
  static async resolveRatesBatch(estimateId: string): Promise<Array<{
    lineItemId: string;
    precedence: RatePrecedence;
    billingRate: number | null;
    costRate: number | null;
    source: string;
    overrideId?: string;
    chain: Array<{ level: string; value: string; }>;
  }>> {
    // Fetch all line items for the estimate
    const lineItems = await db.select()
      .from(estimateLineItems)
      .where(eq(estimateLineItems.estimateId, estimateId));
    
    if (lineItems.length === 0) {
      return [];
    }
    
    // Preload all users and roles to avoid N+1 queries
    const userIds = [...new Set(lineItems.map(item => item.resourceId).filter(Boolean) as string[])];
    const roleIds = [...new Set(lineItems.map(item => item.roleId).filter(Boolean) as string[])];
    
    const usersMap = new Map<string, User>();
    const rolesMap = new Map<string, Role>();
    
    if (userIds.length > 0) {
      const usersData = await db.select()
        .from(users)
        .where(inArray(users.id, userIds));
      usersData.forEach(u => usersMap.set(u.id, u));
    }
    
    if (roleIds.length > 0) {
      const rolesData = await db.select()
        .from(roles)
        .where(inArray(roles.id, roleIds));
      rolesData.forEach(r => rolesMap.set(r.id, r));
    }
    
    // Fetch all estimate overrides once
    const estimateOverrides = await db.select()
      .from(estimateRateOverrides)
      .where(eq(estimateRateOverrides.estimateId, estimateId));
    
    const now = new Date();
    const results = [];
    
    for (const lineItem of lineItems) {
      // 1. Check for manual override (highest precedence)
      if (lineItem.hasManualRateOverride) {
        results.push({
          lineItemId: lineItem.id,
          precedence: 'manual_override' as RatePrecedence,
          billingRate: lineItem.rate ? Number(lineItem.rate) : null,
          costRate: lineItem.costRate ? Number(lineItem.costRate) : null,
          source: 'Manual inline edit',
          chain: [{ level: 'Manual Override', value: 'Set directly on line item' }]
        });
        continue;
      }
      
      // 2. Check for estimate override (person-specific first, then role-based)
      let override: EstimateRateOverride | null = null;
      
      // Check person-specific overrides first (higher precedence)
      if (lineItem.resourceId) {
        override = estimateOverrides.find(o => {
          if (o.subjectType !== 'person' || o.subjectId !== lineItem.resourceId) return false;
          
          // Check date range
          if (new Date(o.effectiveStart) > now) return false;
          if (o.effectiveEnd && new Date(o.effectiveEnd) < now) return false;
          
          // Check line item scope
          if (o.lineItemIds && o.lineItemIds.length > 0) {
            return o.lineItemIds.includes(lineItem.id);
          }
          
          return true;
        }) || null;
      }
      
      // If no person override, check role-based overrides
      if (!override && lineItem.roleId) {
        override = estimateOverrides.find(o => {
          if (o.subjectType !== 'role' || o.subjectId !== lineItem.roleId) return false;
          
          // Check date range
          if (new Date(o.effectiveStart) > now) return false;
          if (o.effectiveEnd && new Date(o.effectiveEnd) < now) return false;
          
          // Check line item scope
          if (o.lineItemIds && o.lineItemIds.length > 0) {
            return o.lineItemIds.includes(lineItem.id);
          }
          
          return true;
        }) || null;
      }
      
      if (override && (override.billingRate || override.costRate)) {
        const subject = override.subjectType === 'person' 
          ? usersMap.get(override.subjectId)
          : rolesMap.get(override.subjectId);
        
        const subjectName = subject?.name || 'Unknown';
        
        results.push({
          lineItemId: lineItem.id,
          precedence: 'estimate_override' as RatePrecedence,
          billingRate: override.billingRate ? Number(override.billingRate) : null,
          costRate: override.costRate ? Number(override.costRate) : null,
          source: `Estimate override (${override.subjectType === 'role' ? 'Role' : 'Person'}: ${subjectName})`,
          overrideId: override.id,
          chain: [{ 
            level: 'Estimate Override', 
            value: `${override.subjectType === 'role' ? 'Role' : 'Person'}: ${subjectName}` 
          }]
        });
        continue;
      }
      
      // 3. Check for user default rates
      if (lineItem.resourceId) {
        const user = usersMap.get(lineItem.resourceId);
        if (user && (user.defaultBillingRate || user.defaultCostRate)) {
          results.push({
            lineItemId: lineItem.id,
            precedence: 'user_default' as RatePrecedence,
            billingRate: user.defaultBillingRate ? Number(user.defaultBillingRate) : null,
            costRate: user.defaultCostRate ? Number(user.defaultCostRate) : null,
            source: `User default (${user.name})`,
            chain: [{ level: 'User Default', value: user.name }]
          });
          continue;
        }
      }
      
      // 4. Check for role default rates
      if (lineItem.roleId) {
        const role = rolesMap.get(lineItem.roleId);
        if (role && role.defaultRackRate) {
          results.push({
            lineItemId: lineItem.id,
            precedence: 'role_default' as RatePrecedence,
            billingRate: Number(role.defaultRackRate),
            costRate: null,
            source: `Role default (${role.name})`,
            chain: [{ level: 'Role Default', value: role.name }]
          });
          continue;
        }
      }
      
      // No rates found
      results.push({
        lineItemId: lineItem.id,
        precedence: 'none' as RatePrecedence,
        billingRate: null,
        costRate: null,
        source: 'No rate configured',
        chain: [{ level: 'None', value: 'No rate configured' }]
      });
    }
    
    return results;
  }
}
