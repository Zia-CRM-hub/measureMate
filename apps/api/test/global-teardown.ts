export default async function teardown() {
  const s = (globalThis as unknown as { __pg?: { stop(): Promise<void> } }).__pg;
  if (s) await s.stop();
}

