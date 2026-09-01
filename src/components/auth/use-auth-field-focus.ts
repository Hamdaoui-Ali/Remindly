'use client';

import { useEffect, type RefObject } from 'react';

export function useAuthFieldFocus<T extends string>(
  field: T | null,
  attempt: number,
  refs: Partial<Record<T, RefObject<HTMLInputElement | null>>>,
) {
  const targetRef = field ? refs[field] : undefined;

  useEffect(() => {
    targetRef?.current?.focus();
  }, [attempt, field, targetRef]);
}
