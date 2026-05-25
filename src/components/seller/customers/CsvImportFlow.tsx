'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, FileCheck, AlertCircle, CheckCircle } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { BuyerCsvRowSchema } from '@/lib/zod';
import { Button } from '@/components/ui/button';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedRow {
  rowIndex: number;
  raw: Record<string, string>;
  valid: boolean;
  error?: string;
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  return lines
    .slice(1)
    .filter((l) => l.trim())
    .map((line) => {
      const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
      return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
    });
}

// ─── Validate rows client-side ────────────────────────────────────────────────

function validateRows(rawRows: Array<Record<string, string>>): ParsedRow[] {
  const results: ParsedRow[] = rawRows.map((row, idx) => {
    const parsed = BuyerCsvRowSchema.safeParse(row);
    if (!parsed.success) {
      return {
        rowIndex: idx + 1,
        raw: row,
        valid: false,
        error: parsed.error.errors[0]?.message ?? 'Invalid row',
      };
    }
    return { rowIndex: idx + 1, raw: row, valid: true };
  });

  // Intra-batch phone dedup
  const phonesSeen = new Map<string, number>();
  for (const result of results) {
    if (!result.valid) continue;
    const phone = (result.raw.phone ?? '').trim();
    if (phonesSeen.has(phone)) {
      result.valid = false;
      result.error = `Duplicate phone in this file (first seen at row ${phonesSeen.get(phone)})`;
    } else {
      phonesSeen.set(phone, result.rowIndex);
    }
  }

  return results;
}

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS = ['Upload', 'Preview', 'Confirm'] as const;
type Step = 0 | 1 | 2;

