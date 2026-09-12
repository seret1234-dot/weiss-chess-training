import { useEffect, useRef } from 'react';
import { trackAnalyticsEvent } from '../lib/analytics';
import { ANALYTICS_CONSENT_EVENT, analyticsConsent } from '../analytics/config';
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
    (/^\/openings\/[^/]+$/.test(pathname) && pathname !== '/openings/my-openings') ||
    (/^\/master-games\/[^/]+$/.test(pathname) && pathname !== '/master-games/my-library') ||
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
  const lastRoute = useRef<string | null>(null);

  useEffect(() => {
    installLocationChangeTracking();

    const reportRoute = () => {
      const { pathname } = window.location;
      const routeKey = pathname;
      // Router initialization/replaceState can notify twice for the same page.
      // Query/hash-only changes carry internal state, not another pageview.
      if (lastRoute.current === routeKey) return;
      lastRoute.current = routeKey;
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
    const consentChanged = () => { if (analyticsConsent() === 'granted') trackAnalyticsEvent('page_view'); };
    window.addEventListener(ANALYTICS_CONSENT_EVENT, consentChanged);
    window.addEventListener('popstate', reportRoute);
    window.addEventListener(SITE_LOCATION_CHANGE_EVENT, reportRoute);
    window.addEventListener('weiss:training-item-completed', reportCompletion);
    return () => {
      window.removeEventListener(ANALYTICS_CONSENT_EVENT, consentChanged);
      window.removeEventListener('popstate', reportRoute);
      window.removeEventListener(SITE_LOCATION_CHANGE_EVENT, reportRoute);
      window.removeEventListener('weiss:training-item-completed', reportCompletion);
    };
  }, []);

  return null;
}
