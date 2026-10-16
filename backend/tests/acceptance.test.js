const fs = require('fs');
const path = require('path');
const request = require('supertest');

const testDatabase = path.resolve(__dirname, '../data/acxiomcrm-test.db');
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = testDatabase;
process.env.JWT_SECRET = 'acceptance-test-secret';

const { initializeDatabase, getDb } = require('../src/config/database');
const { seedDatabase } = require('../src/config/seed');
const app = require('../src/app');

let adminToken;
let managerToken;
let salesToken;

async function login(username, password) {
  const response = await request(app).post('/api/auth/login').send({ username, password });
  return response.body.token;
}

describe('AcxiomCRM acceptance scenarios', () => {
  beforeAll(async () => {
    for (const suffix of ['', '-shm', '-wal']) {
      const file = `${testDatabase}${suffix}`;
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    initializeDatabase();
    await seedDatabase();
    adminToken = await login('admin', 'Admin@123');
    managerToken = await login('manager', 'Manager@123');
    salesToken = await login('sales1', 'Sales@123');
  });

  afterAll(() => {
    getDb().close();
    for (const suffix of ['', '-shm', '-wal']) {
      const file = `${testDatabase}${suffix}`;
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  });

  test('protects CRM endpoints without authentication', async () => {
    const response = await request(app).get('/api/customers');
    expect(response.status).toBe(401);
  });

  test('rejects invalid customer input on the server', async () => {
    const response = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerName: 'Invalid Customer', email: 'bad-email', phone: '123' });
    expect(response.status).toBe(400);
    expect(response.body.errors.map((error) => error.field)).toEqual(expect.arrayContaining(['email', 'phone']));
  });

  test('enforces opportunity and follow-up business rules', async () => {
    const invalidOpportunity = await request(app)
      .post('/api/opportunities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ opportunityName: 'Invalid', amount: 0, stage: 'Qualification', probability: 101, expectedCloseDate: '2099-01-01' });
    const pastFollowUp = await request(app)
      .post('/api/followups')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ subject: 'Past task', followUpDate: '2020-01-01', followUpType: 'Call' });
    expect(invalidOpportunity.status).toBe(400);
    expect(pastFollowUp.status).toBe(400);
  });

  test('applies role authorization and sales scope', async () => {
    const [salesUsers, managerPipeline, salesCustomers] = await Promise.all([
      request(app).get('/api/users').set('Authorization', `Bearer ${salesToken}`),
      request(app).get('/api/reports/pipeline').set('Authorization', `Bearer ${managerToken}`),
      request(app).get('/api/customers').set('Authorization', `Bearer ${salesToken}`),
    ]);
    expect(salesUsers.status).toBe(403);
    expect(managerPipeline.status).toBe(200);
    expect(salesCustomers.status).toBe(200);
    expect(salesCustomers.body.data.every((customer) => customer.owner_id === 'user-sales-1')).toBe(true);
  });

  test('logs customer create, update, and deactivation', async () => {
    const created = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerName: 'Acceptance Customer', email: 'acceptance@example.com', phone: '9999888877' });
    const id = created.body.data.customer_id;
    const updated = await request(app)
      .put(`/api/customers/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerName: 'Acceptance Customer Updated' });
    const deactivated = await request(app)
      .delete(`/api/customers/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    const audit = await request(app).get('/api/reports/audit?limit=50').set('Authorization', `Bearer ${adminToken}`);
    const actions = audit.body.data.filter((entry) => entry.record_id === id).map((entry) => entry.action);

    expect(created.status).toBe(201);
    expect(updated.status).toBe(200);
    expect(deactivated.status).toBe(200);
    expect(actions).toEqual(expect.arrayContaining(['Create', 'Update', 'Delete']));
  });
});
