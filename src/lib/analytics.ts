export type AnalyticsEventName =
  | 'landing_page_visited'
  | 'sign_up_started'
  | 'sign_up_completed'
  | 'training_session_started'
  | 'training_session_completed'
  | 'subscription_page_viewed'
  | 'checkout_started'
  | 'subscription_activated'
  | 'sample_training_started'
  | 'sample_training_completed'
  | 'signup_prompt_viewed'
  | 'signup_prompt_clicked'
  | 'email_verification_required'
  | 'onboarding_started'
  | 'onboarding_completed'
  | 'page_view';

type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

export type AnalyticsPayload = AnalyticsProperties & {
  event: AnalyticsEventName;
  page_location: string;
  page_path: string;
};

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
    weissAnalytics?: {
      track?: (event: AnalyticsEventName, payload: AnalyticsPayload) => void;
    };
  }
}

function definedProperties(properties: AnalyticsProperties): Record<string, string | number | boolean | null> {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined),
  ) as Record<string, string | number | boolean | null>;
}

/**
 * Provider-neutral analytics bridge. It deliberately avoids user identifiers and
 * sends events to a dataLayer, an optional integration callback, and a DOM event.
 */
export function trackAnalyticsEvent(
  event: AnalyticsEventName,
  properties: AnalyticsProperties = {},
): void {
  if (typeof window === 'undefined') return;

  const payload: AnalyticsPayload = {
    event,
    page_location: window.location.href,
    page_path: window.location.pathname,
    ...definedProperties(properties),
  };

  window.dataLayer?.push(payload);
  window.dispatchEvent(new CustomEvent<AnalyticsPayload>('weiss:analytics', { detail: payload }));
  window.weissAnalytics?.track?.(event, payload);
}
