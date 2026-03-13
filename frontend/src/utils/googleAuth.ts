const PRIMARY_GOOGLE_CLIENT_ID_ENV = "VITE_GOOGLE_CLIENT_ID";
const LEGACY_GOOGLE_CLIENT_ID_ENV = "VITE_GOOGLE_OAUTH_CLIENT_ID";
const SHARED_GOOGLE_CLIENT_ID_ENV = "GOOGLE_CLIENT_ID";

const BUILD_TIME_GOOGLE_CLIENT_ID = (
  typeof __GOOGLE_CLIENT_ID__ === "string" ? __GOOGLE_CLIENT_ID__ : ""
).trim();

export const GOOGLE_OAUTH_CLIENT_ID = (
  import.meta.env.VITE_GOOGLE_CLIENT_ID ??
  import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID ??
  BUILD_TIME_GOOGLE_CLIENT_ID ??
  ""
).trim();

export const hasGoogleOauthClientId = GOOGLE_OAUTH_CLIENT_ID.length > 0;

const googleConfigHint =
  `Set ${PRIMARY_GOOGLE_CLIENT_ID_ENV} in your frontend environment settings ` +
  `or define ${SHARED_GOOGLE_CLIENT_ID_ENV} for the shared build environment ` +
  `(legacy ${LEGACY_GOOGLE_CLIENT_ID_ENV} also works).`;

export const googleSigninNotConfiguredMessage = `Google sign-in is not configured yet. ${googleConfigHint}`;
export const googleSignupNotConfiguredMessage = `Google sign-up is not configured yet. ${googleConfigHint}`;
