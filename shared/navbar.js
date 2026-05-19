(function attachSharedNavbar() {
  const pageName = document.body?.dataset.page || "home";
  const mount = document.querySelector("#sharedNavbarMount");
  const scriptUrl = document.currentScript ? new URL(document.currentScript.src) : null;
  const navbarUrl = scriptUrl ? new URL("navbar.html", scriptUrl).href : "./shared/navbar.html";
  let menuEventsBound = false;
  const authConfig = {
    getSupabaseClient: null,
    onSignOutError: null
  };

  async function loadNavbar() {
    if (!mount) {
      return null;
    }

    const response = await fetch(navbarUrl);
    if (!response.ok) {
      throw new Error(`Could not load shared navbar: ${response.status}`);
    }

    mount.innerHTML = await response.text();
    normalizeLinks();
    bindMenuEvents();
    setActiveLink(pageName);
    return getElements();
  }

  function normalizeLinks() {
    const isNestedPage = pageName === "admin" || pageName === "profile" || pageName === "recipe";
    const homeLink = mount.querySelector("[data-home-link]");
    const profileMenuLink = mount.querySelector("#profileMenuLink");

    if (homeLink) {
      homeLink.setAttribute("href", isNestedPage ? "../index.html" : "./index.html");
    }

    if (profileMenuLink) {
      profileMenuLink.setAttribute("href", isNestedPage ? "../profile/index.html" : "./profile/index.html");
    }
  }

  function setActiveLink() {}

  function bindMenuEvents() {
    if (menuEventsBound) {
      return;
    }

    const elements = getElements();

    elements.profileMenuTrigger?.addEventListener("click", () => {
      const isOpen = !elements.profileMenuDialog?.hidden;
      if (isOpen) {
        closeProfileMenu();
      } else {
        openProfileMenu();
      }
    });

    elements.profileMenuBackdrop?.addEventListener("click", () => {
      closeProfileMenu();
    });

    elements.profileMenuLink?.addEventListener("click", () => {
      closeProfileMenu();
    });

    elements.signOutBtn?.addEventListener("click", async () => {
      closeProfileMenu();
      await handleSharedSignOut();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeProfileMenu();
      }
    });

    menuEventsBound = true;
  }

  async function handleSharedSignOut() {
    if (!window.SharedAuthUtils?.signOut) {
      navigateToHomeAfterSignOut();
      return;
    }

    const supabase = typeof authConfig.getSupabaseClient === "function" ? authConfig.getSupabaseClient() : null;
    let result = { ok: true, message: "", error: null };

    try {
      const signOutPromise = window.SharedAuthUtils.signOut({
        supabase,
        reloadAlways: false
      });
      const timeoutPromise = new Promise((resolve) => {
        window.setTimeout(() => {
          resolve({ ok: false, message: "Sign-out timed out.", error: null });
        }, 900);
      });

      result = await Promise.race([signOutPromise, timeoutPromise]);
    } finally {
      navigateToHomeAfterSignOut();
    }

    if (!result.ok && typeof authConfig.onSignOutError === "function") {
      authConfig.onSignOutError(result.message, result.error);
    }
  }

  function navigateToHomeAfterSignOut() {
    const target = new URL("/index.html", window.location.origin);
    target.searchParams.set("signedOut", "1");
    target.searchParams.set("_refresh", String(Date.now()));
    window.location.replace(target.toString());
  }

  function openProfileMenu() {
    const elements = getElements();
    if (elements.profileMenuDialog) {
      elements.profileMenuDialog.hidden = false;
      elements.profileMenuDialog.setAttribute("aria-hidden", "false");
    }
    if (elements.profileMenuBackdrop) {
      elements.profileMenuBackdrop.hidden = false;
      elements.profileMenuBackdrop.setAttribute("aria-hidden", "false");
    }
    if (elements.profileMenuTrigger) {
      elements.profileMenuTrigger.setAttribute("aria-expanded", "true");
    }
  }

  function closeProfileMenu() {
    const elements = getElements();
    if (elements.profileMenuDialog) {
      elements.profileMenuDialog.hidden = true;
      elements.profileMenuDialog.setAttribute("aria-hidden", "true");
    }
    if (elements.profileMenuBackdrop) {
      elements.profileMenuBackdrop.hidden = true;
      elements.profileMenuBackdrop.setAttribute("aria-hidden", "true");
    }
    if (elements.profileMenuTrigger) {
      elements.profileMenuTrigger.setAttribute("aria-expanded", "false");
    }
  }

  function getElements() {
    return {
      authForm: document.querySelector("#authForm"),
      authEmail: document.querySelector("#authEmail"),
      authPassword: document.querySelector("#authPassword"),
      authMessage: document.querySelector("#authMessage"),
      signInBtn: document.querySelector("#signInBtn"),
      signUpBtn: document.querySelector("#signUpBtn"),
      signOutBtn: document.querySelector("#signOutBtn"),
      signedOutAuth: document.querySelector("#signedOutAuth"),
      signedInProfile: document.querySelector("#signedInProfile"),
      profileMenuTrigger: document.querySelector("#profileMenuTrigger"),
      profileMenuDialog: document.querySelector("#profileMenuDialog"),
      profileMenuBackdrop: document.querySelector("#profileMenuBackdrop"),
      profileAvatar: document.querySelector("#profileAvatar"),
      profileDisplayName: document.querySelector("#profileDisplayName"),
      profileMeta: document.querySelector("#profileMeta"),
      profileMenuLink: document.querySelector("#profileMenuLink")
    };
  }

  function setSignedOutState(message) {
    const elements = getElements();
    closeProfileMenu();
    if (elements.authForm) {
      elements.authForm.classList.add("signed-out");
      elements.authForm.classList.remove("signed-in");
    }
    if (elements.signedOutAuth) {
      elements.signedOutAuth.hidden = false;
    }
    if (elements.signedInProfile) {
      elements.signedInProfile.hidden = true;
      elements.signedInProfile.setAttribute("aria-hidden", "true");
    }
    if (elements.signOutBtn) {
      elements.signOutBtn.hidden = true;
    }
    if (elements.authMessage) {
      elements.authMessage.textContent = message || "";
    }
  }

  function setSignedInState(options) {
    const elements = getElements();
    if (elements.authForm) {
      elements.authForm.classList.add("signed-in");
      elements.authForm.classList.remove("signed-out");
    }
    if (elements.signedOutAuth) {
      elements.signedOutAuth.hidden = true;
    }
    if (elements.signedInProfile) {
      elements.signedInProfile.hidden = false;
      elements.signedInProfile.setAttribute("aria-hidden", "false");
    }
    if (elements.signOutBtn) {
      elements.signOutBtn.hidden = false;
    }
    if (elements.profileMenuDialog) {
      elements.profileMenuDialog.hidden = true;
      elements.profileMenuDialog.setAttribute("aria-hidden", "true");
    }
    if (elements.profileMenuBackdrop) {
      elements.profileMenuBackdrop.hidden = true;
      elements.profileMenuBackdrop.setAttribute("aria-hidden", "true");
    }
    if (elements.profileMenuTrigger) {
      elements.profileMenuTrigger.setAttribute("aria-expanded", "false");
    }
    if (elements.profileDisplayName) {
      elements.profileDisplayName.textContent = options.displayName || "Profile";
    }
    if (elements.profileMeta) {
      elements.profileMeta.textContent = options.meta || "";
    }
    if (elements.authMessage) {
      elements.authMessage.textContent = options.message || "";
    }
    if (window.SharedProfileUtils?.renderAvatar) {
      window.SharedProfileUtils.renderAvatar(elements.profileAvatar, options.profile, options.user, options.supabase);
    }
  }

  window.SharedNavbar = {
    ready: loadNavbar(),
    getElements,
    setActiveLink,
    setSignedOutState,
    setSignedInState,
    setAuthConfig(config) {
      if (!config || typeof config !== "object") {
        return;
      }

      if (typeof config.getSupabaseClient === "function") {
        authConfig.getSupabaseClient = config.getSupabaseClient;
      }

      if (typeof config.onSignOutError === "function") {
        authConfig.onSignOutError = config.onSignOutError;
      }
    }
  };
})();