import { token_set_ratio } from 'fuzzball';
import { normalizeLookup } from '@/lib/onboarding/normalize-lookup';

export interface PhotoMatchCandidate {
  key: string;
  entityId: string;
  entityType: 'tenant_product' | 'tenant_brand' | 'tenant_category';
  label: string;
}

export interface PhotoFileEntry {
  file: File;
  relativePath: string;
  stem: string;
  normalizedStem: string;
}

export interface PhotoMatchResult {
  file: File;
  relativePath: string;
  candidate: PhotoMatchCandidate | null;
  confidence: number;
  matchKind: 'exact' | 'fuzzy' | 'none';
}

const VALID_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

export function isValidImageFileName(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.startsWith('.')) return false;
  if (lower.includes('_resized')) return false;
  const ext = lower.slice(lower.lastIndexOf('.'));
  return VALID_EXTENSIONS.has(ext);
}

export type PhotoListInput = FileList | File[] | Array<{ file: File; relativePath: string }>;

export type WebkitFsFileEntry = {
  isFile: true;
  isDirectory: false;
  name: string;
  file: (ok: (file: File) => void, err?: (error: DOMException) => void) => void;
};

export type WebkitFsDirectoryEntry = {
  isFile: false;
  isDirectory: true;
  name: string;
  createReader: () => {
    readEntries: (
      ok: (entries: Array<WebkitFsFileEntry | WebkitFsDirectoryEntry>) => void,
      err?: (error: DOMException) => void,
    ) => void;
  };
};

export type WebkitFsEntry = WebkitFsFileEntry | WebkitFsDirectoryEntry;

export function folderUploadDialogCopy(fileCount: number, folderName: string): { title: string; message: string } {
  const filesWord = fileCount === 1 ? 'file' : 'files';
  return {
    title: `Upload ${fileCount} ${filesWord} to your catalog`,
    message: `This will upload all files from “${folderName}”. Only do this if you trust the site.`,
  };
}

export function folderNameFromPhotoEntries(
  entries: Array<{ relativePath: string }>,
  fallback = 'your photos',
): string {
  for (const entry of entries) {
    const parts = entry.relativePath.split('/').filter(Boolean);
    if (parts.length >= 2 && parts[0]) return parts[0];
  }
  return fallback;
}

export function filesToPhotoEntries(fileList: FileList | File[]): Array<{ file: File; relativePath: string }> {
  return Array.from(fileList).map((file) => ({
    file,
    relativePath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
  }));
}

/** FileList is live — copy before resetting input.value or the list goes empty. */
export function snapshotFileList(fileList: FileList | null | undefined): File[] {
  return fileList ? Array.from(fileList) : [];
}

async function readDirectoryChildren(
  dir: WebkitFsDirectoryEntry,
): Promise<Array<WebkitFsFileEntry | WebkitFsDirectoryEntry>> {
  const reader = dir.createReader();
  const children: Array<WebkitFsFileEntry | WebkitFsDirectoryEntry> = [];
  for (;;) {
    const batch = await new Promise<Array<WebkitFsFileEntry | WebkitFsDirectoryEntry>>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (batch.length === 0) break;
    children.push(...batch);
  }
  return children;
}

export async function collectWebkitEntryFiles(
  entry: WebkitFsEntry,
  prefix = '',
): Promise<Array<{ file: File; relativePath: string }>> {
  const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      entry.file(resolve, reject);
    });
    return [{ file, relativePath }];
  }
  const children = await readDirectoryChildren(entry);
  const nested: Array<{ file: File; relativePath: string }> = [];
  for (const child of children) {
    nested.push(...await collectWebkitEntryFiles(child, relativePath));
  }
  return nested;
}

export async function collectDataTransferFiles(
  dataTransfer: DataTransfer,
): Promise<Array<{ file: File; relativePath: string }>> {
  const items = Array.from(dataTransfer.items ?? []);
  const fromEntries: Array<{ file: File; relativePath: string }> = [];
  for (const item of items) {
    const raw = item.webkitGetAsEntry?.() as WebkitFsEntry | null | undefined;
    if (raw) {
      fromEntries.push(...await collectWebkitEntryFiles(raw));
    }
  }
  if (fromEntries.length > 0) return fromEntries;
  return filesToPhotoEntries(dataTransfer.files);
}

export function extractPhotoFiles(fileList: PhotoListInput): PhotoFileEntry[] {
  const items = Array.from(fileList as ArrayLike<File | { file: File; relativePath: string }>);
  const entries: PhotoFileEntry[] = [];

  for (const item of items) {
    const file = item instanceof File ? item : item.file;
    if (!isValidImageFileName(file.name)) continue;
    const relativePath = item instanceof File
      ? (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
      : (item.relativePath || file.name);
    const parts = relativePath.split('/').filter(Boolean);
    let stem = file.name.replace(/\.[^.]+$/, '');
    if (parts.length >= 2 && parts[0] === 'products') {
      stem = (parts[1] ?? stem).replace(/\.[^.]+$/, '');
    }
    entries.push({
      file,
      relativePath,
      stem,
      normalizedStem: normalizeLookup(stem),
    });
  }

  return entries;
}

export function matchPhotosToCandidates(
  photos: PhotoFileEntry[],
  candidates: PhotoMatchCandidate[],
  fuzzyThreshold = 85,
): PhotoMatchResult[] {
  const candidateByNorm = new Map<string, PhotoMatchCandidate>();
  for (const c of candidates) {
    candidateByNorm.set(normalizeLookup(c.key), c);
  }

  const results: PhotoMatchResult[] = [];
  const unmatchedPhotos: PhotoFileEntry[] = [];
  const unmatchedCandidates = [...candidates];

  for (const photo of photos) {
    const exact = candidateByNorm.get(photo.normalizedStem);
    if (exact) {
      results.push({
        file: photo.file,
        relativePath: photo.relativePath,
        candidate: exact,
        confidence: 100,
        matchKind: 'exact',
      });
      const idx = unmatchedCandidates.findIndex((c) => c.entityId === exact.entityId);
      if (idx >= 0) unmatchedCandidates.splice(idx, 1);
      continue;
    }
    unmatchedPhotos.push(photo);
  }

  for (const photo of unmatchedPhotos) {
    let best: PhotoMatchCandidate | null = null;
    let bestScore = 0;

    for (const candidate of unmatchedCandidates) {
      const score = token_set_ratio(photo.normalizedStem, normalizeLookup(candidate.key));
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    if (best && bestScore >= fuzzyThreshold) {
      results.push({
        file: photo.file,
        relativePath: photo.relativePath,
        candidate: best,
        confidence: bestScore,
        matchKind: 'fuzzy',
      });
      const idx = unmatchedCandidates.findIndex((c) => c.entityId === best!.entityId);
      if (idx >= 0) unmatchedCandidates.splice(idx, 1);
    } else {
      results.push({
        file: photo.file,
        relativePath: photo.relativePath,
        candidate: null,
        confidence: bestScore,
        matchKind: 'none',
      });
    }
  }

  return results;
}
