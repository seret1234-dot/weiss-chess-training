import { useEffect, useRef } from 'react';
import { trackAnalyticsEvent } from '../lib/analytics';
import {
  installLocationChangeTracking,
  SITE_LOCATION_CHANGE_EVENT,
} from './SeoHead';

function isTrainingRoute(pathname: string): boolean {
  return (
    /^\/mates\/m[1-8](?:\/[^/]+)?$/.test(pathname) ||
    /^\/tactics\/m[1-4]\/[^/]+$/.test(pathname) ||
    /^\/endgame\/(?:piece-mates\/[^/]+|strategy)$/.test(pathname) ||
    /^\/endgame-studies\/[^/]+(?:\/[^/]+)?$/.test(pathname) ||
    (/^\/openings\/[^/]+$/.test(pathname) && !pathname.startsWith('/openings/family/')) ||
    /^\/master-games\/[^/]+$/.test(pathname) ||
    pathname.startsWith('/free-play/') ||
    pathname === '/board-vision' ||
    pathname === '/play-computer' ||
    pathname === '/play-vs-computer' ||
    pathname === '/stalemate/underpromotion'
  );
}

/** Shell-level telemetry with no dependency on router, account, or trainer implementation. */
export default function SiteAnalytics() {
  const startedRoutes = useRef(new Set<string>());

  useEffect(() => {
    installLocationChangeTracking();

    const reportRoute = () => {
      const { pathname, search } = window.location;
      const routeKey = `${pathname}${search}`;
      trackAnalyticsEvent('page_view');

      if (pathname === '/') trackAnalyticsEvent('landing_page_visited');
      if (isTrainingRoute(pathname) && !startedRoutes.current.has(routeKey)) {
        startedRoutes.current.add(routeKey);
        trackAnalyticsEvent('training_session_started', {
          training_area: pathname.split('/')[1] || 'chess',
        });
      }
    };

    const reportCompletion = (event: Event) => {
      const detail = (event as CustomEvent<{ kind?: string }>).detail;
      trackAnalyticsEvent('training_session_completed', {
        training_kind: detail?.kind ?? 'unknown',
      });
    };

    reportRoute();
    window.addEventListener('popstate', reportRoute);
    window.addEventListener(SITE_LOCATION_CHANGE_EVENT, reportRoute);
    window.addEventListener('weiss:training-item-completed', reportCompletion);
    return () => {
      window.removeEventListener('popstate', reportRoute);
      window.removeEventListener(SITE_LOCATION_CHANGE_EVENT, reportRoute);
      window.removeEventListener('weiss:training-item-completed', reportCompletion);
    };
  }, []);

  return null;
}
