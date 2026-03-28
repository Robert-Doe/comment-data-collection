'use strict';

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

function resolveProjectPath(...segments) {
  return path.resolve(process.cwd(), ...segments);
}

function ensureFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    const error = new Error(`File not found: ${filePath}`);
    error.statusCode = 404;
    throw error;
  }
}

function sendFileDownload(res, filePath, downloadName, contentType) {
  ensureFileExists(filePath);
  if (contentType) {
    res.setHeader('Content-Type', contentType);
  }
  res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
  fs.createReadStream(filePath).pipe(res);
}

function streamDirectoryZip(res, directoryPath, downloadName, rootName) {
  ensureFileExists(directoryPath);
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', {
      zlib: { level: 9 },
    });

    archive.on('error', reject);
    res.on('close', resolve);
    res.on('error', reject);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    archive.pipe(res);
    archive.directory(directoryPath, rootName || path.basename(directoryPath));
    Promise.resolve(archive.finalize()).catch(reject);
  });
}

module.exports = {
  resolveProjectPath,
  sendFileDownload,
  streamDirectoryZip,
};
