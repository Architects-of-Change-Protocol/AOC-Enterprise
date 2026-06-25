import { createHash } from 'crypto';
import type Database from 'better-sqlite3';
import { getDb } from './db.js';
import type {
  RegistryExportArtifactRecord,
  RegistryExportArtifactMeta,
  RegistryExportType,
  RegistryExportFormat,
} from './registry-export-types.js';

// ---------------------------------------------------------------------------
// Row type (SQLite raw)
// ---------------------------------------------------------------------------

interface ExportArtifactRow {
  id: string;
  export_id: string;
  registry_id: string;
  export_type: string;
  format: string;
  filename: string;
  content_type: string;
  content_text: string;
  checksum_sha256: string;
  generated_by: string;
  generated_at: string;
  created_at: string;
}

function rowToArtifact(row: ExportArtifactRow): RegistryExportArtifactRecord {
  return {
    id: row.id,
    exportId: row.export_id,
    registryId: row.registry_id,
    exportType: row.export_type as RegistryExportType,
    format: row.format as RegistryExportFormat,
    filename: row.filename,
    contentType: row.content_type,
    contentText: row.content_text,
    checksumSha256: row.checksum_sha256,
    generatedBy: 'aoc_agent_passport',
    generatedAt: row.generated_at,
    createdAt: row.created_at,
  };
}

function rowToMeta(row: ExportArtifactRow): RegistryExportArtifactMeta {
  return {
    exportId: row.export_id,
    exportType: row.export_type as RegistryExportType,
    filename: row.filename,
    contentType: row.content_type,
    checksumSha256: row.checksum_sha256,
    generatedAt: row.generated_at,
  };
}

function nanoid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function computeChecksum(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export interface CreateExportArtifactInput {
  registryId: string;
  exportType: RegistryExportType;
  format: RegistryExportFormat;
  filename: string;
  contentType: string;
  contentText: string;
  generatedAt?: string;
}

export function createRegistryExportArtifact(
  input: CreateExportArtifactInput,
  db?: Database.Database,
): RegistryExportArtifactRecord {
  const database = db ?? getDb();
  const now = new Date().toISOString();
  const id = nanoid('exprow');
  const exportId = nanoid('exp');
  const checksum = computeChecksum(input.contentText);
  const generatedAt = input.generatedAt ?? now;

  database
    .prepare(
      `INSERT INTO registry_export_artifacts
        (id, export_id, registry_id, export_type, format, filename,
         content_type, content_text, checksum_sha256,
         generated_by, generated_at, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      exportId,
      input.registryId,
      input.exportType,
      input.format,
      input.filename,
      input.contentType,
      input.contentText,
      checksum,
      'aoc_agent_passport',
      generatedAt,
      now,
    );

  return getRegistryExportArtifactByExportId(exportId, database)!;
}

export function getRegistryExportArtifactByExportId(
  exportId: string,
  db?: Database.Database,
): RegistryExportArtifactRecord | null {
  const database = db ?? getDb();
  const row = database
    .prepare(`SELECT * FROM registry_export_artifacts WHERE export_id = ?`)
    .get(exportId) as ExportArtifactRow | undefined;
  return row ? rowToArtifact(row) : null;
}

export function listRegistryExportArtifactsByRegistryId(
  registryId: string,
  limit = 50,
  db?: Database.Database,
): RegistryExportArtifactMeta[] {
  const database = db ?? getDb();
  const rows = database
    .prepare(
      `SELECT * FROM registry_export_artifacts
       WHERE registry_id = ?
       ORDER BY generated_at DESC
       LIMIT ?`,
    )
    .all(registryId, limit) as ExportArtifactRow[];
  return rows.map(rowToMeta);
}

export function deleteRegistryExportArtifact(
  exportId: string,
  db?: Database.Database,
): boolean {
  const database = db ?? getDb();
  const result = database
    .prepare(`DELETE FROM registry_export_artifacts WHERE export_id = ?`)
    .run(exportId);
  return result.changes > 0;
}
