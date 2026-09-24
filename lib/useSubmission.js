'use client';

import { useRef, useState } from 'react';

// A synchronous lock also covers two submits before React paints disabled buttons.
export function useSubmission() {
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  async function run(task) {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    try { return await task(); }
    finally { lock.current = false; setPending(false); }
  }
  return { pending, run };
}
