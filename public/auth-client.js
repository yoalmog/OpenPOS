// Shared Supabase authentication bootstrap, token refresh & Bearer fetch interceptor
(function initOpenPosAuthNamespace(global) {
  let activeRefreshPromise = null;
  let exportListenerAttached = false;

  function resolveFilename(response, fallbackUrl) {
    const disposition = response.headers.get('content-disposition') || '';
    const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^";\n]+)"?/i);
    if (match && match[1]) {
      try {
        return decodeURIComponent(match[1].replace(/["']/g, '').trim());
      } catch (_) {
        return match[1].replace(/["']/g, '').trim();
      }
    }
    const cleanPath = String(fallbackUrl || '').split('?')[0];
    return cleanPath.split('/').pop() || 'openpos-export.csv';
  }

  function attachExportInterceptor(errorEl) {
    if (exportListenerAttached) return;
    exportListenerAttached = true;
    document.addEventListener('click', async (event) => {
      const link = event.target.closest('a[href^="/api/export/"], a[href^="/api/workforce/exports/"]');
      if (!link) return;
      event.preventDefault();
      try {
        const response = await global.fetch(link.href);
        if (!response.ok) {
          throw new Error(`Export failed (${response.status}).`);
        }
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.href = objectUrl;
        downloadLink.download = resolveFilename(response, link.href);
        document.body.appendChild(downloadLink);
        downloadLink.click();
        downloadLink.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      } catch (error) {
        if (errorEl) errorEl.textContent = error.message || 'Could not download export.';
        if (typeof global.showToast === 'function') {
          global.showToast(error.message || 'Could not download export.', 'error');
        }
      }
    });
  }

  async function refreshSupabaseSessionOnce(supabaseClient) {
    if (!supabaseClient) return null;
    if (activeRefreshPromise) return activeRefreshPromise;
    activeRefreshPromise = (async () => {
      try {
        const { data, error } = await supabaseClient.auth.refreshSession();
        if (error || !data?.session?.access_token) return null;
        return data.session;
      } catch (_) {
        return null;
      } finally {
        activeRefreshPromise = null;
      }
    })();
    return activeRefreshPromise;
  }

  function installAuthFetchInterceptor(supabaseClient, onSessionExpired) {
    if (global.__openposFetchWrapped) return;
    global.__openposFetchWrapped = true;
    const nativeFetch = global.fetch.bind(global);
    global.__openposNativeFetch = nativeFetch;

    global.fetch = async (input, init = {}) => {
      const requestUrl = typeof input === 'string' ? input : (input && input.url) || '';
      const parsedUrl = new URL(requestUrl, global.location.origin);
      const isSameOriginApi =
        parsedUrl.origin === global.location.origin &&
        parsedUrl.pathname.startsWith('/api/') &&
        parsedUrl.pathname !== '/api/auth-config';

      if (!isSameOriginApi) {
        return nativeFetch(input, init);
      }

      const buildInitWithToken = (token) => {
        const baseHeaders = init.headers || (input instanceof Request ? input.headers : undefined);
        const headers = new Headers(baseHeaders);
        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        return { ...init, headers };
      };

      const sessionResult = await supabaseClient.auth.getSession();
      let session = sessionResult?.data?.session || null;

      // Refresh proactively when within 45 seconds of token expiry.
      if (session && session.expires_at) {
        const nowSeconds = Math.floor(Date.now() / 1000);
        if (session.expires_at <= nowSeconds + 45) {
          const refreshed = await refreshSupabaseSessionOnce(supabaseClient);
          if (refreshed) session = refreshed;
        }
      }

      const firstInit = buildInitWithToken(session?.access_token);
      let response = await nativeFetch(input instanceof Request ? input.clone() : input, firstInit);

      const isKioskPinCall = parsedUrl.pathname.startsWith('/api/workforce/kiosk/');
      if (response.status === 401 && !isKioskPinCall && session) {
        const refreshed = await refreshSupabaseSessionOnce(supabaseClient);
        if (refreshed?.access_token) {
          const retryInit = buildInitWithToken(refreshed.access_token);
          response = await nativeFetch(input instanceof Request ? input.clone() : input, retryInit);
        }
        if (response.status === 401) {
          try {
            await supabaseClient.auth.signOut({ scope: 'local' });
          } catch (_) {}
          if (typeof onSessionExpired === 'function') {
            onSessionExpired('Your session has expired. Please sign in again.');
          }
        }
      }

      return response;
    };
  }

  async function initOpenPosAuth(options) {
    const {
      loginSectionId = 'openposLogin',
      appContainerSelector = '.app-container',
      formId = 'openposLoginForm',
      emailInputId = 'openposEmail',
      passwordInputId = 'openposPassword',
      submitBtnId = 'emailSignInBtn',
      googleBtnId = 'googleSignInBtn',
      errorElId = 'loginError',
      logoutBtnId = 'logoutBtn',
      userEmailLabelId = 'authUserEmail',
      scriptSrc = '/app.js',
      onAuthenticated = null,
      onSignedOut = null
    } = options || {};

    const loginSection = document.getElementById(loginSectionId);
    const appContainer = document.querySelector(appContainerSelector);
    const form = document.getElementById(formId);
    const emailInput = document.getElementById(emailInputId);
    const passwordInput = document.getElementById(passwordInputId);
    const submitBtn = document.getElementById(submitBtnId);
    const googleBtn = document.getElementById(googleBtnId);
    const errorEl = document.getElementById(errorElId);
    const logoutBtn = document.getElementById(logoutBtnId);
    const userEmailLabel = document.getElementById(userEmailLabelId);

    let scriptLoaded = false;

    function loadAppScriptOnce() {
      if (scriptLoaded || !scriptSrc) return;
      scriptLoaded = true;
      const scripts = Array.isArray(scriptSrc) ? scriptSrc : [scriptSrc];
      scripts.forEach((src) => {
        if (!src) return;
        const appScript = document.createElement('script');
        appScript.src = src;
        appScript.async = false;
        document.body.appendChild(appScript);
      });
    }

    function showLogin(message) {
      global.__openposSignedIn = false;
      global.__openposCurrentUserEmail = '';
      if (loginSection) loginSection.style.display = 'flex';
      if (appContainer) appContainer.style.display = 'none';
      if (errorEl) errorEl.textContent = message || '';
      if (typeof onSignedOut === 'function') onSignedOut();
    }

    function showApp(session) {
      global.__openposSignedIn = true;
      global.__openposCurrentUserEmail = session?.user?.email || '';
      if (userEmailLabel) {
        userEmailLabel.textContent = session?.user?.email || 'Local Preview';
      }
      if (loginSection) loginSection.style.display = 'none';
      if (appContainer) appContainer.style.display = '';
      if (errorEl) errorEl.textContent = '';
      loadAppScriptOnce();
      if (typeof onAuthenticated === 'function') onAuthenticated(session);
    }

    attachExportInterceptor(errorEl);

    try {
      const nativeFetch = global.__openposNativeFetch || global.fetch.bind(global);
      const configResponse = await nativeFetch('/api/auth-config', { cache: 'no-store' });
      const config = await configResponse.json().catch(() => ({}));
      if (!configResponse.ok) {
        throw new Error(config.error || 'Could not load authentication configuration.');
      }

      if (!config.supabaseConfigured) {
        if (config.localPreviewAllowed === true) {
          global.openposAuthRequired = false;
          if (logoutBtn) {
            logoutBtn.style.display = 'none';
          }
          showApp({ user: { email: 'local-preview@openpos.local' } });
          return { mode: 'local-preview' };
        }
        throw new Error('Supabase authentication is not configured on the server.');
      }

      if (!global.supabase || typeof global.supabase.createClient !== 'function') {
        throw new Error('Supabase client library failed to load.');
      }

      global.openposAuthRequired = true;
      const supabaseClient = global.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
      global.openposSupabase = supabaseClient;

      installAuthFetchInterceptor(supabaseClient, (expiredMessage) => {
        showLogin(expiredMessage);
      });

      global.openposSignOut = async () => {
        try {
          await supabaseClient.auth.signOut();
        } catch (_) {
          try {
            await supabaseClient.auth.signOut({ scope: 'local' });
          } catch (_) {}
        }
        showLogin('');
      };

      if (logoutBtn) {
        logoutBtn.style.display = '';
        logoutBtn.addEventListener('click', async () => {
          await global.openposSignOut();
        });
      }

      if (form) {
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          if (errorEl) errorEl.textContent = '';
          if (submitBtn) submitBtn.disabled = true;
          try {
            const { data, error } = await supabaseClient.auth.signInWithPassword({
              email: emailInput ? emailInput.value.trim() : '',
              password: passwordInput ? passwordInput.value : ''
            });
            if (error) throw error;
            if (data?.session) {
              showApp(data.session);
            }
          } catch (error) {
            if (errorEl) errorEl.textContent = error.message || 'Sign-in failed.';
          } finally {
            if (submitBtn) submitBtn.disabled = false;
          }
        });
      }

      if (googleBtn) {
        googleBtn.addEventListener('click', async () => {
          if (errorEl) errorEl.textContent = '';
          googleBtn.disabled = true;
          try {
            const { error } = await supabaseClient.auth.signInWithOAuth({
              provider: 'google',
              options: { redirectTo: global.location.origin + global.location.pathname }
            });
            if (error) throw error;
          } catch (error) {
            if (errorEl) errorEl.textContent = error.message || 'Google sign-in failed.';
            googleBtn.disabled = false;
          }
        });
      }

      supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
          showLogin('');
          return;
        }
        showApp(session);
      });

      const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
      if (sessionError) throw sessionError;
      if (sessionData?.session) {
        showApp(sessionData.session);
      } else {
        showLogin('');
      }
      return { mode: 'supabase', supabaseClient };
    } catch (error) {
      showLogin(error.message || 'Could not initialize authentication.');
      return { mode: 'error', error };
    }
  }

  global.OpenPosAuth = {
    init: initOpenPosAuth,
    refreshSessionOnce: refreshSupabaseSessionOnce
  };
})(window);
