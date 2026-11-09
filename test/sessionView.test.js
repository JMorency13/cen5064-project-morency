const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const request = require('supertest');
const app = require('../server');
const eventStore = require('../src/data/eventStore');
const userStore = require('../src/data/userStore');
const { credentialsByRole } = require('./helpers/auth');

const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
}

async function createPage(storage, fetchOverride, confirm = () => true) {
  const elements = new Map();
  for (const match of html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)) {
    const listeners = {};
    const element = {
      hidden: /\shidden(?:\s|>)/.test(match[0]),
      value: '',
      textContent: '',
      className: '',
      children: [],
      addEventListener(type, handler) { listeners[type] = handler; },
      dispatch(type) { return listeners[type]({ preventDefault() {} }); },
      replaceChildren() { this.children = []; },
      appendChild(child) { this.children.push(child); },
      reset() {},
      querySelector() { return this.submitButton; },
      submitButton: { textContent: 'Create event' }
    };
    elements.set(match[1], element);
  }

  const document = {
    getElementById: (id) => {
      assert.ok(elements.has(id), `Missing element ${id}`);
      return elements.get(id);
    },
    createElement: () => {
      const listeners = {};
      return {
        children: [],
        addEventListener(type, handler) { listeners[type] = handler; },
        dispatch(type) { return listeners[type](); },
        appendChild(child) { this.children.push(child); }
      };
    }
  };
  const fetch = async (url, options = {}) => {
    if (fetchOverride) {
      const overridden = await fetchOverride(url, options);
      if (overridden) return overridden;
    }
    let call = request(app)[(options.method || 'GET').toLowerCase()](url);
    for (const [name, value] of Object.entries(options.headers || {})) {
      call = call.set(name, value);
    }
    if (options.body) call = call.send(JSON.parse(options.body));
    const response = await call;
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.body
    };
  };
  const ready = vm.runInNewContext(script, { document, localStorage: storage, fetch, window: { confirm } });
  await ready;
  return elements;
}

