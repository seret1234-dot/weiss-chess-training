import { useEffect, useState } from 'react';

const SITE_URL = 'https://weisschess.com';
const SITE_NAME = 'Weiss Chess Trainer';
const DEFAULT_DESCRIPTION =
  'Practice chess tactics, checkmates, openings, endgames, master games, and board vision with interactive training.';
const SOCIAL_IMAGE = `${SITE_URL}/og-image.png`;
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

const STATIC_PAGES: Record<string, SeoDetails> = {
  '/': {
    title: 'Weiss Chess Trainer | Chess Puzzles, Openings & Endgames',
    description: DEFAULT_DESCRIPTION,
    indexable: true,
  },
  '/mates': {
    title: 'Checkmate Puzzles | Weiss Chess Trainer',
    description: 'Build pattern recognition with interactive checkmate puzzles for every level.',
    indexable: true,
  },
  '/tactics': {
    title: 'Chess Tactics Training | Weiss Chess Trainer',
    description: 'Train tactical patterns with interactive chess puzzles and structured difficulty levels.',
    indexable: true,
  },
  '/endgame': {
    title: 'Chess Endgame Training | Weiss Chess Trainer',
    description: 'Practice practical checkmates, endgame studies, and essential chess endgame techniques.',
    indexable: true,
  },
  '/endgame/piece-mates': {
    title: 'Piece Checkmates | Weiss Chess Trainer',
    description: 'Learn fundamental mating patterns including bishop and knight, rook, and queen checkmates.',
    indexable: true,
  },
  '/endgame-studies': {
    title: 'Chess Endgame Studies | Weiss Chess Trainer',
    description: 'Solve instructional endgame studies and sharpen practical endgame calculation.',
    indexable: true,
  },
  '/openings': {
    title: 'Chess Opening Trainer | Weiss Chess Trainer',
    description: 'Learn chess openings through move-by-move memory training and interactive practice.',
    indexable: true,
  },
  '/master-games': {
    title: 'Master Games Training | Weiss Chess Trainer',
    description: 'Study memorable chess games and train the critical moves played by great masters.',
    indexable: true,
  },
  '/board-vision': {
    title: 'Board Vision Trainer | Weiss Chess Trainer',
    description: 'Improve chessboard visualization, coordinate recognition, and calculation speed.',
    indexable: true,
  },
  '/museum': {
    title: 'Chess Puzzle Museum | Weiss Chess Trainer',
    description: 'Explore a curated collection of unusual chess puzzles and creative positions.',
    indexable: true,
  },
  '/pricing': {
    title: 'Pricing | Weiss Chess Trainer',
    description: 'Explore Weiss Chess Trainer plans and start structured chess training.',
    indexable: true,
  },
};

function titleFromSlug(slug: string): string {
  return decodeURIComponent(slug)
    .split('-')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function readableRouteName(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean).map(titleFromSlug);
  return parts.join(' · ') || 'Home';
}

function pageDetails(pathname: string): SeoDetails {
  const staticPage = STATIC_PAGES[pathname];
  if (staticPage) return staticPage;

  if (/^\/mates\/m[1-8]$/.test(pathname)) {
    const level = pathname.split('/').at(-1)?.toUpperCase();
    return {
      title: `Mate in ${level?.slice(1)} Puzzles | ${SITE_NAME}`,
      description: 'Practice themed checkmate puzzles with clear, interactive chess training.',
      indexable: true,
    };
  }

  if (/^\/tactics\/m[1-4]$/.test(pathname)) {
    return {
      title: `Chess Tactics Puzzles | ${SITE_NAME}`,
      description: 'Practice chess tactics by theme and difficulty.',
      indexable: true,
    };
  }

  const openingFamily = pathname.match(/^\/openings\/family\/([^/]+)$/);
  if (openingFamily) {
    const family = titleFromSlug(openingFamily[1]);
    return {
      title: `${family} Chess Openings | ${SITE_NAME}`,
      description: `Explore ${family} opening lines and begin interactive opening training.`,
      indexable: true,
    };
  }

  const utilityPages: Record<string, SeoDetails> = {
    '/auth': { title: `Sign In | ${SITE_NAME}`, description: 'Sign in or create a Weiss Chess Trainer account.', indexable: false },
    '/reset-password': { title: `Reset Password | ${SITE_NAME}`, description: 'Reset your Weiss Chess Trainer password.', indexable: false },
    '/account': { title: `Account | ${SITE_NAME}`, description: 'Manage your Weiss Chess Trainer account and subscription.', indexable: false },
    '/onboarding': { title: `Welcome | ${SITE_NAME}`, description: 'Set up your Weiss Chess Trainer account.', indexable: false },
    '/auto': { title: `Auto Training | ${SITE_NAME}`, description: 'Your personal Weiss Chess Trainer study session.', indexable: false },
    '/play-computer': { title: `Play Computer | ${SITE_NAME}`, description: 'Play a practice game against the computer.', indexable: false },
    '/play-vs-computer': { title: `Play Computer | ${SITE_NAME}`, description: 'Play a practice game against the computer.', indexable: false },
    '/book-trainer': { title: `Book Trainer | ${SITE_NAME}`, description: 'Practice chess from your personal training library.', indexable: false },
    '/analyze': { title: `Analyze a Position | ${SITE_NAME}`, description: 'Analyze chess positions, PGN, and FEN.', indexable: false },
    '/analyze/board': { title: `Board Analysis | ${SITE_NAME}`, description: 'Analyze a chess position on the board.', indexable: false },
    '/analyze/setup': { title: `Set Up a Position | ${SITE_NAME}`, description: 'Create a chess position for analysis.', indexable: false },
    '/analyze/review': { title: `Game Review | ${SITE_NAME}`, description: 'Review a chess game move by move.', indexable: false },
    '/analyze/image': { title: `Image to Position | ${SITE_NAME}`, description: 'Convert a chessboard image into a position.', indexable: false },
  };
  if (utilityPages[pathname]) return utilityPages[pathname];

  const legacyAlias = pathname.match(/^\/(board-vision|book-trainer|play-computer)\/[^/]+$/);
  if (legacyAlias) {
    const canonicalPath = `/${legacyAlias[1]}`;
    return {
      title: `${readableRouteName(canonicalPath)} | ${SITE_NAME}`,
      description: DEFAULT_DESCRIPTION,
      indexable: false,
      canonicalPath,
    };
  }

  const legacyCanonical: Record<string, string> = {
    '/board-vision-old': '/board-vision',
    '/master-games-old': '/master-games',
    '/book-trainer': '/book-trainer',
    '/play-computer': '/play-computer',
    '/play-vs-computer': '/play-computer',
  };

  return {
    title: `${readableRouteName(pathname)} | ${SITE_NAME}`,
    description: DEFAULT_DESCRIPTION,
    indexable: false,
    canonicalPath: legacyCanonical[pathname] ?? pathname,
  };
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
  if (!indexable || window.location.pathname !== '/') return;

  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: `${SITE_URL}/`,
        name: SITE_NAME,
        description: DEFAULT_DESCRIPTION,
      },
      {
        '@type': 'SoftwareApplication',
        name: SITE_NAME,
        applicationCategory: 'EducationalApplication',
        operatingSystem: 'Web',
        url: `${SITE_URL}/`,
        description: DEFAULT_DESCRIPTION,
      },
    ],
  };
  const script = document.createElement('script');
  script.id = id;
  script.type = 'application/ld+json';
  script.text = JSON.stringify(schema);
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
