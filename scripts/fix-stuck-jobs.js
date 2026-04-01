'use strict';

// Fixes jobs stuck in 'running'/'queued' status by force-failing them.
//
// Usage (any OS):
//   node scripts/fix-stuck-jobs.js --url postgresql://postgres:PASSWORD@localhost:5432/comment_data_collection
//
// Or via env var (Linux/Mac):
//   DATABASE_URL=postgresql://... node scripts/fix-stuck-jobs.js
//
// Or via env var (Windows PowerShell):
//   $env:DATABASE_URL="postgresql://..."; node scripts/fix-stuck-jobs.js

const { Pool } = require('pg');

function getDbUrl() {
  const flagIndex = process.argv.indexOf('--url');
  if (flagIndex !== -1 && process.argv[flagIndex + 1]) {
    return process.argv[flagIndex + 1];
  }
  return process.env.DATABASE_URL;
}

async function main() {
  const databaseUrl = getDbUrl();
  if (!databaseUrl) {
    console.error('No database URL found.');
    console.error('Pass it as:  node scripts/fix-stuck-jobs.js --url postgresql://postgres:PASSWORD@localhost:5432/comment_data_collection');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  // Find all items stuck in running/queued for more than 30 minutes
  const staleItems = await pool.query(`
    SELECT ji.id, ji.job_id, ji.row_number, ji.input_url, ji.status, ji.attempts, ji.updated_at
    FROM job_items ji
    WHERE ji.status IN ('running', 'queued')
      AND ji.updated_at < now() - interval '30 minutes'
    ORDER BY ji.updated_at ASC
  `);

  if (staleItems.rows.length === 0) {
    console.log('No stuck items found.');
    await pool.end();
    return;
  }

  console.log(`Found ${staleItems.rows.length} stuck item(s):`);
  for (const row of staleItems.rows) {
    console.log(`  [${row.status}] row ${row.row_number} | job ${row.job_id} | ${row.input_url}`);
  }

  // Force-fail them
  const ids = staleItems.rows.map(r => r.id);
  await pool.query(`
    UPDATE job_items
    SET status = 'failed',
        error_message = 'Force-failed: stuck in running/queued for over 30 minutes',
        completed_at = now(),
        updated_at = now()
    WHERE id = ANY($1)
  `, [ids]);

  console.log(`Marked ${ids.length} item(s) as failed.`);

  // Update each affected job's counters and status
  const jobIds = [...new Set(staleItems.rows.map(r => r.job_id))];
  for (const jobId of jobIds) {
    await pool.query(`
      UPDATE jobs
      SET
        running_count   = (SELECT COUNT(*) FROM job_items WHERE job_id = $1 AND status = 'running'),
        queued_count    = (SELECT COUNT(*) FROM job_items WHERE job_id = $1 AND status = 'queued'),
        pending_count   = (SELECT COUNT(*) FROM job_items WHERE job_id = $1 AND status = 'pending'),
        failed_count    = (SELECT COUNT(*) FROM job_items WHERE job_id = $1 AND status = 'failed'),
        completed_count = (SELECT COUNT(*) FROM job_items WHERE job_id = $1 AND status = 'completed'),
        status = CASE
          WHEN (SELECT COUNT(*) FROM job_items WHERE job_id = $1 AND status IN ('running','queued','pending')) = 0
          THEN CASE
            WHEN (SELECT COUNT(*) FROM job_items WHERE job_id = $1 AND status = 'failed') > 0
            THEN 'completed_with_errors'
            ELSE 'completed'
          END
          ELSE status
        END,
        finished_at = CASE
          WHEN (SELECT COUNT(*) FROM job_items WHERE job_id = $1 AND status IN ('running','queued','pending')) = 0
            AND finished_at IS NULL
          THEN now()
          ELSE finished_at
        END,
        updated_at = now()
      WHERE id = $1
    `, [jobId]);

    const job = await pool.query('SELECT id, status, completed_count, failed_count, total_urls FROM jobs WHERE id = $1', [jobId]);
    const j = job.rows[0];
    console.log(`  Job ${j.id}: ${j.status} (${j.completed_count} completed, ${j.failed_count} failed / ${j.total_urls} total)`);
  }

  await pool.end();
  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
