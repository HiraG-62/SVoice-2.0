import { findMissingConfig } from '../utils/requiredConfig';

export default defineNitroPlugin(() => {
  const missing = findMissingConfig(process.env);
  if (missing.length === 0) return;

  console.error(`設定不足: ${missing.join(', ')}`);
});
