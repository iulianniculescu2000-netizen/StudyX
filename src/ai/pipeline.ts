import { validateJson } from './validator';
import { logAIDebug } from './debug';

export async function runAIPipeline<T>(steps: {
  retrieve: () => Promise<string> | string;
  generate: (context: string) => Promise<string>;
  validate: (raw: string) => T | null;
  fix?: (raw: string, error: string) => Promise<string>;
}) {
  const context = await steps.retrieve();
  logAIDebug('pipeline:context', context);
  let raw = await steps.generate(context);
  logAIDebug('pipeline:raw', raw);

  let value = steps.validate(raw);
  if (value) return value;

  if (steps.fix) {
    const repair = validateJson<T>(raw);
    raw = await steps.fix(raw, repair.error ?? 'JSON invalid');
    logAIDebug('pipeline:fixedRaw', raw);
    value = steps.validate(raw);
    if (value) return value;
  }

  throw new Error('Validarea răspunsului AI a eșuat');
}
