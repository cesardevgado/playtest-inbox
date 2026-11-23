export const publicDemo = () => process.env.DEMO_ONLY === "true";
export const demoLifetime = 60 * 60 * 1000;
export const demoLimits = { sessions: 60, issues: 20, builds: 12 };

export function appOrigin() {
  return (
    process.env.APP_ORIGIN ||
    process.env.RENDER_EXTERNAL_URL ||
    "http://127.0.0.1:3000"
  );
}

export function sessionCookieIsSecure(
  origin: string,
  forceSecure: boolean,
  productionDemo: boolean,
) {
  if (forceSecure || origin.startsWith("https://")) return true;
  // Some browsers drop Secure cookies over local HTTP. Exempt only a
  // configured loopback origin. The Render entry point requires HTTPS.
  const loopbackHttp =
    /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(origin);
  return productionDemo && !loopbackHttp;
}
