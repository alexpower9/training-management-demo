import { computed, reactive } from 'vue';
import { UserManager, WebStorageStateStore } from 'oidc-client-ts';

const configuredMode = import.meta.env.VITE_AUTH_MODE;
const authMode = import.meta.env.PROD ? 'cognito' : configuredMode || 'development';
const isDevelopmentAuth = authMode === 'development';

const cognitoConfig = {
  authority: import.meta.env.VITE_COGNITO_AUTHORITY,
  clientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
  domain: import.meta.env.VITE_COGNITO_DOMAIN,
  redirectUri: import.meta.env.VITE_COGNITO_REDIRECT_URI,
  postLogoutRedirectUri: import.meta.env.VITE_COGNITO_POST_LOGOUT_REDIRECT_URI,
};

const missingCognitoConfig = Object.entries(cognitoConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

const authState = reactive({
  initialized: false,
  isAuthenticated: false,
  role: null,
  userName: null,
  configurationError: null,
});

let userManager;
let initializePromise;

function getRole(profile) {
  const groups = profile?.['cognito:groups'];
  const normalizedGroups = Array.isArray(groups) ? groups : groups ? [groups] : [];

  return normalizedGroups.includes('admin') ? 'admin' : 'viewer';
}

function applyUser(user) {
  authState.isAuthenticated = Boolean(user && !user.expired);
  authState.role = authState.isAuthenticated ? getRole(user.profile) : null;
  authState.userName = authState.isAuthenticated
    ? user.profile?.name || user.profile?.email || user.profile?.preferred_username || 'NME staff'
    : null;
}

function createUserManager() {
  if (userManager) {
    return userManager;
  }

  userManager = new UserManager({
    authority: cognitoConfig.authority,
    client_id: cognitoConfig.clientId,
    redirect_uri: cognitoConfig.redirectUri,
    post_logout_redirect_uri: cognitoConfig.postLogoutRedirectUri,
    response_type: 'code',
    scope: 'openid profile email',
    metadata: {
      issuer: cognitoConfig.authority,
      authorization_endpoint: `${cognitoConfig.domain}/oauth2/authorize`,
      token_endpoint: `${cognitoConfig.domain}/oauth2/token`,
      userinfo_endpoint: `${cognitoConfig.domain}/oauth2/userInfo`,
      end_session_endpoint: `${cognitoConfig.domain}/logout`,
      jwks_uri: `${cognitoConfig.authority}/.well-known/jwks.json`,
    },
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  });

  userManager.events.addUserLoaded(applyUser);
  userManager.events.addUserUnloaded(() => applyUser(null));
  userManager.events.addAccessTokenExpired(() => applyUser(null));

  return userManager;
}

export async function initializeAuth() {
  if (initializePromise) {
    return initializePromise;
  }

  initializePromise = (async () => {
    if (isDevelopmentAuth) {
      const role = import.meta.env.VITE_DEMO_ROLE === 'viewer' ? 'viewer' : 'admin';
      authState.isAuthenticated = true;
      authState.role = role;
      authState.userName = `Development ${role}`;
      authState.initialized = true;
      return;
    }

    if (missingCognitoConfig.length) {
      authState.configurationError = `Missing Cognito settings: ${missingCognitoConfig.join(', ')}`;
      authState.initialized = true;
      return;
    }

    const manager = createUserManager();
    applyUser(await manager.getUser());
    authState.initialized = true;
  })();

  return initializePromise;
}

export async function signIn(returnTo = '/training') {
  if (isDevelopmentAuth || authState.configurationError) {
    return;
  }

  await createUserManager().signinRedirect({
    state: { returnTo },
  });
}

export async function completeSignIn() {
  if (isDevelopmentAuth) {
    return '/training';
  }

  const user = await createUserManager().signinRedirectCallback();
  applyUser(user);

  return user.state?.returnTo || '/training';
}

export async function signOut() {
  if (isDevelopmentAuth) {
    return;
  }

  await createUserManager().signoutRedirect();
}

export async function getAccessToken() {
  if (isDevelopmentAuth) {
    return null;
  }

  const user = await createUserManager().getUser();
  return user?.access_token || null;
}

export const auth = {
  state: authState,
  canManage: computed(() => authState.isAuthenticated && authState.role === 'admin'),
  isDevelopmentAuth,
};
