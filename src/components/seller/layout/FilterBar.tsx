import { Search, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface FilterBarProps {
  count: string;
  searchPlaceholder: string;
  chips: string[];
  activeChip: string;
  sortBy: string;
  hideViewToggle: boolean;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  onChipChange?: (chip: string) => void;
  sortOptions?: string[];
  onSortChange?: (option: string) => void;
}

export function FilterBar({
  count,
  searchPlaceholder,
  chips,
  activeChip,
  sortBy,
  hideViewToggle,
  searchValue,
  onSearchChange,
  onChipChange,
  sortOptions,
  onSortChange,
}: FilterBarProps) {
  return (
    <section className="mt-5 flex flex-wrap items-center gap-3 rounded-t-[14px] border border-cream-300 border-b-0 bg-cream-50 px-3 py-[10px]">
      <div className="relative inline-flex flex-[0_0_280px] items-center gap-2 rounded-[8px] border border-cream-300 bg-white px-[10px] py-[6px] text-cream-700">
        <Search size={14} className="pointer-events-none text-cream-600" />
        <input
          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[12.5px] text-cream-900 placeholder:text-cream-600 focus:outline-none focus:ring-0"
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          value={searchValue}
          onChange={(event) => onSearchChange?.(event.target.value)}
        />
      </div>
      <div className="inline-flex items-center gap-1.5">
        {chips.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => onChipChange?.(chip)}
            className={cn(
              'whitespace-nowrap rounded-full border border-cream-400 bg-white px-[11px] py-1 text-[12px] text-cream-800 transition-colors hover:bg-cream-100',
              chip === activeChip && 'border-teal-500 bg-teal-500 text-cream-50 hover:bg-teal-500'
            )}
          >
            {chip}
          </button>
        ))}
      </div>
      <div className="flex flex-1 justify-center">
        <p className="font-mono text-[11.5px] text-cream-700">{count}</p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex items-center gap-1 rounded-[8px] border border-cream-400 bg-white px-[10px] py-[5px] text-[12.5px] text-cream-800 hover:bg-cream-100">
          <span className="text-cream-700">Sort</span>
          <span>{sortBy}</span>
          <ChevronDown size={14} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[220px] border-cream-300">
          {(sortOptions ?? [sortBy]).map((option) => (
            <DropdownMenuItem
              key={option}
              onClick={() => onSortChange?.(option)}
              className={cn(option === sortBy && 'bg-cream-100 font-medium text-cream-900')}
            >
              {option}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {!hideViewToggle ? (
        <button type="button" className="rounded-md border border-cream-200 px-2 py-1 text-[12px] text-cream-700">
          View
        </button>
      ) : null}
    </section>
  );
}
