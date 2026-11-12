import MiniSearch, { type SearchResult } from 'minisearch';
import { normalizeSearchText } from './searchText';

export interface CreateSearchIndexOptions<T> {
  fields: Array<keyof T & string>;
  idField?: keyof T & string;
  storeFields?: Array<keyof T & string>;
}

/**
 * Creează un index local de căutare ultra-rapid cu MiniSearch.
 * Suportă prefix search, fuzzy search (toleranță la typos), scoring și auto-suggest.
 */
export function createSearchIndex<T extends Record<string, unknown>>(
  items: T[],
  options: CreateSearchIndexOptions<T>,
) {
  const miniSearch = new MiniSearch<T>({
    fields: options.fields,
    idField: options.idField ?? ('id' as keyof T & string),
    storeFields: options.storeFields ?? options.fields,
    processTerm: (term) => normalizeSearchText(term),
    searchOptions: {
      prefix: true,
      fuzzy: 0.2,
      combineWith: 'AND',
      processTerm: (term) => normalizeSearchText(term),
    },
  });

  if (items.length > 0) {
    miniSearch.addAll(items);
  }

  return {
    search: (query: string): SearchResult[] => {
      const q = query.trim();
      if (!q) return [];
      return miniSearch.search(q);
    },
    autoSuggest: (query: string) => {
      const q = query.trim();
      if (!q) return [];
      return miniSearch.autoSuggest(q, { prefix: true, fuzzy: 0.2 });
    },
    raw: miniSearch,
  };
}
