'use strict';

const express = require('express');
const multer = require('multer');
const cors = require('cors');

const { getConfig } = require('../shared/config');
const { parseCsvText } = require('../shared/csv');
const { serializeJobItemsCsv } = require('../shared/output');
const {
  ensureSchema,
  createJob,
  listJobs,
  getJob,
  getJobItems,
} = require('../shared/store');
const {
  getSharedQueue,
} = require('../shared/queue');
const { fillQueueForJob } = require('../shared/jobQueue');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

function absoluteAssetUrl(req, url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `${req.protocol}://${req.get('host')}${url}`;
}

function materializeItem(item, req) {
  return {
    ...item,
    screenshot_url: absoluteAssetUrl(req, item.screenshot_url || ''),
  };
}

function createApp(config = getConfig()) {
  const app = express();
  app.set('trust proxy', true);
  app.use(cors({
    origin: config.frontendOrigin === '*' ? true : config.frontendOrigin,
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(config.artifactUrlBasePath, express.static(config.artifactRoot));

  app.get('/api/health', async (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/jobs', async (req, res, next) => {
    try {
      const limit = Number(req.query.limit) || 25;
      const jobs = await listJobs(limit, config.databaseUrl);
      res.json({ jobs });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/jobs', upload.single('file'), async (req, res, next) => {
    try {
      const uploadedText = req.file ? req.file.buffer.toString('utf8') : String(req.body.csvText || '');
      const sourceFilename = req.file ? req.file.originalname : (req.body.filename || 'upload.csv');
      const preferredColumn = req.body.urlColumn || '';

      if (!uploadedText.trim()) {
        res.status(400).json({ error: 'Upload a CSV file or provide csvText' });
        return;
      }

      const parsed = parseCsvText(uploadedText, preferredColumn);
      const records = parsed.records.filter((record) => record.__normalized_url);
      if (!records.length) {
        res.status(400).json({ error: 'No URLs found in the uploaded CSV' });
        return;
      }

      const job = await createJob({
        sourceFilename,
        sourceColumn: parsed.urlColumn,
        records,
        batchSize: config.ingestBatchSize,
      }, config.databaseUrl);

      const queue = getSharedQueue(config.redisUrl);
      await fillQueueForJob(
        job.id,
        Math.min(config.initialQueueFill, job.totalUrls),
        config.databaseUrl,
        queue,
      );

      res.status(202).json({
        jobId: job.id,
        totalUrls: job.totalUrls,
        sourceColumn: parsed.urlColumn,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/jobs/:jobId', async (req, res, next) => {
    try {
      const limit = Math.max(1, Number(req.query.limit) || config.apiResultsPageSize);
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const job = await getJob(req.params.jobId, config.databaseUrl);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const items = await getJobItems(req.params.jobId, { limit, offset }, config.databaseUrl);
      res.json({
        job,
        items: items.map((item) => materializeItem(item, req)),
        pagination: {
          limit,
          offset,
          total: job.total_urls,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/jobs/:jobId/results', async (req, res, next) => {
    try {
      const limit = Math.max(1, Number(req.query.limit) || config.apiResultsPageSize);
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const job = await getJob(req.params.jobId, config.databaseUrl);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const items = await getJobItems(req.params.jobId, { limit, offset }, config.databaseUrl);
      res.json({
        job,
        items: items.map((item) => materializeItem(item, req)),
        pagination: {
          limit,
          offset,
          total: job.total_urls,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/jobs/:jobId/download.csv', async (req, res, next) => {
    try {
      const job = await getJob(req.params.jobId, config.databaseUrl);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const items = await getJobItems(req.params.jobId, { limit: Math.max(1, job.total_urls), offset: 0 }, config.databaseUrl);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${job.id}.csv"`);
      res.send(`${serializeJobItemsCsv(items.map((item) => materializeItem(item, req)))}\n`);
    } catch (error) {
      next(error);
    }
  });

  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({
      error: error && error.message ? error.message : 'Internal server error',
    });
  });

  return app;
}

async function main() {
  const config = getConfig();
  await ensureSchema(config.databaseUrl);
  const app = createApp(config);
  app.listen(config.port, () => {
    console.log(`ugc-api listening on ${config.port}`);
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  createApp,
};
