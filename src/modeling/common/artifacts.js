'use strict';

const fs = require('fs/promises');
const path = require('path');

function buildArtifactId(variantId) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${String(variantId || 'model').replace(/[^a-z0-9_-]+/gi, '-')}-${timestamp}`;
}

function summarizeArtifact(artifact) {
  if (!artifact) return null;
  return {
    id: artifact.id,
    variant_id: artifact.variant_id,
    variant_title: artifact.variant_title,
    algorithm: artifact.algorithm,
    created_at: artifact.created_at,
    feature_count: artifact.feature_count,
    imbalance_strategy: artifact.imbalance_strategy || null,
    training_counts: artifact.training_counts || null,
    evaluation: artifact.evaluation || null,
    dataset_summary: artifact.dataset_summary || null,
    file_path: artifact.file_path || '',
    // Persisted decision threshold — set via the Threshold Tuner "Save as Default" button.
    // When present, all scoring functions use this instead of the hardcoded 0.5 fallback.
    default_threshold: typeof artifact.default_threshold === 'number' ? artifact.default_threshold : null,
  };
}

async function ensureDirectory(directoryPath) {
  await fs.mkdir(directoryPath, { recursive: true });
}

async function saveModelArtifact(rootDirectory, artifact) {
  const variantDirectory = path.join(rootDirectory, artifact.variant_id);
  await ensureDirectory(variantDirectory);
  const artifactPath = path.join(variantDirectory, `${artifact.id}.json`);
  await fs.writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return artifactPath;
}

async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function collectArtifactPaths(rootDirectory) {
  try {
    const variants = await fs.readdir(rootDirectory, { withFileTypes: true });
    const files = [];

    for (const entry of variants) {
      const candidatePath = path.join(rootDirectory, entry.name);
      if (entry.isDirectory()) {
        const nestedEntries = await fs.readdir(candidatePath, { withFileTypes: true });
        nestedEntries.forEach((nestedEntry) => {
          if (nestedEntry.isFile() && /\.json$/i.test(nestedEntry.name)) {
            files.push(path.join(candidatePath, nestedEntry.name));
          }
        });
        continue;
      }

      if (entry.isFile() && /\.json$/i.test(entry.name)) {
        files.push(candidatePath);
      }
    }

    return files;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function listModelArtifacts(rootDirectory) {
  const filePaths = await collectArtifactPaths(rootDirectory);
  const artifacts = [];

  for (const filePath of filePaths) {
    try {
      const artifact = await readJsonFile(filePath);
      artifact.file_path = filePath;
      artifacts.push(summarizeArtifact(artifact));
    } catch (_) {
      continue;
    }
  }

  artifacts.sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')));
  return artifacts;
}

async function loadModelArtifact(rootDirectory, artifactId) {
  const summaries = await listModelArtifacts(rootDirectory);
  const match = summaries.find((entry) => entry.id === String(artifactId || '').trim());
  if (!match) return null;
  const artifact = await readJsonFile(match.file_path);
  artifact.file_path = match.file_path;
  return artifact;
}

async function deleteModelArtifact(rootDirectory, artifactId) {
  const summaries = await listModelArtifacts(rootDirectory);
  const match = summaries.find((entry) => entry.id === String(artifactId || '').trim());
  if (!match || !match.file_path) return false;
  await fs.unlink(match.file_path);
  return true;
}

/**
 * Apply a shallow patch to a persisted artifact JSON file.
 * Returns the updated artifact (with file_path set).
 * Only whitelisted keys are accepted to prevent accidental corruption.
 */
const PATCHABLE_KEYS = new Set(['default_threshold', 'notes', 'evaluation']);

async function patchModelArtifact(rootDirectory, artifactId, patch) {
  const summaries = await listModelArtifacts(rootDirectory);
  const match = summaries.find((entry) => entry.id === String(artifactId || '').trim());
  if (!match || !match.file_path) return null;

  const artifact = await readJsonFile(match.file_path);
  artifact.file_path = match.file_path;

  const safeKeys = Object.keys(patch).filter((k) => PATCHABLE_KEYS.has(k));
  if (!safeKeys.length) return artifact;

  safeKeys.forEach((k) => { artifact[k] = patch[k]; });
  await fs.writeFile(match.file_path, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return artifact;
}

module.exports = {
  buildArtifactId,
  summarizeArtifact,
  saveModelArtifact,
  listModelArtifacts,
  loadModelArtifact,
  deleteModelArtifact,
  patchModelArtifact,
};
