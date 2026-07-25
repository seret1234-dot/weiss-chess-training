# Analytics and Search Console setup

The app ships a provider-neutral analytics bridge; it does not include a tracking ID or send user identifiers, emails, FENs, or moves.

`trackAnalyticsEvent` pushes a payload to `window.dataLayer`, dispatches a `weiss:analytics` browser event, and calls an optional `window.weissAnalytics.track(event, payload)` callback. The bridge supports these product events:

- `landing_page_visited`
- `sign_up_started`, `sign_up_completed`
- `training_session_started`, `training_session_completed`
- `subscription_page_viewed`, `checkout_started`, `subscription_activated`
- `sample_training_started`, `sample_training_completed`
- `signup_prompt_viewed`, `signup_prompt_clicked`
- `email_verification_required`

This isolated SEO release emits `page_view`, `landing_page_visited`,
`training_session_started`, and `training_session_completed` from the application shell.
Sign-up hooks are included with the existing Auth page. Subscription events remain
for the follow-up commit that includes the currently uncommitted subscription UI.
The short guest sample emits its start and completion events, then tracks the
account prompt being shown and selected. A confirmation-required sign-up emits
`email_verification_required` without including the visitor's email address.

To connect a provider, add its approved production snippet through Vercel or the site shell, then map these data-layer events in that provider. Alternatively, register `window.weissAnalytics.track` before the app loads, or listen for the `weiss:analytics` event. Keep consent and privacy requirements specific to the chosen analytics provider and jurisdictions.

For Google Search Console, set the Vercel **Production** environment variable `VITE_GOOGLE_SITE_VERIFICATION` to the verification token supplied by Google, then redeploy. The token is intentionally not committed. The build injects a `google-site-verification` meta tag only when that variable is present.

`public/robots.txt` and `public/sitemap.xml` use `https://weisschess.com` as the canonical host. Submit `https://weisschess.com/sitemap.xml` in Search Console after deployment.
