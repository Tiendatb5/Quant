import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type {
  QuantJournalEntry,
  QuantJournalEntryInput,
  QuantJournalStatus,
} from '../../shared/types';

const MAX_ENTRIES = 500;
const STATUSES = new Set<QuantJournalStatus>(['planned', 'active', 'invalidated', 'closed']);

function storePath(): string {
  return path.join(app.getPath('userData'), 'quant-decision-journal.json');
}

function isEntry(value: unknown): value is QuantJournalEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<QuantJournalEntry>;
  return Boolean(
    typeof entry.id === 'string' &&
      typeof entry.symbol === 'string' &&
      typeof entry.thesis === 'string' &&
      typeof entry.invalidation === 'string' &&
      typeof entry.createdAt === 'string' &&
      typeof entry.updatedAt === 'string' &&
      entry.signalSnapshot,
  );
}

function readAll(): QuantJournalEntry[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath(), 'utf8')) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

function writeAll(entries: QuantJournalEntry[]): void {
  const file = storePath();
  const temp = `${file}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(temp, JSON.stringify(entries.slice(0, MAX_ENTRIES), null, 2));
  fs.renameSync(temp, file);
}

export function getQuantJournal(symbol: string): QuantJournalEntry[] {
  const normalized = symbol.trim().toUpperCase();
  return readAll().filter((entry) => entry.symbol === normalized).slice(0, 30);
}

export function saveQuantJournal(input: QuantJournalEntryInput): QuantJournalEntry {
  const now = new Date().toISOString();
  const symbol = input.symbol.trim().toUpperCase();
  const existing = readAll();
  const previous = input.id ? existing.find((entry) => entry.id === input.id) : undefined;
  const evaluation = input.evaluation;
  const entry: QuantJournalEntry = {
    id: previous?.id ?? `${symbol}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    symbol,
    range: input.range,
    status: STATUSES.has(input.status) ? input.status : 'planned',
    thesis: input.thesis.trim().slice(0, 4000),
    catalyst: input.catalyst.trim().slice(0, 2000),
    invalidation: input.invalidation.trim().slice(0, 2000),
    notes: input.notes?.trim().slice(0, 4000),
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    signalSnapshot: {
      decision: evaluation.decision,
      setupType: evaluation.setupType,
      confidence: evaluation.confidence,
      strategyVersion: evaluation.strategyVersion,
      evaluatedAt: evaluation.evaluatedAt,
      entry: evaluation.risk.entry,
      stop: evaluation.risk.stop,
      target1: evaluation.risk.target1,
      target2: evaluation.risk.target2,
      rewardRisk1: evaluation.risk.rewardRisk1,
      blockers: evaluation.noTradeReasons.slice(0, 8),
      historical: input.historicalValidation && input.historicalValidation.status === 'ready' ? {
        trades: input.historicalValidation.eligibleTrades,
        expectancyR: input.historicalValidation.expectancyR,
        profitFactor: input.historicalValidation.profitFactor,
        evidenceStrength: input.historicalValidation.evidenceStrength,
      } : undefined,
      forward: input.forwardRecord ? {
        resolvedSignals: input.forwardRecord.resolvedSignals,
        expectancyR: input.forwardRecord.expectancyR,
      } : undefined,
    },
  };
  const next = [entry, ...existing.filter((item) => item.id !== entry.id)];
  writeAll(next);
  return entry;
}
