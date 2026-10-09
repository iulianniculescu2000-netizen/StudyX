import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import 'katex/dist/katex.min.css';
import type { MathPlugins } from './mathLoader';

/** Lazy chunk: imported only through mathLoader.ts. */
export const mathPlugins: MathPlugins = {
  remark: [remarkMath],
  rehype: [[rehypeKatex, { throwOnError: false, strict: 'ignore', output: 'html' }]],
};
