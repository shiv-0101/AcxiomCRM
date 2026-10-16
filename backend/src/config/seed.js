const { getDb } = require('../config/database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function seedDatabase() {
  const db = getDb();

  // Check if already seeded
  const existingRoles = db.prepare('SELECT COUNT(*) as count FROM roles').get();
  if (existingRoles.count > 0) {
    console.log('[Seed] Database already seeded, skipping.');
    return;
  }

  console.log('[Seed] Seeding database with initial data...');

  // Seed Roles
  const roles = [
    { role_id: 'role-admin', role_name: 'Admin', description: 'Full application administration' },
    { role_id: 'role-manager', role_name: 'Manager', description: 'Team management and reports' },
    { role_id: 'role-sales', role_name: 'SalesExecutive', description: 'Assigned sales records management' },
  ];

  const insertRole = db.prepare(
    'INSERT INTO roles (role_id, role_name, description) VALUES (?, ?, ?)'
  );
  const seedRoles = db.transaction(() => {
    for (const role of roles) {
      insertRole.run(role.role_id, role.role_name, role.description);
    }
  });
  seedRoles();

  // Seed Users
  const saltRounds = 12;
  const adminHash = await bcrypt.hash('Admin@123', saltRounds);
  const managerHash = await bcrypt.hash('Manager@123', saltRounds);
  const salesHash = await bcrypt.hash('Sales@123', saltRounds);

  const users = [
    {
      user_id: 'user-admin-1',
      username: 'admin',
      email: 'admin@acxiomcrm.com',
      password_hash: adminHash,
      first_name: 'System',
      last_name: 'Admin',
      role_id: 'role-admin',
    },
    {
      user_id: 'user-manager-1',
      username: 'manager',
      email: 'manager@acxiomcrm.com',
      password_hash: managerHash,
      first_name: 'John',
      last_name: 'Manager',
      role_id: 'role-manager',
    },
    {
      user_id: 'user-sales-1',
      username: 'sales1',
      email: 'sales1@acxiomcrm.com',
      password_hash: salesHash,
      first_name: 'Jane',
      last_name: 'Sales',
      role_id: 'role-sales',
    },
    {
      user_id: 'user-sales-2',
      username: 'sales2',
      email: 'sales2@acxiomcrm.com',
      password_hash: await bcrypt.hash('Sales@456', saltRounds),
      first_name: 'Bob',
      last_name: 'Smith',
      role_id: 'role-sales',
    },
  ];

  const insertUser = db.prepare(
    `INSERT INTO users (user_id, username, email, password_hash, first_name, last_name, role_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'system')`
  );
  const seedUsers = db.transaction(() => {
    for (const u of users) {
      insertUser.run(u.user_id, u.username, u.email, u.password_hash, u.first_name, u.last_name, u.role_id);
    }
  });
  seedUsers();

  // Seed Customers
  const customers = [
    { id: uuidv4(), code: 'CUST-001', name: 'Acme Corporation', email: 'contact@acme.com', phone: '9876543210', company: 'Acme Corp', city: 'Mumbai', state: 'Maharashtra', status: 'Active', owner: 'user-sales-1' },
    { id: uuidv4(), code: 'CUST-002', name: 'TechVision Ltd', email: 'info@techvision.com', phone: '9876543211', company: 'TechVision', city: 'Pune', state: 'Maharashtra', status: 'Active', owner: 'user-sales-2' },
    { id: uuidv4(), code: 'CUST-003', name: 'Global Traders', email: 'sales@globaltraders.com', phone: '9876543212', company: 'Global Traders', city: 'Delhi', state: 'Delhi', status: 'Prospect', owner: 'user-sales-1' },
    { id: uuidv4(), code: 'CUST-004', name: 'StartupXYZ', email: 'hello@startupxyz.com', phone: '9876543213', company: 'StartupXYZ', city: 'Bangalore', state: 'Karnataka', status: 'Active', owner: 'user-sales-2' },
    { id: uuidv4(), code: 'CUST-005', name: 'MegaRetail Inc', email: 'business@megaretail.com', phone: '9876543214', company: 'MegaRetail', city: 'Chennai', state: 'Tamil Nadu', status: 'Inactive', owner: 'user-sales-1' },
  ];

  const insertCustomer = db.prepare(
    `INSERT INTO customers (customer_id, customer_code, customer_name, email, phone, company_name, city, state, status, owner_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user-admin-1')`
  );
  const seedCustomers = db.transaction(() => {
    for (const c of customers) {
      insertCustomer.run(c.id, c.code, c.name, c.email, c.phone, c.company, c.city, c.state, c.status, c.owner);
    }
  });
  seedCustomers();

  // Seed Leads
  const leadStatuses = ['New', 'Contacted', 'Qualified', 'Unqualified', 'Converted', 'Lost'];
  const sources = ['Website', 'Referral', 'Cold Call', 'Email', 'LinkedIn'];
  const leads = [];
  for (let i = 1; i <= 8; i++) {
    leads.push({
      id: `lead-demo-${i.toString().padStart(3, '0')}`,
      code: `LEAD-${i.toString().padStart(3, '0')}`,
      name: `Lead Contact ${i}`,
      email: `lead${i}@example.com`,
      phone: `987654${(3220 + i).toString()}`,
      company: `Company ${i}`,
      source: sources[i % sources.length],
      status: leadStatuses[i % leadStatuses.length],
      priority: i % 3 === 0 ? 'High' : i % 2 === 0 ? 'Low' : 'Medium',
      expected_value: (i * 50000),
      assigned_to: i % 2 === 0 ? 'user-sales-2' : 'user-sales-1',
    });
  }

  const insertLead = db.prepare(
    `INSERT INTO leads (lead_id, lead_code, lead_name, email, phone, company_name, source, status, priority, expected_value, assigned_to, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user-admin-1')`
  );
  const seedLeads = db.transaction(() => {
    for (const l of leads) {
      insertLead.run(l.id, l.code, l.name, l.email, l.phone, l.company, l.source, l.status, l.priority, l.expected_value, l.assigned_to);
    }
  });
  seedLeads();

  // Seed Opportunities
  const stages = ['Qualification', 'Proposal', 'Negotiation', 'Won', 'Lost'];
  const custIds = customers.map(c => c.id);
  const opportunities = [];
  for (let i = 1; i <= 6; i++) {
    const closeDate = new Date();
    closeDate.setDate(closeDate.getDate() + (i * 15));
    opportunities.push({
      id: `opp-demo-${i.toString().padStart(3, '0')}`,
      name: `Opportunity ${i}`,
      customer_id: custIds[(i - 1) % custIds.length],
      amount: i * 100000,
      stage: stages[i % stages.length],
      probability: [20, 40, 60, 90, 10][i % 5],
      expected_close_date: closeDate.toISOString().split('T')[0],
      status: i <= 4 ? 'Open' : (i === 5 ? 'Won' : 'Lost'),
      assigned_to: i % 2 === 0 ? 'user-sales-2' : 'user-sales-1',
    });
  }

  const insertOpp = db.prepare(
    `INSERT INTO opportunities (opportunity_id, opportunity_name, customer_id, amount, stage, probability, expected_close_date, status, assigned_to, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'user-admin-1')`
  );
  const seedOpps = db.transaction(() => {
    for (const o of opportunities) {
      insertOpp.run(o.id, o.name, o.customer_id, o.amount, o.stage, o.probability, o.expected_close_date, o.status, o.assigned_to);
    }
  });
  seedOpps();

  // Seed FollowUps
  const followUpStatuses = ['Planned', 'Completed', 'Missed', 'Cancelled'];
  const followUps = [];
  for (let i = 1; i <= 6; i++) {
    const fDate = new Date();
    fDate.setDate(fDate.getDate() + i);
    followUps.push({
      id: `fu-demo-${i.toString().padStart(3, '0')}`,
      customer_id: custIds[(i - 1) % custIds.length],
      follow_up_date: fDate.toISOString().split('T')[0],
      follow_up_type: ['Call', 'Meeting', 'Email', 'Task'][i % 4],
      subject: `Follow up with Customer ${i}`,
      status: followUpStatuses[i % followUpStatuses.length],
      assigned_to: i % 2 === 0 ? 'user-sales-2' : 'user-sales-1',
    });
  }

  const insertFU = db.prepare(
    `INSERT INTO follow_ups (follow_up_id, customer_id, follow_up_date, follow_up_type, subject, status, assigned_to, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'user-admin-1')`
  );
  const seedFUs = db.transaction(() => {
    for (const f of followUps) {
      insertFU.run(f.id, f.customer_id, f.follow_up_date, f.follow_up_type, f.subject, f.status, f.assigned_to);
    }
  });
  seedFUs();

  // Seed audit log entries
  const insertAudit = db.prepare(
    `INSERT INTO audit_logs (audit_log_id, user_id, action, entity_name, record_id, result, details)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const seedAudit = db.transaction(() => {
    insertAudit.run(uuidv4(), 'user-admin-1', 'Create', 'User', 'user-manager-1', 'Success', 'Seed: Created manager user');
    insertAudit.run(uuidv4(), 'user-admin-1', 'Create', 'User', 'user-sales-1', 'Success', 'Seed: Created sales user 1');
    insertAudit.run(uuidv4(), 'user-admin-1', 'Create', 'Customer', custIds[0], 'Success', 'Seed: Created demo customer');
  });
  seedAudit();

  console.log('[Seed] Database seeding complete.');
  console.log('[Seed] Demo users:');
  console.log('  Admin:   admin / Admin@123');
  console.log('  Manager: manager / Manager@123');
  console.log('  Sales:   sales1 / Sales@123');
}

module.exports = { seedDatabase };
