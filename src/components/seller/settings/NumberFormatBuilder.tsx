'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type ChipItem = { type: 'token'; value: string } | { type: 'separator'; value: string };

const TOKENS = ['{YYYY}', '{MM}', '{DD}', '{SEQ}'] as const;
const TOKEN_REGEX = /(\{YYYY\}|\{MM\}|\{DD\}|\{SEQ\})/;

function parseFormatString(format: string): ChipItem[] {
  const parts = format.split(TOKEN_REGEX);
  const items: ChipItem[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (TOKENS.includes(part as (typeof TOKENS)[number])) {
      items.push({ type: 'token', value: part });
    } else {
      items.push({ type: 'separator', value: part });
    }
  }
  return items;
}

function serializeItems(items: ChipItem[]): string {
  return items.map((i) => i.value).join('');
}

interface NumberFormatBuilderProps {
  value: string;
  onChange: (v: string) => void;
  preview: string;
  label: string;
  defaultValue: string;
}

export function NumberFormatBuilder({ value, onChange, preview, label, defaultValue }: NumberFormatBuilderProps) {
  const [items, setItems] = useState<ChipItem[]>(() => parseFormatString(value));
  const [separatorInput, setSeparatorInput] = useState('-');
  const prevValueRef = useRef(value);

  // Sync items when value prop changes from outside
  useEffect(() => {
    if (value !== prevValueRef.current) {
      setItems(parseFormatString(value));
      prevValueRef.current = value;
    }
  }, [value]);

  function commit(next: ChipItem[]) {
    setItems(next);
    const fmt = serializeItems(next);
    prevValueRef.current = fmt;
    onChange(fmt);
  }

  function addToken(token: string) {
    commit([...items, { type: 'token', value: token }]);
  }

  function addSeparator() {
    const sep = separatorInput.trim();
    if (!sep) return;
    commit([...items, { type: 'separator', value: sep }]);
  }

  function removeItem(index: number) {
    commit(items.filter((_, i) => i !== index));
  }

  function reset() {
    const next = parseFormatString(defaultValue);
    setItems(next);
    prevValueRef.current = defaultValue;
    onChange(defaultValue);
  }

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">{label}</Label>

      {/* Available token chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-cream-600">Add:</span>
        {TOKENS.map((token) => (
          <button
            key={token}
            type="button"
            onClick={() => addToken(token)}
            className="rounded border border-teal-200 bg-teal-50 px-2 py-0.5 font-mono text-xs font-medium text-teal-800 transition-colors hover:bg-teal-100"
          >
            {token}
          </button>
        ))}
        <div className="flex items-center gap-1.5">
          <Input
            className="h-7 w-16 px-2 font-mono text-xs"
            value={separatorInput}
            onChange={(e) => setSeparatorInput(e.target.value.slice(0, 5))}
            placeholder="-"
            maxLength={5}
            aria-label="Separator character"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={addSeparator}
          >
            + separator
          </Button>
        </div>
      </div>

      {/* Current format chip sequence */}
      <div className="flex min-h-[36px] flex-wrap items-center gap-1 rounded-md border border-cream-200 bg-cream-50 px-3 py-2">
        {items.length === 0 ? (
          <span className="text-xs text-cream-400">Empty format — add tokens above</span>
        ) : (
          items.map((item, i) => (
            <span
              key={i}
              className={[
                'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium',
                item.type === 'token'
                  ? 'border border-teal-200 bg-teal-100 font-mono text-teal-800'
                  : 'border border-cream-300 bg-white text-cream-700',
              ].join(' ')}
            >
              {item.value}
              <button
                type="button"
                onClick={() => removeItem(i)}
                className="ml-0.5 text-cream-400 hover:text-cream-700"
                aria-label={`Remove ${item.value}`}
              >
                <X size={10} />
              </button>
            </span>
          ))
        )}
      </div>

      {/* Preview + reset */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-cream-600">
          Preview <span className="font-mono font-medium text-cream-800">{preview}</span>
        </p>
        <button
          type="button"
          onClick={reset}
          className="text-xs text-teal-600 hover:underline"
        >
          Reset to default
        </button>
      </div>
    </div>
  );
}
