import { db } from "./db";
import { 
  estimateRateOverrides, 
  estimateLineItems, 
  users, 
  roles,
  type EstimateLineItem,
  type EstimateRateOverride,
  type User,
  type Role
} from "@shared/schema";
import { eq, and, lte, or, isNull, inArray, gte } from "drizzle-orm";

export type RatePrecedence = 
  | 'manual_override'      // Highest: Manual inline edit on line item
  | 'estimate_override'    // Estimate-level rate override
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

    // 3. Check for user default rates
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

    // 4. Check for role default rates (lowest precedence)
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
}