function StepIndicator({ current }: { current: Step }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {STEPS.map((label, idx) => {
        const isActive = idx === current;
        const isDone = idx < current;
        return (
          <div key={label} className="flex items-center gap-2">
            <span
              className={[
                'text-body-sm font-semibold',
                isActive ? 'text-teal-500' : isDone ? 'text-teal-400' : 'text-cream-400',
              ].join(' ')}
            >
              {idx + 1}. {label}
            </span>
            {idx < STEPS.length - 1 && (
              <span className="text-cream-300 select-none">›</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CsvImportFlow() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>(0);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ inserted: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const validRows = rows.filter((r) => r.valid);
  const invalidRows = rows.filter((r) => !r.valid);

  // ── Step 1: file upload ─────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      setFileError('Please select a .csv file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rawRows = parseCsv(text);
      if (rawRows.length === 0) {
        setFileError('File is empty or has no data rows');
        return;
      }
      const validated = validateRows(rawRows);
      setRows(validated);
      setFileError(null);
      setStep(1);
    };
    reader.readAsText(file);
  }

  function handleUploadZoneClick() {
    fileInputRef.current?.click();
  }

  // ── Step 3: confirm import ──────────────────────────────────────────────────

  async function handleImport() {
    setIsImporting(true);
    setImportError(null);

    try {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

      const res = await fetch('/api/customers/import', {
        method: 'POST',
        headers,
        body: JSON.stringify({ rows: validRows.map((r) => r.raw) }),
      });

      const body = (await res.json()) as { inserted?: number; error?: string };

      if (!res.ok) {
        setImportError(body.error ?? 'Import failed. Please try again.');
        return;
      }

      setImportResult({ inserted: body.inserted ?? 0 });
    } catch {
      setImportError('Network error. Please check your connection and try again.');
    } finally {
      setIsImporting(false);
    }
  }

  // ── Renders ─────────────────────────────────────────────────────────────────

  // Success screen
  if (importResult) {
    return (
      <div className="max-w-xl mx-auto text-center py-16">
        <CheckCircle className="w-16 h-16 text-teal-500 mx-auto mb-4" />
        <h2 className="text-h3 font-display font-medium text-cream-900 mb-2">
          {importResult.inserted} customer{importResult.inserted !== 1 ? 's' : ''} imported
          successfully!
        </h2>
        <p className="text-body-sm text-cream-600 mb-8">
          They are now available in your customer list.
        </p>
        <Button
          className="bg-teal-500 hover:bg-teal-600 text-cream-50"
          onClick={() => router.push('/customers')}
        >
          View Customers
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <StepIndicator current={step} />

      {/* ── Step 1: Upload ─────────────────────────────────────────────────── */}
      {step === 0 && (
        <div className="space-y-6">
          <div
            className="border-2 border-dashed border-cream-300 rounded-lg bg-cream-50 hover:bg-cream-100 p-12 text-center cursor-pointer transition-colors"
            onClick={handleUploadZoneClick}
            onKeyDown={(e) => e.key === 'Enter' && handleUploadZoneClick()}
            role="button"
            tabIndex={0}
            aria-label="Upload CSV file"
          >
            <Upload className="w-10 h-10 text-cream-400 mx-auto mb-3" />
            <p className="text-body font-medium text-cream-700 mb-1">Choose a CSV file</p>
            <p className="text-body-sm text-cream-500">Click to browse or drag and drop</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="sr-only"
              onChange={handleFileChange}
            />
          </div>

          {fileError && (
            <div className="flex items-center gap-2 text-danger-500 text-body-sm">
              <AlertCircle size={16} />
              {fileError}
            </div>
          )}

          <p className="text-body-sm text-cream-500">
            Need a template?{' '}
            <a
              href="/api/customers/import/template"
              download="buyers_template.csv"
              className="text-teal-600 hover:text-teal-700 underline underline-offset-2"
            >
              Download CSV template
            </a>
          </p>
        </div>
      )}

      {/* ── Step 2: Preview ────────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="flex items-center gap-4 text-body-sm">
            <span className="text-teal-700 font-medium bg-teal-50 px-3 py-1 rounded-full">
              {validRows.length} valid
            </span>
            {invalidRows.length > 0 && (
              <span className="text-danger-700 font-medium bg-danger-50 px-3 py-1 rounded-full">
                {invalidRows.length} invalid
              </span>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border border-cream-200">
            <table className="w-full border-collapse text-body-sm">
              <thead>
                <tr className="bg-cream-200 text-cream-700 font-semibold text-caption">
                  <th className="text-left px-3 py-2">#</th>
                  <th className="text-left px-3 py-2">Business Name</th>
                  <th className="text-left px-3 py-2">Phone</th>
                  <th className="text-left px-3 py-2">Tier</th>
                  <th className="text-left px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.rowIndex}
                    className={
                      row.valid
                        ? 'bg-cream-50'
                        : 'bg-danger-50 border-l-2 border-danger-500'
                    }
                  >
                    <td className="px-3 py-2 text-cream-500">{row.rowIndex}</td>
                    <td className="px-3 py-2 text-cream-900 font-medium">
                      {row.raw.business_name || '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-cream-700">
                      {row.raw.phone || '—'}
                    </td>
                    <td className="px-3 py-2 text-cream-700">
                      {row.raw.tier || '—'}
                    </td>
                    <td className="px-3 py-2">
                      {row.valid ? (
                        <span className="text-teal-600 font-medium">Valid</span>
                      ) : (
                        <span className="text-danger-600 text-caption">{row.error}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button
              disabled={validRows.length === 0}
              className="bg-teal-500 hover:bg-teal-600 text-cream-50 flex items-center gap-2 disabled:opacity-50"
              onClick={() => setStep(2)}
            >
              <FileCheck size={16} />
              Continue with {validRows.length} valid row{validRows.length !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Confirm ────────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="bg-cream-100 rounded-lg p-5">
            <h3 className="text-body font-semibold text-cream-900 mb-1">
              Ready to import {validRows.length} customer{validRows.length !== 1 ? 's' : ''}
            </h3>
            <p className="text-body-sm text-cream-600">
              {invalidRows.length > 0 &&
                `${invalidRows.length} invalid row${invalidRows.length !== 1 ? 's' : ''} will be skipped. `}
              Review the valid rows below before confirming.
            </p>
          </div>

          <div className="overflow-x-auto rounded-lg border border-cream-200">
            <table className="w-full border-collapse text-body-sm">
              <thead>
                <tr className="bg-cream-200 text-cream-700 font-semibold text-caption">
                  <th className="text-left px-3 py-2">#</th>
                  <th className="text-left px-3 py-2">Business Name</th>
                  <th className="text-left px-3 py-2">Phone</th>
                  <th className="text-left px-3 py-2">Tier</th>
                  <th className="text-left px-3 py-2">Credit Limit</th>
                </tr>
              </thead>
              <tbody>
                {validRows.map((row) => (
                  <tr key={row.rowIndex} className="bg-cream-50 border-b border-cream-100 last:border-0">
                    <td className="px-3 py-2 text-cream-500">{row.rowIndex}</td>
                    <td className="px-3 py-2 text-cream-900 font-medium">
                      {row.raw.business_name}
                    </td>
                    <td className="px-3 py-2 font-mono text-cream-700">{row.raw.phone}</td>
                    <td className="px-3 py-2 text-cream-700">{row.raw.tier || '—'}</td>
                    <td className="px-3 py-2 font-mono text-cream-700">
                      {row.raw.credit_limit ? `₹${row.raw.credit_limit}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {importError && (
            <div className="flex items-center gap-2 text-danger-500 text-body-sm bg-danger-50 rounded-md px-3 py-2">
              <AlertCircle size={16} />
              {importError}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" onClick={() => setStep(1)} disabled={isImporting}>
              Back
            </Button>
            <Button
              className="bg-teal-500 hover:bg-teal-600 text-cream-50 flex items-center gap-2"
              onClick={handleImport}
              disabled={isImporting}
            >
              <FileCheck size={16} />
              {isImporting
                ? 'Importing…'
                : `Import ${validRows.length} customer${validRows.length !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
