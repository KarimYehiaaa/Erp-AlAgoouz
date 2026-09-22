import { pathToFileURL } from 'node:url';

export async function checkHealthResponse(response) {
  if (!response.ok) throw new Error(`Health endpoint returned HTTP ${response.status}`);
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new Error('Health endpoint did not return JSON');
  }
  const body = await response.json();
  if (body?.success !== true || body?.db?.connected !== true) {
    throw new Error('API or database is not healthy');
  }
}

export async function checkProduction({
  apiOrigin = 'https://agoouz-api.vercel.app',
  webOrigin = 'https://agoouz.vercel.app',
  fetchImpl = fetch,
} = {}) {
  const targets = [
    { name: 'Direct API and database', url: new URL('/health', apiOrigin), health: true },
    {
      name: 'Frontend API proxy and database',
      url: new URL('/api/v1/health', webOrigin),
      health: true,
    },
    { name: 'Web application', url: new URL('/', webOrigin), health: false },
  ];
  const results = await Promise.allSettled(
    targets.map(async (target) => {
      const response = await fetchImpl(target.url, {
        signal: AbortSignal.timeout(20000),
        cache: 'no-store',
      });
      if (target.health) {
        await checkHealthResponse(response);
      } else {
        if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) {
          throw new Error(`Web endpoint returned unexpected response (HTTP ${response.status})`);
        }
        if (!/<!doctype html>/i.test(await response.text()))
          throw new Error('Web document is missing');
      }
      return target.name;
    }),
  );
  const failures = results.flatMap((result, index) =>
    result.status === 'rejected' ? [`${targets[index].name}: ${result.reason.message}`] : [],
  );
  if (failures.length) throw new Error(failures.join('\n'));
  return targets.map((target) => target.name);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkProduction()
    .then((checks) => {
      checks.forEach((check) => console.log(`OK: ${check}`));
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
