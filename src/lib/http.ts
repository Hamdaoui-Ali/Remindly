import { NextResponse } from 'next/server';

export function jsonResponse<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function errorResponse(error: string, status = 500) {
  return jsonResponse({ error }, status);
}
