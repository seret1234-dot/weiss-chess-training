import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, '..');
const distDirectory = path.join(projectDirectory, 'dist');
const metadataPath = path.join(projectDirectory, 'src', 'seo', 'routeMetadata.json');
const metadataStart = '<!-- route-metadata:start -->';
const metadataEnd = '<!-- route-metadata:end -->';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function shellFileName(routePath) {
  return routePath === '/'
    ? 'home.html'
    : `${routePath.slice(1).replaceAll('/', '--')}.html`;
}

function renderMetadata(site, routePath, details) {
  const canonicalPath = details.canonicalPath ?? routePath;
  const canonicalUrl = `${site.url}${canonicalPath}`;
  const robots = details.indexable ? 'index,follow' : 'noindex,follow';
  const title = escapeHtml(details.title);
  const description = escapeHtml(details.description);
  const canonical = escapeHtml(canonicalUrl);
  const socialImage = escapeHtml(site.socialImage);
  const siteName = escapeHtml(site.name);

  return [
    `    <title>${title}</title>`,
    `    <meta name="description" content="${description}" />`,
    `    <meta name="robots" content="${robots}" />`,
    `    <link rel="canonical" href="${canonical}" />`,
    '    <meta property="og:type" content="website" />',
    `    <meta property="og:site_name" content="${siteName}" />`,
    `    <meta property="og:title" content="${title}" />`,
    `    <meta property="og:description" content="${description}" />`,
    `    <meta property="og:url" content="${canonical}" />`,
    `    <meta property="og:image" content="${socialImage}" />`,
    '    <meta name="twitter:card" content="summary_large_image" />',
    `    <meta name="twitter:title" content="${title}" />`,
    `    <meta name="twitter:description" content="${description}" />`,
    `    <meta name="twitter:image" content="${socialImage}" />`,
  ].join('\n');
}

const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
const template = await readFile(path.join(distDirectory, 'index.html'), 'utf8');
const markerStart = template.indexOf(metadataStart);
const markerEnd = template.indexOf(metadataEnd);

if (markerStart < 0 || markerEnd < markerStart) {
  throw new Error('Could not find route metadata markers in dist/index.html.');
}

const shellDirectory = path.join(distDirectory, '_route-metadata');
await rm(shellDirectory, { recursive: true, force: true });
await mkdir(shellDirectory, { recursive: true });

const shellRoutes = Object.entries(metadata.routes)
  .filter(([, details]) => details.shell === true);

for (const [routePath, details] of shellRoutes) {
  const routeHtml = [
    template.slice(0, markerStart + metadataStart.length),
    renderMetadata(metadata.site, routePath, details),
    template.slice(markerEnd),
  ].join('\n');

  await writeFile(
    path.join(shellDirectory, shellFileName(routePath)),
    routeHtml,
    'utf8',
  );
}

const publicCount = shellRoutes.filter(([, details]) => details.indexable).length;
const noindexCount = shellRoutes.length - publicCount;
console.log(
  `Generated ${shellRoutes.length} route metadata shells (${publicCount} indexable, ${noindexCount} noindex).`,
);
