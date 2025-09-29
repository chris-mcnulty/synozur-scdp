import express, { type Request, Response, NextFunction, type Express } from "express";
import { createServer, type Server } from "http";
import { setupVite, serveStatic, log } from "./vite";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

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
        log(`Route error stack: ${routeError.stack}`);
      }
      log('Server will continue with health endpoints only');
      
      // Add a catch-all route for login to return proper JSON error
      app.post('/api/auth/login', (req, res) => {
        res.status(500).json({ 
          message: "Server initialization incomplete. Please wait a moment and try again.",
          error: "Routes not loaded"
        });
      });
      
      app.get('/api/auth/user', (req, res) => {
        res.status(500).json({ 
          message: "Server initialization incomplete. Please wait a moment and try again.",
          error: "Routes not loaded"
        });
      });
    }

    // Add a basic frontend fallback for when Vite/static serving fails
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ 
          message: "API endpoint not found",
          path: req.path 
        });
      }
      
      // Serve a simple HTML page that loads the React app
      const html = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/png" href="/favicon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SCDP - Synozur Consulting Delivery Platform</title>
    <script>
      // Simple loading message while we wait for the app to load
      window.addEventListener('DOMContentLoaded', function() {
        if (!document.getElementById('root').innerHTML.trim()) {
          document.getElementById('root').innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:system-ui"><div>Loading SCDP...</div></div>';
        }
      });
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;
      res.send(html);
    });

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
    }).catch((dbError: any) => {
      log(`⚠️ Database not available: ${dbError.message}`);
      log(`Database URL format: ${process.env.DATABASE_URL ? 'SET' : 'NOT SET'}`);
      log('Server will continue without database features');
      
      // Add database error routes
      app.post('/api/auth/login', (req, res) => {
        res.status(503).json({ 
          message: "Database connection unavailable. Please try again in a moment.",
          error: "Database not connected"
        });
      });
    });
  } else {
    log('⚠️ No DATABASE_URL provided - database features disabled');
    
    // Add no database routes
    app.post('/api/auth/login', (req, res) => {
      res.status(503).json({ 
        message: "Database not configured. Please contact administrator.",
        error: "No database configured"
      });
    });
  }
  
  // Setup Vite or static serving based on environment
  const isProduction = process.env.NODE_ENV === 'production';
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  log(`Frontend server configuration:`);
  log(`  - Environment: ${process.env.NODE_ENV}`);
  log(`  - Mode: ${isDevelopment ? 'Development (Vite)' : 'Production (Static)'}`);
  
  // In development mode, use Vite for hot reloading
  if (isDevelopment) {
    log('Setting up Vite development server...');
    try {
      await setupVite(app, server);
      log('✅ Vite development server setup successful');
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
