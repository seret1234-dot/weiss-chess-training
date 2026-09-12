import { useEffect, useState } from 'react';
import routeMetadata from '../seo/routeMetadata.json';
import { seoDetails, structuredData } from '../seo/routePolicy';

const SITE_URL = routeMetadata.site.url;
const SITE_NAME = routeMetadata.site.name;
const DEFAULT_DESCRIPTION = routeMetadata.site.defaultDescription;
const SOCIAL_IMAGE = routeMetadata.site.socialImage;
export const SITE_LOCATION_CHANGE_EVENT = 'weiss:location-change';

declare global {
  interface Window {
    __weissLocationTrackingInstalled?: boolean;
  }
}

/** Lets shell-level features observe React Router navigation without importing it. */
export function installLocationChangeTracking(): void {
  if (typeof window === 'undefined' || window.__weissLocationTrackingInstalled) return;

  window.__weissLocationTrackingInstalled = true;
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = window.history[method];
    window.history[method] = function (...args) {
      const result = original.apply(this, args);
      window.dispatchEvent(new Event(SITE_LOCATION_CHANGE_EVENT));
      return result;
    };
  }
}

type SeoDetails = {
  title: string;
  description: string;
  indexable: boolean;
  canonicalPath?: string;
};

function pageDetails(pathname: string): SeoDetails {
  return seoDetails(pathname);
}

function upsertMeta(attribute: 'name' | 'property', key: string, content: string): void {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

function upsertCanonical(href: string): void {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!element) {
    element = document.createElement('link');
    element.rel = 'canonical';
    document.head.appendChild(element);
  }
  element.href = href;
}

function upsertStructuredData(indexable: boolean): void {
  const id = 'weiss-site-structured-data';
  document.getElementById(id)?.remove();
  if (!indexable) return;

  const script = document.createElement('script');
  script.id = id;
  script.type = 'application/ld+json';
  script.text = JSON.stringify(structuredData(window.location.pathname));
  document.head.appendChild(script);
}

/** Keeps SPA route metadata deterministic for crawlers that execute client JavaScript. */
export default function SeoHead() {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    installLocationChangeTracking();
    const syncPathname = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', syncPathname);
    window.addEventListener(SITE_LOCATION_CHANGE_EVENT, syncPathname);
    return () => {
      window.removeEventListener('popstate', syncPathname);
      window.removeEventListener(SITE_LOCATION_CHANGE_EVENT, syncPathname);
    };
  }, []);

  useEffect(() => {
    const details = pageDetails(pathname);
    const canonicalUrl = `${SITE_URL}${details.canonicalPath ?? pathname}`;
    const isHebrewLegalPage = /^\/(privacy|accessibility)\/he$/.test(pathname);

    document.documentElement.lang = isHebrewLegalPage ? 'he' : 'en';
    document.documentElement.dir = isHebrewLegalPage ? 'rtl' : 'ltr';

    document.title = details.title;
    upsertMeta('name', 'description', details.description);
    upsertMeta('name', 'robots', details.indexable ? 'index,follow' : 'noindex,follow');
    upsertCanonical(canonicalUrl);

    upsertMeta('property', 'og:title', details.title);
    upsertMeta('property', 'og:description', details.description);
    upsertMeta('property', 'og:type', 'website');
    upsertMeta('property', 'og:url', canonicalUrl);
    upsertMeta('property', 'og:site_name', SITE_NAME);
    upsertMeta('property', 'og:image', SOCIAL_IMAGE);
    upsertMeta('name', 'twitter:card', 'summary_large_image');
    upsertMeta('name', 'twitter:title', details.title);
    upsertMeta('name', 'twitter:description', details.description);
    upsertMeta('name', 'twitter:image', SOCIAL_IMAGE);
    upsertStructuredData(details.indexable);
  }, [pathname]);

  return null;
}
