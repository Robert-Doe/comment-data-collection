'use strict';

const nodemailer = require('nodemailer');

let transporterPromise = null;

function notificationConfigReady(config) {
  return !!(
    config
    && config.emailNotificationsEnabled
    && config.jobNotificationTo
    && config.smtpFrom
    && config.smtpHost
  );
}

async function getTransporter(config) {
  if (!notificationConfigReady(config)) {
    return null;
  }

  if (!transporterPromise) {
    transporterPromise = Promise.resolve(nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: !!config.smtpSecure,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      auth: config.smtpUser
        ? {
          user: config.smtpUser,
          pass: config.smtpPass,
        }
        : undefined,
    })).catch((error) => {
      transporterPromise = null;
      throw error;
    });
  }

  return transporterPromise;
}

function buildStartedMail(job, details = {}) {
  return {
    subject: `UGC scan started: ${job.id}`,
    text: [
      `Job ${job.id} has started.`,
      '',
      `Rows expected: ${job.total_urls}`,
      `Source file: ${details.sourceFilename || job.source_filename || ''}`,
      `URL column: ${details.sourceColumn || job.source_column || ''}`,
      `Scan delay: ${job.scan_delay_ms} ms`,
      `Screenshot delay: ${job.screenshot_delay_ms} ms`,
      '',
      'You will receive another email when the job reaches a terminal state.',
    ].join('\n'),
  };
}

function buildTerminalMail(job) {
  return {
    subject: `UGC scan ${job.status}: ${job.id}`,
    text: [
      `Job ${job.id} finished with status ${job.status}.`,
      '',
      `Total rows: ${job.total_urls}`,
      `Completed: ${job.completed_count}`,
      `Failed: ${job.failed_count}`,
      `Detected: ${job.detected_count}`,
      `Finished at: ${job.finished_at || ''}`,
      '',
      job.error_message ? `Job error: ${job.error_message}` : '',
    ].filter(Boolean).join('\n'),
  };
}

async function sendStartedNotification(config, job, details) {
  const transporter = await getTransporter(config);
  if (!transporter) {
    return false;
  }

  const mail = buildStartedMail(job, details);
  await transporter.sendMail({
    from: config.smtpFrom,
    to: config.jobNotificationTo,
    subject: mail.subject,
    text: mail.text,
  });
  return true;
}

async function sendTerminalNotification(config, job) {
  const transporter = await getTransporter(config);
  if (!transporter) {
    return false;
  }

  const mail = buildTerminalMail(job);
  await transporter.sendMail({
    from: config.smtpFrom,
    to: config.jobNotificationTo,
    subject: mail.subject,
    text: mail.text,
  });
  return true;
}

module.exports = {
  notificationConfigReady,
  sendStartedNotification,
  sendTerminalNotification,
};
