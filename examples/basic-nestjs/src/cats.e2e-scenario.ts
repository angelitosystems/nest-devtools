/**
 * Traffic generator: exercises the example endpoints so the DevTools dashboard
 * fills up with requests, logs and errors.
 *
 *   bun run src/cats.e2e-scenario.ts
 */
const BASE_URL = process.env['EXAMPLE_URL'] ?? 'http://localhost:3000';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  console.log(`Generating traffic against ${BASE_URL}...`);

  for (let i = 0; i < 10; i++) {
    await fetch(`${BASE_URL}/cats`);
    await sleep(120);
  }

  await fetch(`${BASE_URL}/cats/1`);
  await fetch(`${BASE_URL}/cats/2`);
  await fetch(`${BASE_URL}/cats/999`); // 500 → error feed
  await fetch(`${BASE_URL}/cats?page=2&size=10`);
  await fetch(`${BASE_URL}/cats`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer secret-token-should-be-redacted' },
    body: JSON.stringify({ name: 'Felix', age: 3, password: 'hunter2' }),
  });

  for (let i = 0; i < 5; i++) {
    await fetch(`${BASE_URL}/cats/${i + 1}`);
    await sleep(80);
  }

  console.log('Done. Check the DevTools dashboard at http://localhost:4317');
}

void main();
