/** BizTime express application. */

const express = require("express");
const setupCompanyRoutes = require('./routes/companies');
const setupInvoiceRoutes = require('./routes/invoices');
const ExpressError = require("./expressError");
const { initializeDatabase } = require('./db');

async function setupApp() {
  const app = express();
  app.use(express.json());
  try {
    const db = await initializeDatabase();
    const companiesRouter = await setupCompanyRoutes(db);
    app.use('/companies', companiesRouter);
    const invoicesRouter = await setupInvoiceRoutes(db);
    app.use('/invoices', invoicesRouter);
  } catch (error) {
    console.error("Error setting up routes:", error.message);
    throw error;
  }

  /** 404 handler */
  app.use(function (req, res, next) {
    const err = new ExpressError("Not Found", 404);
    return next(err);
  });

  /** general error handler */
  app.use((err, req, res, next) => {
    res.status(err.status || 500);
    return res.json({
      error: err,
      message: err.message
    });
  });

  return app;
}

module.exports = setupApp;