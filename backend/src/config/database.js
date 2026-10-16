const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const DB_PATH = process.env.DATABASE_PATH || './data/acxiomcrm.db';
const dbDir = path.dirname(path.resolve(DB_PATH));

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let db;

function getDb() {
  if (!db) {
    db = new Database(path.resolve(DB_PATH));
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initializeDatabase() {
  const database = getDb();

  database.exec(`
    -- Roles table
    CREATE TABLE IF NOT EXISTS roles (
      role_id TEXT PRIMARY KEY,
      role_name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_date TEXT DEFAULT (datetime('now'))
    );

    -- Users table (like ASP.NET Identity)
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      role_id TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      failed_login_count INTEGER NOT NULL DEFAULT 0,
      lockout_end TEXT,
      created_date TEXT DEFAULT (datetime('now')),
      modified_date TEXT DEFAULT (datetime('now')),
      created_by TEXT,
      FOREIGN KEY (role_id) REFERENCES roles(role_id)
    );

    -- Customers table
    CREATE TABLE IF NOT EXISTS customers (
      customer_id TEXT PRIMARY KEY,
      customer_code TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL UNIQUE,
      company_name TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Inactive','Prospect')),
      owner_id TEXT,
      notes TEXT,
      created_date TEXT DEFAULT (datetime('now')),
      modified_date TEXT DEFAULT (datetime('now')),
      created_by TEXT,
      FOREIGN KEY (owner_id) REFERENCES users(user_id)
    );

    -- Leads table
    CREATE TABLE IF NOT EXISTS leads (
      lead_id TEXT PRIMARY KEY,
      lead_code TEXT NOT NULL UNIQUE,
      lead_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      company_name TEXT,
      source TEXT CHECK(source IN ('Website','Referral','Cold Call','Email','LinkedIn','Trade Show','Other')),
      status TEXT NOT NULL DEFAULT 'New' CHECK(status IN ('New','Contacted','Qualified','Unqualified','Converted','Lost')),
      priority TEXT NOT NULL DEFAULT 'Medium' CHECK(priority IN ('Low','Medium','High')),
      expected_value REAL DEFAULT 0,
      assigned_to TEXT,
      notes TEXT,
      converted_customer_id TEXT,
      converted_date TEXT,
      created_date TEXT DEFAULT (datetime('now')),
      modified_date TEXT DEFAULT (datetime('now')),
      created_by TEXT,
      FOREIGN KEY (assigned_to) REFERENCES users(user_id),
      FOREIGN KEY (converted_customer_id) REFERENCES customers(customer_id)
    );

    -- Opportunities table
    CREATE TABLE IF NOT EXISTS opportunities (
      opportunity_id TEXT PRIMARY KEY,
      opportunity_name TEXT NOT NULL,
      customer_id TEXT,
      lead_id TEXT,
      amount REAL NOT NULL CHECK(amount > 0),
      stage TEXT NOT NULL DEFAULT 'Qualification' CHECK(stage IN ('Qualification','Proposal','Negotiation','Won','Lost')),
      probability INTEGER NOT NULL DEFAULT 0 CHECK(probability >= 0 AND probability <= 100),
      expected_close_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Open' CHECK(status IN ('Open','Won','Lost','Cancelled')),
      source TEXT,
      notes TEXT,
      assigned_to TEXT,
      created_date TEXT DEFAULT (datetime('now')),
      modified_date TEXT DEFAULT (datetime('now')),
      created_by TEXT,
      FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
      FOREIGN KEY (lead_id) REFERENCES leads(lead_id),
      FOREIGN KEY (assigned_to) REFERENCES users(user_id)
    );

    -- FollowUps table
    CREATE TABLE IF NOT EXISTS follow_ups (
      follow_up_id TEXT PRIMARY KEY,
      customer_id TEXT,
      lead_id TEXT,
      opportunity_id TEXT,
      follow_up_date TEXT NOT NULL,
      follow_up_type TEXT NOT NULL DEFAULT 'Call' CHECK(follow_up_type IN ('Call','Meeting','Email','Task')),
      subject TEXT NOT NULL,
      remarks TEXT,
      status TEXT NOT NULL DEFAULT 'Planned' CHECK(status IN ('Planned','Completed','Missed','Cancelled')),
      assigned_to TEXT,
      created_date TEXT DEFAULT (datetime('now')),
      modified_date TEXT DEFAULT (datetime('now')),
      created_by TEXT,
      FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
      FOREIGN KEY (lead_id) REFERENCES leads(lead_id),
      FOREIGN KEY (opportunity_id) REFERENCES opportunities(opportunity_id),
      FOREIGN KEY (assigned_to) REFERENCES users(user_id)
    );

    -- Activities table
    CREATE TABLE IF NOT EXISTS activities (
      activity_id TEXT PRIMARY KEY,
      activity_type TEXT NOT NULL CHECK(activity_type IN ('Call','Meeting','Email','Task')),
      subject TEXT NOT NULL,
      description TEXT,
      activity_date TEXT NOT NULL,
      customer_id TEXT,
      lead_id TEXT,
      opportunity_id TEXT,
      assigned_to TEXT,
      status TEXT NOT NULL DEFAULT 'Planned' CHECK(status IN ('Planned','Completed','Cancelled')),
      created_date TEXT DEFAULT (datetime('now')),
      modified_date TEXT DEFAULT (datetime('now')),
      created_by TEXT,
      FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
      FOREIGN KEY (lead_id) REFERENCES leads(lead_id),
      FOREIGN KEY (opportunity_id) REFERENCES opportunities(opportunity_id),
      FOREIGN KEY (assigned_to) REFERENCES users(user_id)
    );

    -- AuditLog table
    CREATE TABLE IF NOT EXISTS audit_logs (
      audit_log_id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      entity_name TEXT NOT NULL,
      record_id TEXT,
      old_value TEXT,
      new_value TEXT,
      ip_address TEXT,
      details TEXT,
      result TEXT NOT NULL DEFAULT 'Success' CHECK(result IN ('Success','Failure')),
      created_date TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
    CREATE INDEX IF NOT EXISTS idx_customers_owner ON customers(owner_id);
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities(stage);
    CREATE INDEX IF NOT EXISTS idx_opportunities_assigned ON opportunities(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_followups_date ON follow_ups(follow_up_date);
    CREATE INDEX IF NOT EXISTS idx_followups_status ON follow_ups(status);
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_name);
    CREATE INDEX IF NOT EXISTS idx_audit_date ON audit_logs(created_date);
  `);

  return database;
}

module.exports = { getDb, initializeDatabase };
