import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SECRET_KEY in server/.env.'
  );
}

const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false
  }
});

const here = path.dirname(fileURLToPath(import.meta.url));
const legacyFile = path.resolve(here, '../data/reports.json');

function toDatabaseRow(report) {
  const now = new Date().toISOString();

  return {
    id: report.id,
    animal_type: report.animalType,
    location: report.location,
    description: report.description,
    language: report.language || 'Not specified',
    status: report.status || 'New',
    created_at: report.createdAt || now,
    updated_at: report.updatedAt || report.createdAt || now,
    duplicate_of: report.duplicateOf || null,
    verified_by_volunteer: Boolean(report.verifiedByVolunteer),
    source: report.source || 'typed'
  };
}

function fromDatabaseRow(row) {
  return {
    id: row.id,
    animalType: row.animal_type,
    location: row.location,
    description: row.description,
    language: row.language,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    duplicateOf: row.duplicate_of,
    verifiedByVolunteer: row.verified_by_volunteer,
    source: row.source
  };
}

// Preserve existing reports.json data during the initial migration.
// Import the old file only if the Supabase table is empty.
async function migrateLegacyReportsIfNeeded() {
  const { data: existing, error: lookupError } = await supabase
    .from('jeevsetu_reports')
    .select('id')
    .limit(1);

  if (lookupError) {
    console.error('Supabase migration check failed:', lookupError.message);
    throw new Error('Could not check the Supabase reports table.');
  }

  if (existing && existing.length > 0) {
    return;
  }

  let contents;

  try {
    contents = await fs.readFile(legacyFile, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return;
    }

    throw error;
  }

  let legacyReports;

  try {
    legacyReports = JSON.parse(contents);
  } catch {
    throw new Error('The existing reports.json file is not valid JSON.');
  }

  if (!Array.isArray(legacyReports)) {
    throw new Error('The existing reports.json file must contain an array.');
  }

  if (legacyReports.length === 0) {
    return;
  }

  const rows = legacyReports.map(toDatabaseRow);

  const { error: migrationError } = await supabase
    .from('jeevsetu_reports')
    .upsert(rows, { onConflict: 'id' });

  if (migrationError) {
    console.error('Supabase report migration failed:', migrationError.message);
    throw new Error('Could not migrate existing reports to Supabase.');
  }

  console.log(`Migrated ${rows.length} existing reports to Supabase.`);
}

let migrationPromise;

async function ensureLegacyMigration() {
  if (!migrationPromise) {
    migrationPromise = migrateLegacyReportsIfNeeded().catch((error) => {
      migrationPromise = null;
      throw error;
    });
  }

  return migrationPromise;
}

export async function readReports() {
  await ensureLegacyMigration();

  const { data, error } = await supabase
    .from('jeevsetu_reports')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Supabase read reports failed:', error.message);
    throw new Error('Could not load reports from the database.');
  }

  return (data || []).map(fromDatabaseRow);
}

export async function writeReports(reports) {
  if (!Array.isArray(reports)) {
    throw new Error('Reports must be provided as an array.');
  }

  await ensureLegacyMigration();

  if (reports.length === 0) {
    return;
  }

  const rows = reports.map(toDatabaseRow);

  const { error } = await supabase
    .from('jeevsetu_reports')
    .upsert(rows, { onConflict: 'id' });

  if (error) {
    console.error('Supabase write reports failed:', error.message);
    throw new Error('Could not save reports to the database.');
  }
}