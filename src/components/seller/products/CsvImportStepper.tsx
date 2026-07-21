'use client';

import { useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { FileCheck, Upload, AlertCircle, CheckCircle2, ChevronLeft, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatNumberValue } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { parseCsv, validateCsvRows, type ParsedRow, type ProductCsvRow } from '@/lib/csv';
import { useTenantBrands } from '@/hooks/useBrands';

// ── Step Indicator ────────────────────────────────────────────────────────────

function StepIndicator({ currentStep }: { currentStep: 1 | 2 | 3 }) {
  const steps = ['Upload', 'Preview', 'Import'];
  return (
    <div className="flex items-center gap-4 mb-8">
      {steps.map((label, i) => {
        const stepNum = (i + 1) as 1 | 2 | 3;
        const active = stepNum === currentStep;
        const done = stepNum < currentStep;
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium',
                done || active ? 'bg-teal-500 text-cream-50' : 'bg-cream-200 text-cream-500'
              )}
            >
              {done ? '✓' : stepNum}
            </div>
            <span
              className={cn(
                'text-sm font-medium',
                active ? 'text-teal-500' : 'text-cream-400'
              )}
            >
              {label}
            </span>
            {i < 2 && <div className="w-8 h-px bg-cream-300" />}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 1: Upload ────────────────────────────────────────────────────────────

interface Step1Props {
  onFileSelected: (file: File, rows: ParsedRow[]) => void;
  brandSlugToId: Map<string, string>;
  brandsLoaded: boolean;
}

function Step1Upload({ onFileSelected, brandSlugToId, brandsLoaded }: Step1Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const processFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith('.csv')) {
        setParseError('Only .csv files are accepted.');
        setSelectedFile(null);
        return;
      }
      setSelectedFile(file);
      setParseError(null);
    },
    []
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleDownloadTemplate = async () => {
    try {
      const res = await fetch('/api/products/template');
      if (!res.ok) throw new Error('Failed to download template');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'product-import-template.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download template');
    }
  };

  const handleNext = () => {
    if (!selectedFile) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const rawRows = parseCsv(text);
        if (rawRows.length === 0) {
          setParseError('No data rows found in the CSV file.');
          return;
        }

        // Validate rows + resolve brand slugs
        let parsed = validateCsvRows(rawRows);

        // Add brand-slug-not-found errors for rows that pass other validation
        parsed = parsed.map((row) => {
          const slug = row.raw.brand_slug?.trim();
          if (!slug) return row; // already invalid for missing brand_slug

          if (!brandSlugToId.has(slug)) {
            const brandError = `Brand '${slug}' not in your catalog`;
            return {
              ...row,
              errors: [...(row.errors ?? []), brandError],
              isValid: false,
              data: undefined,
            };
          }
          return row;
        });

        onFileSelected(selectedFile, parsed);
      } catch {
        setParseError('Failed to parse CSV file. Please check the format.');
      }
    };
    reader.readAsText(selectedFile);
  };

  return (
    <div className="space-y-6">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) =>
          (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()
        }
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          'border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors select-none',
          isDragOver
            ? 'border-teal-400 bg-teal-50'
            : 'border-cream-300 bg-cream-50 hover:bg-cream-100'
        )}
      >
        <FileText size={32} className="mx-auto text-cream-400 mb-3" />
        {selectedFile ? (
          <>
            <p className="text-sm font-medium text-cream-900">{selectedFile.name}</p>
            <p className="text-xs text-cream-500 mt-1">
              {(selectedFile.size / 1024).toFixed(1)} KB — click to change
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-cream-700">Drop your CSV here or click to browse</p>
            <p className="text-xs text-cream-400 mt-1">Only .csv files accepted</p>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) processFile(file);
          // Reset so same file can be re-selected
          e.target.value = '';
        }}
      />

      {parseError && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertCircle size={16} className="shrink-0" />
          {parseError}
        </div>
      )}

      {/* Template download */}
      <div className="flex items-center justify-between border border-cream-200 rounded-lg px-4 py-3 bg-cream-50">
        <div>
          <p className="text-sm font-medium text-cream-900">Need a template?</p>
          <p className="text-xs text-cream-500">Download the CSV template with all required columns</p>
        </div>
        <button
          type="button"
          onClick={handleDownloadTemplate}
          className="text-sm text-teal-600 hover:text-teal-700 font-medium underline underline-offset-2"
        >
          Download template
        </button>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={handleNext}
          disabled={!selectedFile || !brandsLoaded}
          className="bg-teal-500 hover:bg-teal-600 text-cream-50 gap-1.5"
        >
          <Upload size={16} />
          Next: Preview
        </Button>
      </div>
    </div>
  );
}

