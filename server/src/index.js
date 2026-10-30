import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import helmet from 'helmet';
import morgan from 'morgan';
import crypto from 'node:crypto';
import { readReports, writeReports } from './store.js';
import { transcribeWithGnani } from './gnani.js';

const app = express();
const port = Number(process.env.PORT || 4000);

// Allow local development origins and explicitly configured
// production frontend origins.
const localOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176'
];

const productionOrigins = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = new Set([
  ...localOrigins,
  ...productionOrigins
]);

// Audio upload configuration
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const allowedTypes = new Set([
      'audio/webm',
      'audio/wav',
      'audio/x-wav',
      'audio/mpeg',
      'audio/mp4',
      'audio/ogg',
      'audio/flac'
    ]);

    if (allowedTypes.has(file.mimetype)) {
      callback(null, true);
    } else {
      callback(
        new Error(
          'Unsupported audio format. Please use a supported audio recording format.'
        )
      );
    }
  }
});

// Middleware
app.use(helmet());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    const error = new Error('Origin not allowed by CORS.');
    error.status = 403;
    return callback(error);
  },
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

const animalTypes = new Set(['Dog', 'Cat', 'Bird', 'Other']);
const statuses = new Set(['New', 'Reviewing', 'Assigned', 'Resolved']);

const clean = (value, max = 500) =>
  String(value ?? '').trim().slice(0, max);

// --------------------------------------------------
// Supabase authentication configuration
// --------------------------------------------------

const supabaseUrl = (process.env.SUPABASE_URL || '')
  .replace(/\/+$/, '');

const supabaseApiKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  '';

const volunteerEmails = new Set(
  (process.env.VOLUNTEER_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

// --------------------------------------------------
// Volunteer authentication middleware
// --------------------------------------------------

async function requireVolunteer(req, res, next) {
  try {
    const authorization = req.headers.authorization || '';
    const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);

    if (!tokenMatch) {
      return res.status(401).json({
        error: 'Please log in as an approved volunteer.'
      });
    }

    if (!supabaseUrl || !supabaseApiKey) {
      console.error(
        'Supabase server authentication settings are missing.'
      );

      return res.status(503).json({
        error: 'Volunteer authentication is not configured on the server.'
      });
    }

    if (volunteerEmails.size === 0) {
      console.error('VOLUNTEER_EMAILS is not configured.');

      return res.status(503).json({
        error: 'The volunteer allowlist is not configured on the server.'
      });
    }

    // Verify the access token with Supabase Auth.
    const authResponse = await fetch(
      `${supabaseUrl}/auth/v1/user`,
      {
        method: 'GET',
        headers: {
          apikey: supabaseApiKey,
          Authorization: `Bearer ${tokenMatch[1]}`
        },
        signal: AbortSignal.timeout(10000)
      }
    );

    if (!authResponse.ok) {
      return res.status(401).json({
        error: 'Your login session is invalid or expired. Please log in again.'
      });
    }

    const user = await authResponse.json();

    const email = String(user.email || '')
      .trim()
      .toLowerCase();

    // Check whether this email is an approved volunteer.
    if (!email || !volunteerEmails.has(email)) {
      return res.status(403).json({
        error: 'This account is not approved to access the volunteer dashboard.'
      });
    }

    req.volunteer = {
      id: user.id,
      email
    };

    return next();

  } catch (error) {
    console.error(
      'Volunteer authentication check failed:',
      error.message
    );

    return res.status(503).json({
      error: 'Could not verify your volunteer login. Please try again.'
    });
  }
}

// --------------------------------------------------
// Health check
// --------------------------------------------------

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'JeevSetu API'
  });
});

// --------------------------------------------------
// Protected report listing and filtering
// Only approved volunteers can view reports.
// --------------------------------------------------

app.get('/api/reports', requireVolunteer, async (req, res, next) => {
  try {
    const reports = await readReports();

    const q = clean(req.query.q, 100).toLowerCase();
    const status = clean(req.query.status, 30);

    if (status && status !== 'All' && !statuses.has(status)) {
      return res.status(400).json({
        error: 'Invalid status filter.'
      });
    }

    const filtered = reports.filter((report) => {
      const text = [
        report.id,
        report.animalType,
        report.location,
        report.description,
        report.language
      ]
        .join(' ')
        .toLowerCase();

      return (
        (!q || text.includes(q)) &&
        (!status || status === 'All' || report.status === status)
      );
    });

    return res.json({
      reports: filtered.sort(
        (a, b) =>
          String(b.createdAt).localeCompare(String(a.createdAt))
      )
    });

  } catch (err) {
    return next(err);
  }
});

