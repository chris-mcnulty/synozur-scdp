import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
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
      if (capturedJsonResponse) {
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

// Environment validation function
function validateEnvironment() {
  const requiredVars = ['DATABASE_URL'];
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  log('Environment validation passed');
}

// Main server startup function with comprehensive error handling
(async () => {
  try {
    log('Starting server initialization...');
    
    // Validate environment variables first
    validateEnvironment();
    
    log('Registering routes...');
    const server = await registerRoutes(app);
    
    // Add database connection health check
    log('Testing database connection...');
    try {
      const { db } = await import('./db');
      await db.execute(`SELECT 1 as test`);
      log('Database connection successful');
    } catch (dbError: any) {
      log(`Database connection failed: ${dbError.message}`);
      // Continue without crashing - the app can still serve static content
    }
    
    log('Setting up error handling middleware...');
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      
      log(`Error handled: ${status} - ${message}`);
      res.status(status).json({ message });
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    // Check if we're in development mode - either NODE_ENV or in Replit dev environment
    const isProduction = app.get("env") === "production" && process.env.REPL_SLUG; // REPL_SLUG is set in deployed Repls
    const isDevelopment = !isProduction;
    
    if (isDevelopment) {
      log('Setting up Vite development server...');
      await setupVite(app, server);
    } else {
      log('Setting up static file serving for production...');
      serveStatic(app);
    }

    // ALWAYS serve the app on the port specified in the environment variable PORT
    // Other ports are firewalled. Default to 5000 if not specified.
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = parseInt(process.env.PORT || '5000', 10);
    
    log(`Attempting to start server on port ${port}...`);
    
    server.listen({
      port,
      host: "0.0.0.0",
      reusePort: true,
    }, () => {
      log(`✅ Server successfully started and listening on port ${port}`);
      log(`Environment: ${app.get("env")}`);
    });
    
    // Handle server errors
    server.on('error', (error: any) => {
      log(`❌ Server error: ${error.message}`);
      if (error.code === 'EADDRINUSE') {
        log(`Port ${port} is already in use`);
      } else if (error.code === 'EACCES') {
        log(`Permission denied to bind to port ${port}`);
      }
      process.exit(1);
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