// ── Step 2: Preview ───────────────────────────────────────────────────────────

interface Step2Props {
  parsedRows: ParsedRow[];
  onBack: () => void;
  onConfirm: (validRows: Array<ProductCsvRow & { tenant_brand_id: string }>) => void;
  brandSlugToId: Map<string, string>;
  isImporting: boolean;
}

function Step2Preview({ parsedRows, onBack, onConfirm, brandSlugToId, isImporting }: Step2Props) {
  const validCount = parsedRows.filter((r) => r.isValid).length;
  const invalidCount = parsedRows.length - validCount;

  const handleConfirm = () => {
    const validRows = parsedRows
      .filter((r) => r.isValid && r.data)
      .map((r) => {
        const data = r.data!;
        return {
          ...data,
          tenant_brand_id: brandSlugToId.get(data.brand_slug) ?? '',
        };
      });
    onConfirm(validRows);
  };

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-cream-700 font-medium">{parsedRows.length} rows found</span>
        <span className="text-teal-600 font-medium">{validCount} valid</span>
        {invalidCount > 0 && (
          <span className="text-red-600 font-medium">{invalidCount} with errors</span>
        )}
      </div>

      {/* Preview table */}
      <div className="border border-cream-200 rounded-lg overflow-hidden max-h-[60vh] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="table-label w-12">#</TableHead>
              <TableHead className="table-label">SKU</TableHead>
              <TableHead className="table-label">Name</TableHead>
              <TableHead className="table-label">Brand</TableHead>
              <TableHead className="table-label text-right">MRP</TableHead>
              <TableHead className="table-label text-right">Price</TableHead>
              <TableHead className="table-label text-right">GST</TableHead>
              <TableHead className="table-label">HSN</TableHead>
              <TableHead className="table-label">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {parsedRows.map((row) => (
              <TableRow
                key={row.rowIndex}
                className={cn(
                  row.isValid ? 'bg-cream-50' : 'bg-red-50 border-l-2 border-red-500'
                )}
              >
                <TableCell className="text-base text-cream-500">{row.rowIndex}</TableCell>
                <TableCell className="text-base">{row.raw.internal_sku || '—'}</TableCell>
                <TableCell className="max-w-[180px] truncate text-base">{row.raw.name || '—'}</TableCell>
                <TableCell className="text-base text-cream-700">{row.raw.brand_slug || '—'}</TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">
                  {row.raw.mrp ? formatNumberValue(Number(row.raw.mrp), 'CURRENCY_EXACT') : '—'}
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">
                  {row.raw.base_selling_price ? formatNumberValue(Number(row.raw.base_selling_price), 'CURRENCY_EXACT') : '—'}
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">
                  {row.raw.gst_rate ? `${row.raw.gst_rate}%` : '—'}
                </TableCell>
                <TableCell className="text-base">{row.raw.hsn_code || '—'}</TableCell>
                <TableCell className="text-base">
                  {row.isValid ? (
                    <span className="inline-flex items-center gap-1 text-sm text-teal-700 font-medium">
                      <CheckCircle2 size={12} /> Valid
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 text-sm text-red-600 font-medium cursor-help"
                      title={(row.errors ?? []).join('\n')}
                    >
                      <AlertCircle size={12} />
                      Error
                      <span className="sr-only">{(row.errors ?? []).join(', ')}</span>
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Error detail for invalid rows */}
      {invalidCount > 0 && (
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {parsedRows
            .filter((r) => !r.isValid)
            .map((row) => (
              <div key={row.rowIndex} className="flex gap-2 text-xs text-red-600">
                <span className="font-mono shrink-0">Row {row.rowIndex}:</span>
                <span>{(row.errors ?? []).join('; ')}</span>
              </div>
            ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" size="sm" onClick={onBack} disabled={isImporting} className="gap-1.5">
          <ChevronLeft size={14} />
          Back
        </Button>

        <Button
          onClick={handleConfirm}
          disabled={validCount === 0 || isImporting}
          className="bg-teal-500 hover:bg-teal-600 text-cream-50 gap-1.5"
        >
          {isImporting ? (
            <>Importing...</>
          ) : (
            <>
              <FileCheck size={16} />
              Import {validCount} product{validCount !== 1 ? 's' : ''}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ── Step 3: Result ────────────────────────────────────────────────────────────

interface ImportResult {
  imported: number;
  skipped: number;
  results?: Array<{ sku: string; status: 'imported' | 'skipped'; error?: string }>;
}

interface Step3Props {
  result: ImportResult;
  onReset: () => void;
}

function Step3Result({ result, onReset }: Step3Props) {
  const router = useRouter();
  const skippedWithErrors = (result.results ?? []).filter((r) => r.status === 'skipped');

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center text-center py-6">
        <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center mb-4">
          <CheckCircle2 size={32} className="text-teal-600" />
        </div>
        <p className="text-xl font-display font-medium text-cream-900 mb-1">
          {result.imported} product{result.imported !== 1 ? 's' : ''} imported successfully
        </p>
        {result.skipped > 0 && (
          <p className="text-sm text-cream-600">
            {result.skipped} row{result.skipped !== 1 ? 's' : ''} skipped
          </p>
        )}
      </div>

      {skippedWithErrors.length > 0 && (
        <div className="border border-red-200 rounded-lg overflow-hidden">
          <div className="bg-red-50 px-4 py-2 text-sm font-medium text-red-700">
            Skipped rows
          </div>
          <div className="divide-y divide-cream-100 max-h-48 overflow-y-auto">
            {skippedWithErrors.map((r, idx) => (
              <div key={idx} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="font-mono text-cream-700 shrink-0">{r.sku}</span>
                <span className="text-red-600 text-xs">{r.error ?? 'Skipped'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-center gap-3">
        <Button variant="outline" size="sm" onClick={onReset}>
          Import more
        </Button>
        <Button
          className="bg-teal-500 hover:bg-teal-600 text-cream-50"
          onClick={() => router.push('/products')}
        >
          View Products
        </Button>
      </div>
    </div>
  );
}

// ── Main CsvImportStepper ─────────────────────────────────────────────────────

export function CsvImportStepper() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const { data: brandsData, isLoading: brandsLoading } = useTenantBrands();

  // Build slug → tenant_brand_id map from master_brand.slug
  const brandSlugToId = new Map<string, string>();
  (brandsData?.brands ?? []).forEach((tb) => {
    if (tb.master_brand?.slug) {
      brandSlugToId.set(tb.master_brand.slug, tb.id);
    }
  });

  const handleFileSelected = (selectedFile: File, rows: ParsedRow[]) => {
    setFile(selectedFile);
    setParsedRows(rows);
    setStep(2);
  };

  const handleConfirm = async (
    validRows: Array<ProductCsvRow & { tenant_brand_id: string }>
  ) => {
    setIsImporting(true);
    try {
      const res = await fetch('/api/tenant/products/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: validRows }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Import failed');
      }

      const result: ImportResult = await res.json();
      setImportResult(result);
      setStep(3);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      toast.error(message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setFile(null);
    setParsedRows([]);
    setImportResult(null);
  };

  return (
    <div className="bg-white border border-cream-200 rounded-xl p-8">
      <StepIndicator currentStep={step} />

      {step === 1 && (
        <Step1Upload
          onFileSelected={handleFileSelected}
          brandSlugToId={brandSlugToId}
          brandsLoaded={!brandsLoading}
        />
      )}

      {step === 2 && (
        <Step2Preview
          parsedRows={parsedRows}
          onBack={() => {
            setStep(1);
            setFile(null);
            setParsedRows([]);
          }}
          onConfirm={handleConfirm}
          brandSlugToId={brandSlugToId}
          isImporting={isImporting}
        />
      )}

      {step === 3 && importResult && (
        <Step3Result result={importResult} onReset={handleReset} />
      )}

      {/* Show selected file name in step 2 */}
      {step === 2 && file && (
        <p className="mt-4 text-xs text-cream-400 text-right">{file.name}</p>
      )}
    </div>
  );
}
