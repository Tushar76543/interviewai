const PRIMARY_GOOGLE_CLIENT_ID_ENV = "VITE_GOOGLE_CLIENT_ID";
const LEGACY_GOOGLE_CLIENT_ID_ENV = "VITE_GOOGLE_OAUTH_CLIENT_ID";

export const GOOGLE_OAUTH_CLIENT_ID = (
  import.meta.env.VITE_GOOGLE_CLIENT_ID ??
  import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID ??
  ""
).trim();

export const hasGoogleOauthClientId = GOOGLE_OAUTH_CLIENT_ID.length > 0;

const googleConfigHint =
  `Set ${PRIMARY_GOOGLE_CLIENT_ID_ENV} in your frontend environment settings ` +
  `(legacy ${LEGACY_GOOGLE_CLIENT_ID_ENV} also works).`;

export const googleSigninNotConfiguredMessage = `Google sign-in is not configured yet. ${googleConfigHint}`;
export const googleSignupNotConfiguredMessage = `Google sign-up is not configured yet. ${googleConfigHint}`;
