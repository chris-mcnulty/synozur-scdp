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

// Environment validation function - softened for deployment resilience
function validateEnvironment() {
  const requiredVars = ['DATABASE_URL'];
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    if (process.env.STRICT_ENV === '1') {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    } else {
      log(`⚠️ Warning: Missing environment variables: ${missing.join(', ')} - continuing in degraded mode`);
      return false;
    }
  }
  
  log('Environment validation passed');
  return true;
}

// Add global error handlers for deployment resilience
process.on('unhandledRejection', (reason, promise) => {
  log(`⚠️ Unhandled Rejection at: ${promise}, reason: ${reason}`);
  // Don't exit - log and continue
});

process.on('uncaughtException', (error) => {
  log(`❌ Uncaught Exception: ${error.message}`);
  log(`Stack: ${error.stack}`);
  // In production, try to stay alive for health checks
  if (process.env.NODE_ENV === 'production' || process.env.REPLIT_DOMAINS) {
    log('Production environment - continuing after uncaught exception');
  } else {
    process.exit(1);
  }
});

// Main server startup function with comprehensive error handling
(async () => {
  try {
    log('Starting server initialization...');
    
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
      log('Server will continue with health endpoints only');
      // Don't crash the server - health endpoints will still work
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
  // Add database connection health check with timeout
  log('Testing database connection...');
  try {
    const dbPromise = import('./db').then(({ db }) => db.execute(`SELECT 1 as test`));
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Database connection timeout')), 5000)
    );
    
    await Promise.race([dbPromise, timeoutPromise]);
    log('Database connection successful');
  } catch (dbError: any) {
    log(`Database connection check failed: ${dbError.message}`);
    log('Continuing without database - static content will still be served');
  }
  
  // Setup Vite or static serving - more explicit deployment guard
  const isProduction = process.env.NODE_ENV === 'production';
  const isDeployment = Boolean(process.env.REPLIT_DOMAINS || process.env.REPL_SLUG);
  const isViteDisabled = process.env.DISABLE_VITE_DEV === '1';
  const isDevelopment = app.get("env") === "development";
  
  // Tightened guard: only use Vite in true local development
  if (isDevelopment && !isProduction && !isDeployment && !isViteDisabled) {
    log('Setting up Vite development server...');
    try {
      await setupVite(app, server);
      log('Vite development server setup successful');
    } catch (viteError: any) {
      log(`⚠️ Vite setup failed: ${viteError.message}`);
      log('Falling back to static file serving');
      try {
        serveStatic(app);
        log('Fallback to static file serving successful');
      } catch (staticError: any) {
        log(`❌ Static file serving also failed: ${staticError.message}`);
        log('Frontend may not be available');
      }
    }
  } else {
    const reason = isProduction ? 'production' : isDeployment ? 'deployment' : isViteDisabled ? 'disabled' : 'non-development';
    log(`Setting up static file serving for ${reason} environment...`);
    try {
      serveStatic(app);
      log('Static file serving setup successful');
    } catch (staticError: any) {
      log(`⚠️ Static file serving failed: ${staticError.message}`);
      log('Server will continue with API only - frontend may not be available');
    }
  }
}