// --------------------------------------------------
// Public animal report submission
// No volunteer login required.
// --------------------------------------------------

app.post('/api/reports', async (req, res, next) => {
  try {
    const animalType = clean(req.body.animalType, 20);
    const location = clean(req.body.location, 200);
    const description = clean(req.body.description, 1200);
    const language = clean(req.body.language || 'Not specified', 30);

    if (!animalTypes.has(animalType)) {
      return res.status(400).json({
        error: 'Choose a valid animal type.'
      });
    }

    if (location.length < 3) {
      return res.status(400).json({
        error: 'Please provide a more specific location.'
      });
    }

    if (description.length < 10) {
      return res.status(400).json({
        error: 'Please describe what you observed (at least 10 characters).'
      });
    }

    const reports = await readReports();

    const duplicate = reports.find((report) =>
      report.status !== 'Resolved' &&
      report.animalType === animalType &&
      String(report.location).toLowerCase() === location.toLowerCase()
    );

    const now = new Date().toISOString();

    const report = {
      id: `JS-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      animalType,
      location,
      description,
      language,
      status: 'New',
      createdAt: now,
      updatedAt: now,
      duplicateOf: duplicate?.id || null,
      verifiedByVolunteer: false,
      source: clean(req.body.source || 'typed', 20)
    };

    reports.push(report);

    await writeReports(reports);

    return res.status(201).json({
      report,
      duplicateWarning: duplicate
        ? `A similar open report exists (${duplicate.id}). A volunteer should check whether these are the same incident.`
        : null
    });

  } catch (err) {
    return next(err);
  }
});

// --------------------------------------------------
// Protected report status updates
// Only approved volunteers can update statuses.
// --------------------------------------------------

app.patch(
  '/api/reports/:id/status',
  requireVolunteer,
  async (req, res, next) => {
    try {
      const status = clean(req.body.status, 30);

      if (!statuses.has(status)) {
        return res.status(400).json({
          error: 'Invalid status.'
        });
      }

      const reports = await readReports();

      const report = reports.find(
        (item) => item.id === req.params.id
      );

      if (!report) {
        return res.status(404).json({
          error: 'Report not found.'
        });
      }

      report.status = status;
      report.updatedAt = new Date().toISOString();
      report.verifiedByVolunteer = true;

      await writeReports(reports);

      return res.json({ report });

    } catch (err) {
      return next(err);
    }
  }
);

// --------------------------------------------------
// Gnani AI speech-to-text
// Public route for animal report voice input.
// --------------------------------------------------

app.post('/api/transcribe', (req, res, next) => {
  upload.single('audio')(req, res, (err) => {
    if (err) {
      const status = err instanceof multer.MulterError ? 400 : 415;

      return res.status(status).json({
        error: err.message || 'Audio upload failed.'
      });
    }

    return next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'Please upload an audio recording.'
      });
    }

    const languageCode = clean(
      req.body.languageCode || 'hi-IN',
      10
    );

    const transcript = await transcribeWithGnani(
      req.file.buffer,
      req.file.mimetype,
      languageCode
    );

    return res.json({ transcript });

  } catch (err) {
    console.error('Gnani transcription failed:', err.message);

    return res.status(err.status || 502).json({
      error: err.message || 'Transcription failed.'
    });
  }
});

// --------------------------------------------------
// Central error handler
// --------------------------------------------------

app.use((err, _req, res, _next) => {
  console.error('API error:', err.message || err);

  const status = Number(err.status) || 500;

  return res.status(status).json({
    error: status >= 500
      ? 'Something went wrong on the server. Check the server terminal logs.'
      : (err.message || 'Request failed.')
  });
});

// --------------------------------------------------
// Start server
// --------------------------------------------------

app.listen(port, () => {
  console.log(`JeevSetu API running at http://localhost:${port}`);
});