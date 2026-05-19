(function attachSharedAuthUtils() {
  function forcePageReload() {
    // Try a normal reload first; if the browser ignores it, force a navigation with a cache-busting query.
    window.location.reload();

    window.setTimeout(() => {
      const url = new URL(window.location.href);
      url.searchParams.set("_refresh", String(Date.now()));
      window.location.replace(url.toString());
    }, 120);
  }

  async function signIn(options) {
    const supabase = options?.supabase || null;
    const email = String(options?.email || "").trim();
    const password = String(options?.password || "");

    if (!supabase) {
      return { ok: false, message: "Supabase is not configured.", error: null };
    }

    if (!email || !password) {
      return { ok: false, message: "Enter email and password to sign in.", error: null };
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return { ok: false, message: `Sign-in failed: ${error.message}`, error };
    }

    if (typeof options?.onSuccess === "function") {
      await options.onSuccess();
    }

    if (options?.reloadOnSuccess) {
      window.location.reload();
    }

    return { ok: true, message: "", error: null };
  }

  async function signUp(options) {
    const supabase = options?.supabase || null;
    const email = String(options?.email || "").trim();
    const password = String(options?.password || "");

    if (!supabase) {
      return { ok: false, message: "Supabase is not configured.", error: null };
    }

    if (!email || !password) {
      return { ok: false, message: "Enter email and password to create an account.", error: null };
    }

    const { error } = await supabase.auth.signUp({
      email,
      password
    });

    if (error) {
      return { ok: false, message: `Sign-up failed: ${error.message}`, error };
    }

    if (typeof options?.onSuccess === "function") {
      await options.onSuccess();
    }

    if (options?.reloadOnSuccess) {
      window.location.reload();
    }

    return { ok: true, message: "", error: null };
  }

  async function signOut(options) {
    const supabase = options?.supabase || null;
    const reloadAlways = Boolean(options?.reloadAlways);
    const reloadOnSuccess = Boolean(options?.reloadOnSuccess);

    if (!supabase) {
      if (reloadAlways) {
        forcePageReload();
      }
      return { ok: false, message: "Supabase is not configured.", error: null };
    }

    let result = { ok: true, message: "", error: null };

    try {
      // Local scope clears session immediately in the current browser context.
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) {
        result = { ok: false, message: `Sign-out failed: ${error.message}`, error };
      }
    } catch (error) {
      const message = error && error.message ? error.message : "Unexpected sign-out failure.";
      result = { ok: false, message: `Sign-out failed: ${message}`, error };
    }

    if (result.ok && typeof options?.onSuccess === "function") {
      await options.onSuccess();
    }

    if (reloadAlways || (reloadOnSuccess && result.ok)) {
      forcePageReload();
    }

    return result;
  }

  window.SharedAuthUtils = {
    signIn,
    signUp,
    signOut
  };
})();