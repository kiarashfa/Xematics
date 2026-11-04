// The complete third-party notices, with every license text, published with the site.
import type { APIRoute } from 'astro';
import { fullNotices } from '../notices.ts';

export const GET: APIRoute = () =>
  new Response(fullNotices(), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
