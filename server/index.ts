import express, { type Request, Response, NextFunction, type Express } from "express";
import { createServer, type Server } from "http";
import compression from "compression";
import { setupVite, serveStatic, log } from "./vite";

const app = express();

// Enable gzip/deflate compression for all responses
// This significantly reduces bandwidth usage (typically 70-90% for JSON APIs)
app.use(compression({
  // Only compress responses larger than 1KB
  threshold: 1024,
  // Compression level (1-9, default 6). Higher = better compression but more CPU
  level: 6,
  // Filter which responses to compress
  filter: (req, res) => {
    // Don't compress responses with x-no-compression header
    if (req.headers['x-no-compression']) {
      return false;
    }
    // Use default filter (compresses text/*, application/json, application/javascript, etc.)
    return compression.filter(req, res);
  }
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

app.use((req, res, next) => {
  if (req.path.startsWith('/embed/') || req.path.startsWith('/embed')) {
    res.setHeader(
      'Content-Security-Policy',
      "frame-ancestors https://teams.microsoft.com https://*.teams.microsoft.com https://*.cloud.microsoft https://*.office.com https://*.microsoft365.com https://*.sharepoint.com 'self'"
    );
    res.removeHeader('X-Frame-Options');
  }
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      // Never log oauth/token bodies (contain bearer + refresh tokens)
      const isSensitive = path.startsWith("/api/galaxy/") && (
        path.endsWith("/oauth/token") || path.endsWith("/oauth/authorize") || path.endsWith("/oauth/revoke")
      );
      // Sanitize API response logging in production to prevent data leakage
      if (capturedJsonResponse && process.env.NODE_ENV !== 'production' && !isSensitive) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Simple environment detection - trust NODE_ENV
function detectEnvironment() {
  // Use NODE_ENV if set, otherwise detect based on tsx usage
  if (!process.env.NODE_ENV) {
    const isDevelopmentCommand = process.argv.some(arg => arg.includes('tsx'));
    process.env.NODE_ENV = isDevelopmentCommand ? 'development' : 'production';
  }
  
  log(`🔍 Environment: ${process.env.NODE_ENV}`);
  log(`  - Port: ${process.env.PORT || '5000'} (default)`);
  
  return process.env.NODE_ENV;
}

// Environment validation function - non-blocking for deployment
function validateEnvironment() {
  const requiredVars = ['DATABASE_URL'];
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    log(`⚠️ Warning: Missing environment variables: ${missing.join(', ')} - database features may be limited`);
    return false;
  }
  
  log('✅ Environment validation passed');
  return true;
}

// Add global error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Log but don't exit - non-critical async failures should not crash the server
});

process.on('uncaughtException', (error: any) => {
  console.error('Uncaught Exception:', error);
  const stack = (error?.stack || String(error));
  const message = String(error?.message || '');
  const isNeonDriverNoise =
    stack.includes('@neondatabase/serverless') ||
    /Cannot set property message of #<ErrorEvent>/.test(message);
  if (isNeonDriverNoise) {
    console.error('[crash-handler] Suppressing Neon driver WS error — not exiting.');
    return;
  }
  // Exit cleanly to allow deployment system to restart
  process.exit(1);
});

// Main server startup function with comprehensive error handling
(async () => {
  try {
    log('Starting server initialization...');
    
    // Detect and set correct environment mode
    detectEnvironment();
    
    // Validate environment variables (softened)
    const envValid = validateEnvironment();
    
    // Add health check endpoints BEFORE route registration so they work even if routes fail
    app.get('/healthz', (_req, res) => {
      res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
    });
    
    app.get('/ready', (_req, res) => {
      res.status(200).json({ 
        status: 'ready', 
        environment: envValid,
        timestamp: new Date().toISOString()
      });
    });
    
    log('Setting up error handling middleware...');
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      
      log(`Error handled: ${status} - ${message}`);
      res.status(status).json({ message });
    });

    // Create HTTP server
    log('Creating HTTP server...');
    const server = createServer(app);

    // CRITICAL: Bind port immediately for deployment readiness
    // ALWAYS serve the app on the port specified in the environment variable PORT
    // Other ports are firewalled. Default to 5000 if not specified.
    const port = parseInt(process.env.PORT || '5000', 10);
    
    log(`Binding to port ${port} immediately for deployment readiness...`);
    
    await new Promise<void>((resolve, reject) => {
      server.listen(port, "0.0.0.0", () => {
        log(`✅ Server successfully bound to port ${port}`);
        log(`Environment: ${app.get("env")}`);
        log(`Process ID: ${process.pid}`);
        resolve();
      });
      
      server.on('error', (error: any) => {
        log(`❌ Server binding error: ${error.message}`);
        if (error.code === 'EADDRINUSE') {
          log(`Port ${port} is already in use`);
        } else if (error.code === 'EACCES') {
          log(`Permission denied to bind to port ${port}`);
        }
        reject(error);
      });
    });
    
    // Register routes AFTER server is successfully bound using dynamic import
    log('Registering routes after server binding...');
    try {
      const { registerRoutes } = await import('./routes');
      await registerRoutes(app);
      log('Main routes registered successfully');
    } catch (routeError: any) {
      log(`⚠️ Main route registration failed: ${routeError.message}`);
      if (routeError.stack) {
        log(`Route error stack: ${routeError.stack.split('\n').slice(0, 5).join('\n')}`);
      }
      log('Server will continue with health endpoints only');
    }

    // Update version release date automatically on startup
    log('Updating version release date...');
    try {
      await updateVersionReleaseDate();
      log('Version release date updated successfully');
    } catch (versionError: any) {
      log(`⚠️ Version update failed: ${versionError.message}`);
      // Don't crash - this is non-critical
    }
    
    // Now run additional setup asynchronously without blocking the port
    log('Starting additional services setup asynchronously...');
    setupAdditionalServices(app, server, envValid).catch((error) => {
      log(`⚠️ Additional services setup failed: ${error.message}`);
      log('Server will continue with reduced functionality');
    });
    
    // Graceful shutdown handling
    const gracefulShutdown = (signal: string) => {
      log(`Received ${signal}, shutting down gracefully...`);
      server.close(() => {
        log('Server closed');
        process.exit(0);
      });
    };
    
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
  } catch (error: any) {
    log(`❌ Failed to start server: ${error.message}`);
    if (error.stack) {
      log(`Stack trace: ${error.stack}`);
    }
    process.exit(1);
  }
})();

