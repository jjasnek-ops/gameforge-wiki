import type { APIRoute } from 'astro';
import { testOnly } from '~/lib/evidence';
import { siteUrl } from '~/config/site';

const robotsTxt = `
User-agent: *
${testOnly ? 'Disallow: /' : 'Allow: /'}

Sitemap: ${siteUrl}/sitemap-index.xml
`.trim();

export const GET: APIRoute = () =>
  new Response(robotsTxt, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