describe('Browser session and account view', () => {
  beforeEach(async () => {
    await eventStore.clear();
    userStore.init(null);
  });

  afterEach(() => userStore.init(null));

  it('lets an organizer confirm cancellation and displays it with a notification to the member', async () => {
    await eventStore.save({
      id: 'event-1',
      title: 'Study Session',
      date: '2099-05-10',
      time: '18:00',
      venue: 'Main Hall',
      capacity: 5,
      createdBy: 'organizer-1',
      createdAt: new Date().toISOString(),
      rsvps: ['member-456'],
      status: 'open'
    });
    let confirmed = false;
    const page = await createPage(createStorage(), null, () => confirmed);
    page.get('email').value = credentialsByRole.organizer.email;
    page.get('password').value = credentialsByRole.organizer.password;
    await page.get('login-form').dispatch('submit');
    let row = page.get('events').children[0];
    let cancel = row.children[6].children[1];
    assert.strictEqual(cancel.textContent, 'Cancel event');
    await cancel.dispatch('click');
    assert.strictEqual((await eventStore.findAll())[0].status, 'open');
    confirmed = true;
    await cancel.dispatch('click');
    row = page.get('events').children[0];
    assert.strictEqual(row.children[5].textContent, 'cancelled');
    assert.strictEqual(row.children[6].children.length, 1);
    assert.match(page.get('message').textContent, /Cancelled/);

    page.get('show-account').dispatch('click');
    await page.get('logout').dispatch('click');
    page.get('email').value = credentialsByRole.member.email;
    page.get('password').value = credentialsByRole.member.password;
    await page.get('login-form').dispatch('submit');
    row = page.get('events').children[0];
    assert.strictEqual(row.children[5].textContent, 'cancelled');
    assert.strictEqual(row.children[6].children[0].disabled, true);
    assert.match(page.get('notifications').children[0].textContent, /Study Session.*cancelled/);
  });

  for (const role of ['organizer', 'member']) {
    it(`registers a ${role} and restores the session after reload`, async () => {
      const storage = createStorage();
      let page = await createPage(storage);
      page.get('show-register').dispatch('click');
      assert.strictEqual(page.get('register-section').hidden, false);
      page.get('register-name').value = 'New User';
      page.get('register-email').value = `new-${role}@example.edu`;
      page.get('register-password').value = 'a-good-password';
      page.get('register-role').value = role;
      await page.get('register-form').dispatch('submit');
      assert.strictEqual(page.get('application').hidden, false);
      assert.strictEqual(page.get('current-role').textContent, role);
      page = await createPage(storage);
      assert.strictEqual(page.get('current-role').textContent, role);
      assert.strictEqual(page.get(`${role}-section`).hidden, false);
    });
  }

  it('displays registration errors without signing in', async () => {
    const page = await createPage(createStorage());
    page.get('show-register').dispatch('click');
    page.get('register-name').value = 'New User';
    page.get('register-email').value = 'member@example.edu';
    page.get('register-password').value = 'a-good-password';
    page.get('register-role').value = 'member';
    await page.get('register-form').dispatch('submit');
    assert.strictEqual(page.get('register-section').hidden, false);
    assert.match(page.get('register-message').textContent, /already exists/);
    assert.strictEqual(page.get('application').hidden, true);
  });

  for (const role of ['organizer', 'member']) {
    it(`restores the ${role} session after reload and logs out from the account view`, async () => {
      const storage = createStorage();
      let page = await createPage(storage);
      assert.strictEqual(page.get('login-section').hidden, false);
      page.get('email').value = credentialsByRole[role].email;
      page.get('password').value = credentialsByRole[role].password;
      await page.get('login-form').dispatch('submit');

      const token = storage.getItem('event-management-token');
      assert.ok(token);
      assert.strictEqual(page.get('application').hidden, false);
      page = await createPage(storage);
      assert.strictEqual(page.get('login-section').hidden, true);
      assert.strictEqual(page.get('application').hidden, false);
      assert.strictEqual(page.get('current-role').textContent, role);
      assert.strictEqual(page.get(`${role}-section`).hidden, false);

      page.get('show-account').dispatch('click');
      assert.strictEqual(page.get('dashboard').hidden, true);
      assert.strictEqual(page.get('account-section').hidden, false);
      assert.strictEqual(page.get('account-email').textContent, credentialsByRole[role].email);
      assert.strictEqual(page.get('account-role').textContent, role);
      page.get('show-dashboard').dispatch('click');
      assert.strictEqual(page.get('dashboard').hidden, false);
      page.get('show-account').dispatch('click');
      await page.get('logout').dispatch('click');

      assert.strictEqual(storage.getItem('event-management-token'), null);
      assert.strictEqual(page.get('login-section').hidden, false);
      assert.strictEqual(page.get('application').hidden, true);
      await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
      page = await createPage(storage);
      assert.strictEqual(page.get('login-section').hidden, false);
      assert.strictEqual(page.get('application').hidden, true);
    });
  }

  it('clears an invalid saved session and returns to login', async () => {
    const storage = createStorage();
    storage.setItem('event-management-token', 'invalid-token');
    const page = await createPage(storage);
    assert.strictEqual(storage.getItem('event-management-token'), null);
    assert.strictEqual(page.get('login-section').hidden, false);
    assert.match(page.get('login-message').textContent, /session has ended/i);
  });

  it('retains the saved session and offers a retry when restoration fails', async () => {
    const login = await request(app).post('/api/auth/login')
      .send(credentialsByRole.member).expect(200);
    const storage = createStorage();
    storage.setItem('event-management-token', login.body.data.token);
    let offline = true;
    const page = await createPage(storage, async (url) => {
      if (url === '/api/auth/me' && offline) throw new Error('Network unavailable');
    });

    assert.strictEqual(page.get('login-section').hidden, false);
    assert.strictEqual(page.get('retry-session').hidden, false);
    assert.match(page.get('login-message').textContent, /Network unavailable/);
    assert.strictEqual(storage.getItem('event-management-token'), login.body.data.token);
    offline = false;
    await page.get('retry-session').dispatch('click');
    assert.strictEqual(page.get('application').hidden, false);
    assert.strictEqual(page.get('current-role').textContent, 'member');
  });

  it('returns to login if a session is invalidated while the account view is open', async () => {
    const storage = createStorage();
    const page = await createPage(storage);
    page.get('email').value = credentialsByRole.member.email;
    page.get('password').value = credentialsByRole.member.password;
    await page.get('login-form').dispatch('submit');
    const token = storage.getItem('event-management-token');
    await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`).expect(200);

    page.get('show-account').dispatch('click');
    await page.get('logout').dispatch('click');
    assert.strictEqual(page.get('login-section').hidden, false);
    assert.strictEqual(storage.getItem('event-management-token'), null);
    assert.match(page.get('login-message').textContent, /session has ended/i);
  });

  it('reports a logout failure without pretending the session was revoked', async () => {
    const storage = createStorage();
    const page = await createPage(storage, async (url) => {
      if (url === '/api/auth/logout') throw new Error('Network unavailable');
    });
    page.get('email').value = credentialsByRole.organizer.email;
    page.get('password').value = credentialsByRole.organizer.password;
    await page.get('login-form').dispatch('submit');
    page.get('show-account').dispatch('click');
    await page.get('logout').dispatch('click');

    assert.strictEqual(page.get('application').hidden, false);
    assert.ok(storage.getItem('event-management-token'));
    assert.match(page.get('message').textContent, /Network unavailable/);
  });
});
