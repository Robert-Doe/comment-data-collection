'use strict';

const crypto = require('crypto');
const { Pool } = require('pg');

// ─── Constants ───────────────────────────────────────────────────────────────
const PW_SECRET = '1397ab035ae258eaf9a167560f262ba79e35de8064b4a6835e23cd3608c1eafb';

const TTL_MS = {
  admin:      30 * 24 * 60 * 60 * 1000,   // 30 days
  supervisor:  7 * 24 * 60 * 60 * 1000,   //  7 days
  labeller:    7 * 24 * 60 * 60 * 1000,   //  7 days
  guest:              15 * 60 * 1000,      // 15 minutes
};

// ─── Crypto helpers ──────────────────────────────────────────────────────────
function hashPw(pw) {
  return crypto.createHmac('sha256', PW_SECRET).update(String(pw)).digest('hex');
}
function verifyPw(pw, storedHash) {
  try {
    const a = Buffer.from(hashPw(pw), 'hex');
    const b = Buffer.from(String(storedHash), 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (_) { return false; }
}
function genToken() { return crypto.randomBytes(32).toString('hex'); }

// ─── Factory ─────────────────────────────────────────────────────────────────
function createAuthModule(databaseUrl) {
  const pool = new Pool({ connectionString: databaseUrl });

  // Schema — runs once at startup
  pool.query(`
    CREATE TABLE IF NOT EXISTS auth_users (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'labeller'
                    CHECK (role IN ('admin','supervisor','labeller')),
      display_name  TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      last_login    TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      token      TEXT UNIQUE NOT NULL,
      user_id    UUID REFERENCES auth_users(id) ON DELETE CASCADE,
      role       TEXT NOT NULL,
      label      TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS auth_sessions_token_idx ON auth_sessions (token);
  `).catch(e => console.error('[auth] schema init:', e.message));

  // Clean expired sessions every 15 min
  setInterval(
    () => pool.query("DELETE FROM auth_sessions WHERE expires_at < NOW()").catch(() => {}),
    15 * 60 * 1000
  );

  // ── Session helpers ───────────────────────────────────────────────────────
  async function newSession(userId, role, ttl, label) {
    const token = genToken();
    await pool.query(
      'INSERT INTO auth_sessions (token, user_id, role, label, expires_at) VALUES ($1,$2,$3,$4,$5)',
      [token, userId || null, role, label || null, new Date(Date.now() + ttl)]
    );
    return token;
  }

  async function findSession(token) {
    if (!token) return null;
    const { rows } = await pool.query(
      `SELECT s.*, u.email, u.display_name, u.id AS user_id
       FROM auth_sessions s
       LEFT JOIN auth_users u ON u.id = s.user_id
       WHERE s.token = $1 AND s.expires_at > NOW()`,
      [token]
    );
    return rows[0] || null;
  }

  async function adminCount() {
    const { rows } = await pool.query("SELECT COUNT(*) AS c FROM auth_users WHERE role='admin'");
    return parseInt(rows[0].c, 10);
  }

  // ── Middleware ────────────────────────────────────────────────────────────
  const PUBLIC = new Set([
    '/api/auth/login', '/api/auth/guest-login', '/api/auth/logout',
    '/api/auth/check', '/api/auth/setup-status', '/api/auth/setup',
  ]);

  async function authMiddleware(req, res, next) {
    // Synthetic data pages must be accessible to the internal crawler without auth
    if (req.path.startsWith('/synthetic')) return next();
    if (PUBLIC.has(req.path)) return next();

    const hdr   = req.headers['authorization'] || '';
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const session = await findSession(token).catch(() => null);
    if (!session)  return res.status(401).json({ error: 'Unauthorized' });

    req.auth = session;
    next();
  }

  function requireRole(...roles) {
    return (req, res, next) => {
      if (!req.auth || !roles.includes(req.auth.role))
        return res.status(403).json({ error: 'Forbidden' });
      next();
    };
  }

  // ── First-time setup (only works when zero admin accounts exist) ──────────
  async function setupStatusHandler(req, res) {
    try {
      res.json({ setup_needed: (await adminCount()) === 0 });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
  }

  async function setupHandler(req, res) {
    try {
      if ((await adminCount()) > 0) return res.status(403).json({ error: 'Setup already completed' });
      const { email, password, display_name } = req.body || {};
      if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
      const { rows } = await pool.query(
        "INSERT INTO auth_users (email, password_hash, role, display_name) VALUES ($1,$2,'admin',$3) RETURNING id, email, role",
        [email.trim().toLowerCase(), hashPw(password), display_name || null]
      );
      const token = await newSession(rows[0].id, 'admin', TTL_MS.admin);
      res.status(201).json({ token, role: 'admin', email: rows[0].email, expires_in: TTL_MS.admin / 1000 });
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'Email already exists' });
      console.error('[auth] setup:', e.message);
      res.status(500).json({ error: 'Server error' });
    }
  }

  // ── Login / logout / check ────────────────────────────────────────────────
  async function loginHandler(req, res) {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
      const { rows } = await pool.query(
        'SELECT * FROM auth_users WHERE lower(email)=lower($1)', [String(email).trim()]
      );
      const user = rows[0];
      if (!user || !verifyPw(String(password), user.password_hash)) {
        await new Promise(r => setTimeout(r, 500));
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      const ttl   = TTL_MS[user.role] || TTL_MS.labeller;
      const token = await newSession(user.id, user.role, ttl);
      await pool.query('UPDATE auth_users SET last_login=NOW() WHERE id=$1', [user.id]);
      res.json({ token, role: user.role, email: user.email, display_name: user.display_name, expires_in: ttl / 1000 });
    } catch (e) { console.error('[auth] login:', e.message); res.status(500).json({ error: 'Server error' }); }
  }

  async function guestLoginHandler(req, res) {
    try {
      const { token } = req.body || {};
      if (!token) return res.status(400).json({ error: 'Token required' });
      const session = await findSession(String(token).trim());
      const tokenAllowedRoles = ['guest', 'supervisor'];
      if (!session || !tokenAllowedRoles.includes(session.role))
        return res.status(401).json({ error: 'Invalid or expired link' });
      const remaining = Math.max(0, Math.floor((new Date(session.expires_at) - Date.now()) / 1000));
      res.json({ token: session.token, role: 'guest', expires_in: remaining, label: session.label });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
  }

  async function logoutHandler(req, res) {
    const hdr   = req.headers['authorization'] || '';
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
    if (token) await pool.query('DELETE FROM auth_sessions WHERE token=$1', [token]).catch(() => {});
    res.json({ ok: true });
  }

  async function checkHandler(req, res) {
    const hdr     = req.headers['authorization'] || '';
    const token   = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
    const session = token ? await findSession(token).catch(() => null) : null;
    if (!session) return res.status(401).json({ authenticated: false });
    res.json({
      authenticated: true, role: session.role,
      email: session.email, display_name: session.display_name,
      expires_at: session.expires_at,
    });
  }

  // ── Admin: user management ────────────────────────────────────────────────
  async function listUsersHandler(req, res) {
    try {
      const { rows } = await pool.query(
        'SELECT id, email, display_name, role, created_at, last_login FROM auth_users ORDER BY created_at'
      );
      res.json({ users: rows });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
  }

  async function createUserHandler(req, res) {
    try {
      const { email, password, role = 'labeller', display_name } = req.body || {};
      if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
      if (!['supervisor', 'labeller'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
      const { rows } = await pool.query(
        'INSERT INTO auth_users (email, password_hash, role, display_name) VALUES ($1,$2,$3,$4) RETURNING id, email, role, display_name',
        [email.trim().toLowerCase(), hashPw(String(password)), role, display_name || null]
      );
      res.status(201).json({ user: rows[0] });
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'Email already in use' });
      res.status(500).json({ error: 'Server error' });
    }
  }

  async function updateUserHandler(req, res) {
    try {
      const { id } = req.params;
      const { password, display_name } = req.body || {};
      if (password)             await pool.query('UPDATE auth_users SET password_hash=$1 WHERE id=$2', [hashPw(String(password)), id]);
      if (display_name != null) await pool.query('UPDATE auth_users SET display_name=$1  WHERE id=$2', [display_name, id]);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
  }

  async function deleteUserHandler(req, res) {
    try {
      const { id } = req.params;
      if (req.auth && req.auth.user_id === id) return res.status(400).json({ error: 'Cannot delete your own account' });
      await pool.query("DELETE FROM auth_users WHERE id=$1 AND role != 'admin'", [id]);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
  }

  // ── Admin: guest tokens ───────────────────────────────────────────────────
  async function createGuestTokenHandler(req, res) {
    try {
      const { label, role: requestedRole, ttl_days } = req.body || {};
      const allowedRoles = ['guest', 'supervisor'];
      const role = allowedRoles.includes(requestedRole) ? requestedRole : 'guest';
      const ttl  = role === 'supervisor'
        ? (ttl_days ? Math.min(90, Math.max(1, Number(ttl_days))) * 24 * 60 * 60 * 1000 : TTL_MS.supervisor)
        : TTL_MS.guest;
      const token = await newSession(null, role, ttl, label || (role === 'supervisor' ? 'Supervisor' : 'Guest'));
      const { rows } = await pool.query(
        'SELECT id, token, role, label, expires_at FROM auth_sessions WHERE token=$1', [token]
      );
      res.status(201).json(rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
  }

  async function listGuestTokensHandler(req, res) {
    try {
      const { rows } = await pool.query(
        "SELECT id, token, role, label, expires_at, created_at FROM auth_sessions WHERE role IN ('guest','supervisor') AND user_id IS NULL AND expires_at>NOW() ORDER BY created_at DESC"
      );
      res.json({ tokens: rows });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
  }

  async function revokeGuestTokenHandler(req, res) {
    try {
      await pool.query("DELETE FROM auth_sessions WHERE id=$1 AND role IN ('guest','supervisor') AND user_id IS NULL", [req.params.id]);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
  }

  return {
    authMiddleware, requireRole,
    setupStatusHandler, setupHandler,
    loginHandler, guestLoginHandler, logoutHandler, checkHandler,
    listUsersHandler, createUserHandler, updateUserHandler, deleteUserHandler,
    createGuestTokenHandler, listGuestTokensHandler, revokeGuestTokenHandler,
  };
}

module.exports = { createAuthModule };
