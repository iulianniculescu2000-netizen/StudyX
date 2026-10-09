import { useEffect, useState } from 'react';
import type { Options } from 'react-markdown';

type PluggableList = NonNullable<Options['remarkPlugins']>;

export interface MathPlugins {
  remark: PluggableList;
  rehype: PluggableList;
}

let loaded: MathPlugins | null = null;
let pending: Promise<MathPlugins> | null = null;

/**
 * KaTeX (JS, CSS and fonts) lives in its own chunk, fetched the first time a
 * reply contains a formula. Fonts are bundled locally, so it works offline.
 */
export function loadMathPlugins(): Promise<MathPlugins> {
  pending ??= import('./mathPlugins')
    .then((module) => {
      loaded = module.mathPlugins;
      return loaded;
    })
    .catch((error) => {
      pending = null;
      throw error;
    });
  return pending;
}

/** `null` until the math chunk is ready (formulas show as plain text meanwhile). */
export function useMathPlugins(enabled: boolean): MathPlugins | null {
  const [plugins, setPlugins] = useState<MathPlugins | null>(loaded);
  useEffect(() => {
    if (!enabled || plugins) return undefined;
    let cancelled = false;
    loadMathPlugins()
      .then((value) => { if (!cancelled) setPlugins(value); })
      .catch(() => { /* formulas stay as text */ });
    return () => { cancelled = true; };
  }, [enabled, plugins]);
  return enabled ? plugins : null;
}
