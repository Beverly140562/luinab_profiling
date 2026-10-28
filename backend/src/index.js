
require('dotenv').config();

const express = require('express');
const cors = require('cors');

const { initDb, query } = require('./db');
const { hashPassword } = require('./lib/auth');

const app = express();

/* ========================================================
   ENVIRONMENT CONFIGURATION
======================================================== */

const PORT = process.env.PORT || 4000;

const configuredOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

/* ========================================================
   MIDDLEWARE
======================================================== */

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests without an Origin header, such as
      // health checks and server-to-server requests.
      if (!origin) {
        return callback(null, true);
      }

      // Configure allowed frontend origins in production.
      // Development fallback permits local Vite development.
      const allowedOrigins = configuredOrigins.length
        ? configuredOrigins
        : ['http://localhost:5173', 'http://127.0.0.1:5173'];

      if (allowedOrigins.includes(origin.replace(/\/+$/, ''))) {
        return callback(null, true);
      }

      return callback(new Error('Origin not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '1mb' }));

/* ========================================================
   DATABASE SEEDING
======================================================== */

async function seedUsers() {
  const existing = await query(
    'SELECT COUNT(*)::int AS n FROM users'
  );

  // Never overwrite or recreate accounts when users already exist.
  if (Number(existing[0]?.n || 0) > 0) {
    console.log('Existing users found; skipping default user seeding.');
    return;
  }

  const defaultUsers = [
    {
      email: 'admin@luinab.gov.ph',
      fullName: 'System Administrator',
      password: process.env.SEED_ADMIN_PASSWORD,
      role: 'admin',
      username: 'admin',
    },
    {
      email: 'captain@luinab.gov.ph',
      fullName: 'Barangay Captain',
      password: process.env.SEED_CAPTAIN_PASSWORD,
      role: 'captain',
      username: 'captain',
    },
    {
      email: 'staff@luinab.gov.ph',
      fullName: 'Barangay Secretary',
      password: process.env.SEED_STAFF_PASSWORD,
      role: 'staff',
      username: 'staff',
    },
  ];

  // Avoid creating predictable default passwords in production.
  const missingPasswords = defaultUsers.filter(
    (user) => !user.password
  );

  if (missingPasswords.length) {
    console.warn(
      'User table is empty. Default accounts were not seeded because one or more SEED_*_PASSWORD variables are missing.'
    );
    return;
  }

  for (const user of defaultUsers) {
    await query(
      `INSERT INTO users
        (email, full_name, password, roles, username)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        user.email,
        user.fullName,
        hashPassword(user.password),
        user.role,
        user.username,
      ]
    );
  }

  console.log('Default user accounts seeded successfully.');
}

/* ========================================================
   HEALTH CHECK
======================================================== */

app.get('/', (req, res) => {
  res.status(200).json({
    name: 'Barangay Luinab API',
    status: 'ok',
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'barangay-luinab-api',
  });
});

/* ========================================================
   API ROUTES
======================================================== */

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/households', require('./routes/households'));
app.use('/api/validation', require('./routes/validation'));
app.use('/api/programs', require('./routes/programs'));
app.use('/api/distributions', require('./routes/distributions'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/activity', require('./routes/activity'));
app.use('/api/calamity', require('./routes/calamity'));
app.use('/api/history', require('./routes/history'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/public', require('./routes/public'));

/* ========================================================
   NOT FOUND HANDLER
======================================================== */

app.use('/api', (req, res) => {
  res.status(404).json({
    error: 'API route not found.',
    path: req.originalUrl,
  });
});

/* ========================================================
   GLOBAL ERROR HANDLER
======================================================== */

app.use((err, req, res, next) => {
  console.error('Express error:', err.message);

  if (err.message === 'Origin not allowed by CORS') {
    return res.status(403).json({
      error: 'This website is not allowed to access the API.',
    });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'Invalid JSON request body.',
    });
  }

  if (res.headersSent) {
    return next(err);
  }

  return res.status(500).json({
    error: 'Internal server error.',
  });
});

/* ========================================================
   START SERVER
======================================================== */

async function main() {
  await initDb();
  await seedUsers();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Barangay Luinab API listening on port ${PORT}`);
  });
}

main().catch((error) => {
  console.error('Fatal startup error:', error);
  process.exit(1);
});
