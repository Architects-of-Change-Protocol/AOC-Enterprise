import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import type { ControlPlaneState } from './types';

const EMPTY_STATE: ControlPlaneState = {
  requests: [],
  decisions: [],
  grants: [],
  auditEvents: [],
};

export class FileControlPlaneStore {
  private readonly filePath: string;

  constructor(filePath: string = resolve(process.cwd(), '.aoc-control-plane.json')) {
    this.filePath = filePath;
  }

  read(): ControlPlaneState {
    this.ensureFile();
    try {
      const raw = readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<ControlPlaneState>;
      return {
        requests: Array.isArray(parsed.requests) ? parsed.requests : [],
        decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
        grants: Array.isArray(parsed.grants) ? parsed.grants : [],
        auditEvents: Array.isArray(parsed.auditEvents) ? parsed.auditEvents : [],
      };
    } catch {
      return { ...EMPTY_STATE };
    }
  }

  write(state: ControlPlaneState): void {
    this.ensureFile();
    writeFileSync(this.filePath, JSON.stringify(state, null, 2), 'utf8');
  }

  private ensureFile(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    if (!existsSync(this.filePath)) {
      writeFileSync(this.filePath, JSON.stringify(EMPTY_STATE, null, 2), 'utf8');
    }
  }
}
