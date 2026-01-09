import express, { type Request, Response, NextFunction, type Express } from "express";
import { createServer, type Server } from "http";
import { setupVite, serveStatic, log } from "./vite";

const app = express();
app.use(express.json({ limit: '50mb' })); // Increased limit for large JSON payloads (e.g., repair from JSON)
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

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
      // Sanitize API response logging in production to prevent data leakage
      if (capturedJsonResponse && process.env.NODE_ENV !== 'production') {
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

// Add global error handlers - properly exit in production to trigger restart
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Exit cleanly to allow deployment system to restart
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
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
    
    // Comprehensive health monitoring endpoint for production debugging
    app.get('/health', async (_req, res) => {
      try {
        const healthData: any = {
          status: 'ok',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          memory: {
            heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
            rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
            external: Math.round(process.memoryUsage().external / 1024 / 1024)
          },
          environment: process.env.NODE_ENV || 'unknown'
        };
        
        // Add database health if available
        try {
          const { getPoolHealth, testPoolConnection } = await import('./db');
          healthData.database = {
            ...getPoolHealth(),
            connectionTest: await testPoolConnection()
          };
        } catch (dbError: any) {
          healthData.database = { error: dbError.message, healthy: false };
        }
        
        // Add session cache stats if available
        try {
          const { getSessionCacheStats } = await import('./session-store');
          healthData.sessionCache = getSessionCacheStats();
        } catch {
          healthData.sessionCache = { available: false };
        }
        
        // Add SSO scheduler status if available
        try {
          const { getTokenRefreshStatus } = await import('./auth/sso-token-refresh');
          healthData.ssoScheduler = getTokenRefreshStatus();
        } catch {
          healthData.ssoScheduler = { available: false };
        }
        
        // Add GraphClient circuit breaker status if available
        try {
          const { graphClient } = await import('./services/graph-client');
          healthData.graphClient = {
            circuitBreaker: await graphClient.getCircuitBreakerStatus()
          };
        } catch {
          healthData.graphClient = { available: false };
        }
        
        // Determine overall health status
        const isHealthy = healthData.database?.healthy !== false && 
                          healthData.graphClient?.circuitBreaker?.state !== 'open';
        healthData.status = isHealthy ? 'ok' : 'degraded';
        
        res.status(isHealthy ? 200 : 503).json(healthData);
      } catch (error: any) {
        res.status(500).json({
          status: 'error',
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
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
      log('Routes registered successfully');
    } catch (routeError: any) {
      log(`⚠️ Route registration failed: ${routeError.message}`);
      if (routeError.stack) {
        log(`Route error stack: ${routeError.stack.split('\n').slice(0, 5).join('\n')}`);
      }
      log('Server will continue with health endpoints only');
      // Don't crash the server - health endpoints will still work
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
    
    // Start SSO token refresh scheduler
    log('Starting SSO token refresh scheduler...');
    try {
      const { startTokenRefreshScheduler } = await import('./auth/sso-token-refresh');
      startTokenRefreshScheduler();
      log('SSO token refresh scheduler started successfully');
    } catch (schedulerError: any) {
      log(`⚠️ SSO scheduler start failed: ${schedulerError.message}`);
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
      
      // Conditionally mount Vite: forward only non-/api requests to prevent HTML responses for API calls
      app.use((req, res, next) => {
        if (req.originalUrl.startsWith('/api')) {
          // Let API routes handle the request
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
    
    log(`📅 Version release date updated to: ${currentDate}`);
  } catch (error: any) {
    log(`⚠️ Failed to update version release date: ${error.message}`);
    // Don't throw - this is non-critical
  }
}
