import type { APIRoute } from 'astro';
import { featuresToText } from '../lib/features';

export const GET: APIRoute = () =>
  new Response(featuresToText(), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
