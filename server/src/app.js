import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import path from 'path';
import { query } from './db.js';
import config from './config.js';
import authRouter from './routes/auth.js';
import mastersRouter from './routes/masters.js';
import transactionsRouter from './routes/transactions.js';
import reportsRouter from './routes/reports.js';
import utilityRouter from './routes/utility.js';
import adminRouter from './routes/admin.js';
import balanceReportsRouter from './routes/balanceReports.js'; // Balance Reports (new section)
import brandingRouter from './routes/branding.js'; // company name + logo (readable before login)


const app = express();

// ============================================================================
// MIDDLEWARE CONFIGURATION
// ============================================================================

// Enable CORS with credentials for local development
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

// Cookie parser for JWT session authentication
app.use(cookieParser());

// Parse incoming JSON payloads. Company Branding sends the logo picture inside the JSON, so that one
// route may be up to 3 MB; everything else keeps the normal small limit.
app.use('/api/admin/branding', express.json({ limit: '3mb' }));
app.use(express.json());

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));

// Request logging (clean dev format in console)
app.use(morgan('dev'));

// ============================================================================
// API ROUTES
// ============================================================================

// Authentication endpoints: /api/auth/login, /api/auth/logout, /api/auth/me
app.use('/api/auth', authRouter);

// Masters endpoints: /api/masters/*
app.use('/api/masters', mastersRouter);

// Transactions endpoints: /api/transactions/*
app.use('/api/transactions', transactionsRouter);

// Reports & Utility endpoints
app.use('/api/reports', reportsRouter);
app.use('/api/utility', utilityRouter);
app.use('/api/admin', adminRouter);
app.use('/api/balance-reports', balanceReportsRouter); // Balance Reports (new section)
app.use('/api/branding', brandingRouter); // Company Branding: name + logo, no login needed

/**
 * Health Check Endpoint
 * GET /api/health
 * Verifies that the Express server is up and can query the PostgreSQL database.
 */
app.get('/api/health', async (req, res) => {
  try {
    const result = await query('SELECT 1 AS ok;');
    return res.status(200).json({
      status: 'ok',
      message: 'GarmentMFG Server is running',
      database: 'connected',
      dbTestResult: result.rows[0].ok,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Database health check failed:', err.message);
    return res.status(500).json({
      status: 'error',
      message: 'Database connection failed',
      database: 'disconnected',
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// ============================================================================
// PRODUCTION STATIC FILE SERVING
// ============================================================================
// In production or single-port deployment, Express serves the built React app (client/dist)
const clientDistPath = config.webDir;
app.use(express.static(clientDistPath));

// For any non-API routes, send back React's index.html for client-side routing
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.sendFile(path.join(clientDistPath, 'index.html'), (err) => {
    if (err) {
      // In development, the Vite dev server serves the frontend separately
      next();
    }
  });
});

// ============================================================================
// GLOBAL ERROR HANDLER
// ============================================================================
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(err.status || 500).json({
    status: 'error',
    message: err.message || 'Internal Server Error',
  });
});

export default app;