// Async function to handle additional services after port binding
async function setupAdditionalServices(app: Express, server: Server, envValid: boolean) {
  // Database connection is optional - don't block on it
  if (process.env.DATABASE_URL) {
    log('Testing database connection...');
    import('./db').then(({ db }) => {
      return db.execute(`SELECT 1 as test`);
    }).then(() => {
      log('✅ Database connection successful');
      // Ensure pagination indexes exist (idempotent)
      import('./scripts/add-pagination-indexes').then(({ addPaginationIndexes }) => {
        addPaginationIndexes();
      }).catch(() => {});

      // Warm the in-process cache so the first request after a restart doesn't
      // pay the cold-start latency tax. Non-blocking — failures are logged.
      log('🔄 Warming cache (system settings, vocabulary, tenants)...');
      import('./lib/cache-warmup').then(({ warmCache }) => {
        warmCache().catch((warmupError: any) => {
          log(`⚠️ Cache warm-up failed: ${warmupError.message}`);
        });
      }).catch((importError: any) => {
        log(`⚠️ Failed to import cache warm-up: ${importError.message}`);
      });
      
      // Start the time reminder scheduler after database is confirmed working
      log('🔄 Starting time reminder scheduler...');
      import('./services/time-reminder-scheduler.js').then(({ startTimeReminderScheduler }) => {
        startTimeReminderScheduler().then(() => {
          log('✅ Time reminder scheduler started');
        }).catch((schedulerError: any) => {
          log(`⚠️ Time reminder scheduler failed to start: ${schedulerError.message}`);
        });
      }).catch((importError: any) => {
        log(`⚠️ Failed to import time reminder scheduler: ${importError.message}`);
      });

      // Start the QuickBooks payment-status sync scheduler
      log('🔄 Starting QuickBooks payment sync scheduler...');
      import('./services/quickbooks-payment-scheduler.js').then(({ startQuickbooksPaymentScheduler }) => {
        startQuickbooksPaymentScheduler();
        log('✅ QuickBooks payment sync scheduler started');
      }).catch((importError: any) => {
        log(`⚠️ Failed to import QuickBooks payment sync scheduler: ${importError.message}`);
      });
      
      // Start the expense reminder scheduler
      log('🔄 Starting expense reminder scheduler...');
      import('./services/expense-reminder-scheduler.js').then(({ startExpenseReminderScheduler }) => {
        startExpenseReminderScheduler().then(() => {
          log('✅ Expense reminder scheduler started');
        }).catch((schedulerError: any) => {
          log(`⚠️ Expense reminder scheduler failed to start: ${schedulerError.message}`);
        });
      }).catch((importError: any) => {
        log(`⚠️ Failed to import expense reminder scheduler: ${importError.message}`);
      });
      
      // Start the Planner sync scheduler
      log('🔄 Starting Planner sync scheduler...');
      import('./services/planner-sync-scheduler.js').then(({ startPlannerSyncScheduler }) => {
        startPlannerSyncScheduler().then(() => {
          log('✅ Planner sync scheduler started');
        }).catch((schedulerError: any) => {
          log(`⚠️ Planner sync scheduler failed to start: ${schedulerError.message}`);
        });
      }).catch((importError: any) => {
        log(`⚠️ Failed to import Planner sync scheduler: ${importError.message}`);
      });

      // Task #126 — Start the Planner Graph subscription renewal scheduler
      log('🔄 Starting Planner subscription renewal scheduler...');
      import('./services/planner-subscription-manager.js').then(({ startSubscriptionRenewalScheduler }) => {
        try {
          startSubscriptionRenewalScheduler();
          log('✅ Planner subscription renewal scheduler started');
        } catch (err: any) {
          log(`⚠️ Subscription renewal scheduler failed to start: ${err.message}`);
        }
      }).catch((importError: any) => {
        log(`⚠️ Failed to import subscription renewal scheduler: ${importError.message}`);
      });
      
      // Start the plan expiration scheduler
      log('🔄 Starting plan expiration scheduler...');
      import('./services/plan-expiration-scheduler.js').then(({ startPlanExpirationScheduler }) => {
        startPlanExpirationScheduler().then(() => {
          log('✅ Plan expiration scheduler started');
        }).catch((schedulerError: any) => {
          log(`⚠️ Plan expiration scheduler failed to start: ${schedulerError.message}`);
        });
      }).catch((importError: any) => {
        log(`⚠️ Failed to import plan expiration scheduler: ${importError.message}`);
      });

      // Start the agent card health scheduler
      log('🔄 Starting agent card health scheduler...');
      import('./services/agent-card-health-scheduler.js').then(({ startAgentCardHealthScheduler }) => {
        startAgentCardHealthScheduler().then(() => {
          log('✅ Agent card health scheduler started');
        }).catch((schedulerError: any) => {
          log(`⚠️ Agent card health scheduler failed to start: ${schedulerError.message}`);
        });
      }).catch((importError: any) => {
        log(`⚠️ Failed to import agent card health scheduler: ${importError.message}`);
      });

      // Start the Teams alert scheduler
      log('🔄 Starting Teams alert scheduler...');
      import('./services/teams-alert-scheduler.js').then(({ startTeamsAlertScheduler }) => {
        startTeamsAlertScheduler().then(() => {
          log('✅ Teams alert scheduler started');
        }).catch((schedulerError: any) => {
          log(`⚠️ Teams alert scheduler failed to start: ${schedulerError.message}`);
        });
      }).catch((importError: any) => {
        log(`⚠️ Failed to import Teams alert scheduler: ${importError.message}`);
      });

      // Start the project budget alert scheduler
      log('🔄 Starting project budget alert scheduler...');
      import('./services/budget-alert-scheduler.js').then(({ startBudgetAlertScheduler }) => {
        startBudgetAlertScheduler().then(() => {
          log('✅ Project budget alert scheduler started');
        }).catch((schedulerError: any) => {
          log(`⚠️ Project budget alert scheduler failed to start: ${schedulerError.message}`);
        });
      }).catch((importError: any) => {
        log(`⚠️ Failed to import project budget alert scheduler: ${importError.message}`);
      });

      // Start the weekly digest scheduler
      log('🔄 Starting weekly digest scheduler...');
      import('./services/weekly-digest-scheduler.js').then(({ startWeeklyDigestScheduler }) => {
        startWeeklyDigestScheduler().then(() => {
          log('✅ Weekly digest scheduler started');
        }).catch((schedulerError: any) => {
          log(`⚠️ Weekly digest scheduler failed to start: ${schedulerError.message}`);
        });
      }).catch((importError: any) => {
        log(`⚠️ Failed to import weekly digest scheduler: ${importError.message}`);
      });

      // Start the background job worker
      log('🔄 Starting background job worker...');
      import('./services/job-worker.js').then(({ startJobWorker }) => {
        startJobWorker();
        log('✅ Background job worker started');
      }).catch((importError: any) => {
        log(`⚠️ Failed to import background job worker: ${importError.message}`);
      });

      // Start the background-job prune scheduler (deletes old succeeded/failed jobs)
      log('🔄 Starting background job prune scheduler...');
      import('./services/job-prune-scheduler.js').then(async ({ startJobPruneScheduler }) => {
        await startJobPruneScheduler();
        log('✅ Background job prune scheduler started');
      }).catch((importError: any) => {
        log(`⚠️ Failed to import background job prune scheduler: ${importError.message}`);
      });

      // Check for missed jobs after a short delay to allow schedulers to initialize
      setTimeout(async () => {
        log('🔄 Checking for missed scheduled jobs...');
        try {
          const { checkAndRunMissedJobs } = await import('./services/job-catchup-service.js');
          const results = await checkAndRunMissedJobs();
          const triggered = results.filter(r => r.triggered).length;
          if (triggered > 0) {
            log(`✅ Catch-up complete: triggered ${triggered} overdue job(s)`);
          } else {
            log('✅ All scheduled jobs are up to date');
          }
        } catch (catchupError: any) {
          log(`⚠️ Job catch-up check failed: ${catchupError.message}`);
        }
      }, 5000); // 5 second delay
    }).catch((dbError: any) => {
      log(`⚠️ Database not available: ${dbError.message}`);
      log('Server will continue without database features');
    });
  } else {
    log('⚠️ No DATABASE_URL provided - database features disabled');
  }
  
  // Auto-register SharePoint Embedded container type (both dev and production)
  const isProduction = process.env.NODE_ENV === 'production' || process.env.REPLIT_DEPLOYMENT === '1';
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // CRITICAL: Run container registration in BOTH dev and production
  // This is required for SharePoint Embedded file uploads to work
  log('🔄 Auto-registering SharePoint Embedded container type...');
  try {
    const { ContainerRegistrationService } = await import('./services/container-registration.js');
    const containerReg = new ContainerRegistrationService();
    const result = await containerReg.registerContainerType();
    
    if (result.success) {
      log('✅ SharePoint container type registration successful');
      log('   File uploads to SharePoint Embedded are now enabled');
    } else {
      log(`⚠️ Container registration failed: ${result.message}`);
      log('💡 File uploads may fail - see AZURE_APP_PERMISSIONS_SETUP.md');
      log('   Run POST /api/admin/register-container-type to retry manually');
    }
  } catch (regError: any) {
    log(`⚠️ Container registration error: ${regError.message}`);
    log('💡 This is expected if Azure permissions are not yet configured');
    log('   See AZURE_APP_PERMISSIONS_SETUP.md for setup instructions');
  }
  
  log(`Frontend server configuration:`);
  log(`  - Environment: ${process.env.NODE_ENV}`);
  log(`  - Mode: ${isDevelopment ? 'Development (Vite)' : 'Production (Static)'}`);
  
  // In development mode, use Vite for hot reloading
  if (isDevelopment) {
    log('Setting up Vite development server with API route isolation...');
    try {
      // Create a separate Express sub-app for Vite to prevent its catch-all from intercepting API routes
      const frontendApp = express();
      await setupVite(frontendApp, server);
      
      // Conditionally mount Vite: forward only non-/api and non-/object-storage requests to prevent HTML responses
      app.use((req, res, next) => {
        if (req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/object-storage')) {
          // Let API routes and object storage routes handle the request
          next();
        } else {
          // Forward to Vite's middleware
          frontendApp(req, res, next);
        }
      });
      
      log('✅ Vite development server setup successful (isolated from API routes)');
      log('📝 Frontend available at http://localhost:5000');
    } catch (viteError: any) {
      log(`⚠️ Vite setup failed: ${viteError.message}`);
      if (viteError.stack) {
        log(`Vite error details: ${viteError.stack.split('\n').slice(0, 3).join('\n')}`);
      }
      log('Falling back to static file serving...');
      try {
        serveStatic(app);
        log('✅ Fallback to static file serving successful');
      } catch (staticError: any) {
        log(`❌ Static file serving also failed: ${staticError.message}`);
        log('⚠️ Frontend may not be available - API endpoints will still work');
        log('💡 To fix: run "npm run build" to create production build');
      }
    }
  } else {
    // In production, serve the built static files
    log(`Setting up static file serving for production environment...`);
    try {
      serveStatic(app);
      log('✅ Static file serving setup successful');
      log('📝 Frontend available at port 5000');
    } catch (staticError: any) {
      log(`❌ Static file serving failed: ${staticError.message}`);
      log('💡 Ensure you have run "npm run build" before starting in production');
      // Exit to trigger deployment restart rather than running broken
      process.exit(1);
    }
  }
}

// Function to automatically update version release date
async function updateVersionReleaseDate() {
  try {
    // Only update if database is available
    if (!process.env.DATABASE_URL) {
      log('⚠️ Skipping version update - no database configured');
      return;
    }
    
    const { db } = await import('./db');
    const { sql } = await import('drizzle-orm');
    const currentDate = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
    
    await db.execute(sql`
      INSERT INTO system_settings (setting_key, setting_value, description, setting_type) 
      VALUES ('VERSION_RELEASE_DATE', ${currentDate}, 'Release date in YYYY-MM-DD format for version numbering', 'string')
      ON CONFLICT (setting_key) 
      DO UPDATE SET 
        setting_value = EXCLUDED.setting_value
    `);

    await db.execute(sql`
      INSERT INTO system_settings (setting_key, setting_value, description, setting_type) 
      VALUES ('VERSION_MAJOR', '1', 'Major version number for display purposes', 'string')
      ON CONFLICT (setting_key) 
      DO UPDATE SET 
        setting_value = EXCLUDED.setting_value
    `);
    
    log(`📅 Version release date updated to: ${currentDate}`);
  } catch (error: any) {
    log(`⚠️ Failed to update version release date: ${error.message}`);
    // Don't throw - this is non-critical
  }
}
