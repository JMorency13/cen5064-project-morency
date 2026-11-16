const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const app = require('../server');
const userStore = require('../src/data/userStore');
const eventStore = require('../src/data/eventStore');

describe('Account registration', () => {
  let directory;
  let usersFile;
  const account = {
    name: 'New User',
    email: 'new@example.edu',
    password: 'a-good-password',
    role: 'member'
  };

  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'event-users-test-'));
    usersFile = path.join(directory, 'users.json');
    userStore.init(usersFile);
    await eventStore.clear();
  });

  afterEach(() => {
    userStore.init(null);
    fs.rmSync(directory, { recursive: true, force: true });
  });

  for (const role of ['member', 'organizer']) {
    it(`persists a ${role} account and allows login after reloading the store`, async () => {
      const response = await request(app).post('/api/auth/register')
        .send({ ...account, role, email: ' NEW@example.edu ', name: ' New User ' }).expect(201);
      assert.strictEqual(response.body.data.user.role, role);
      assert.strictEqual(response.body.data.user.email, account.email);
      assert.strictEqual(response.body.data.user.name, account.name);
      assert.ok(response.body.data.token);
      assert.strictEqual(response.body.data.user.passwordHash, undefined);
      const file = fs.readFileSync(usersFile, 'utf8');
      assert.ok(!file.includes(account.password));
      const [saved] = JSON.parse(file);
      assert.match(saved.salt, /^[0-9a-f]{32}$/);
      assert.match(saved.passwordHash, /^[0-9a-f]{128}$/);
      userStore.init(usersFile);
      const login = await request(app).post('/api/auth/login')
        .send({ email: 'NEW@example.edu', password: account.password }).expect(200);
      assert.strictEqual(login.body.data.user.id, response.body.data.user.id);
      assert.strictEqual(login.body.data.user.role, role);
      await request(app).get('/api/auth/me')
        .set('Authorization', `Bearer ${login.body.data.token}`).expect(200);
      await request(app).post('/api/events')
        .set('Authorization', `Bearer ${login.body.data.token}`)
        .send({ title: 'Test event', date: '2099-05-10', time: '18:00', venue: 'Hall', capacity: 10 })
        .expect(role === 'organizer' ? 201 : 403);
      await request(app).post('/api/auth/login')
        .send({ email: account.email, password: 'wrong-password' }).expect(401);
    });
  }

  it('rejects invalid input without saving an account', async () => {
    for (const invalid of [
      { name: '' }, { name: 'x'.repeat(101) }, { email: 'invalid' },
      { password: 'short' }, { password: 'x'.repeat(129) }, { role: 'admin' }, { role: null }
    ]) {
      await request(app).post('/api/auth/register').send({ ...account, ...invalid }).expect(400);
    }
    assert.strictEqual(fs.existsSync(usersFile), false);
  });

  it('rejects duplicate and demo emails regardless of case, including simultaneous requests', async () => {
    await request(app).post('/api/auth/register')
      .send({ ...account, email: 'ORGANIZER@example.edu' }).expect(409);
    const responses = await Promise.all([
      request(app).post('/api/auth/register').send(account),
      request(app).post('/api/auth/register').send({ ...account, email: 'NEW@example.edu' })
    ]);
    assert.deepStrictEqual(responses.map((response) => response.status).sort(), [201, 409]);
    assert.strictEqual(JSON.parse(fs.readFileSync(usersFile, 'utf8')).length, 1);
  });

  it('reports a storage failure without creating an account', async () => {
    userStore.init(path.join(directory, 'missing-parent', 'users.json'));
    fs.writeFileSync(path.join(directory, 'missing-parent'), 'not a directory');
    const response = await request(app).post('/api/auth/register').send(account).expect(500);
    assert.strictEqual(response.body.success, false);
    assert.strictEqual(await userStore.findByEmail(account.email), null);
  });

  it('rejects malformed stored accounts instead of silently discarding them', () => {
    fs.writeFileSync(usersFile, JSON.stringify([{ email: account.email }]));
    assert.throws(() => userStore.init(usersFile), /Invalid user record/);
  });
});
