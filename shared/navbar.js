(function attachSharedNavbar() {
  const pageName = document.body?.dataset.page || "home";
  const mount = document.querySelector("#sharedNavbarMount");
  const scriptUrl = document.currentScript ? new URL(document.currentScript.src) : null;
  const navbarUrl = scriptUrl ? new URL("navbar.html", scriptUrl).href : "./shared/navbar.html";
  let menuEventsBound = false;
  const notificationsState = {
    supabase: null,
    userId: "",
    prefs: {
      comment_notifications: true,
      reply_notifications: true,
      rating_notifications: true
    },
    notifications: [],
    available: true,
    isOpen: false
  };
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
        closeNotificationsMenu();
        openProfileMenu();
      }
    });

    elements.navbarNotificationsBell?.addEventListener("click", async () => {
      const isOpen = !elements.navbarNotificationsDialog?.hidden;
      if (isOpen) {
        closeNotificationsMenu();
        return;
      }

      closeProfileMenu();
      openNotificationsMenu();
      await markVisibleNotificationsRead();
    });

    elements.profileMenuBackdrop?.addEventListener("click", () => {
      closeProfileMenu();
      closeNotificationsMenu();
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
        closeNotificationsMenu();
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

  function openNotificationsMenu() {
    const elements = getElements();
    if (elements.navbarNotificationsDialog) {
      elements.navbarNotificationsDialog.hidden = false;
      elements.navbarNotificationsDialog.setAttribute("aria-hidden", "false");
    }
    if (elements.profileMenuBackdrop) {
      elements.profileMenuBackdrop.hidden = false;
      elements.profileMenuBackdrop.setAttribute("aria-hidden", "false");
    }
    if (elements.navbarNotificationsBell) {
      elements.navbarNotificationsBell.setAttribute("aria-expanded", "true");
    }
    notificationsState.isOpen = true;
  }

  function closeNotificationsMenu() {
    const elements = getElements();
    if (elements.navbarNotificationsDialog) {
      elements.navbarNotificationsDialog.hidden = true;
      elements.navbarNotificationsDialog.setAttribute("aria-hidden", "true");
    }
    if (elements.navbarNotificationsBell) {
      elements.navbarNotificationsBell.setAttribute("aria-expanded", "false");
    }
    if (elements.profileMenuBackdrop && (!elements.profileMenuDialog || elements.profileMenuDialog.hidden)) {
      elements.profileMenuBackdrop.hidden = true;
      elements.profileMenuBackdrop.setAttribute("aria-hidden", "true");
    }
    notificationsState.isOpen = false;
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
      navbarNotifications: document.querySelector("#navbarNotifications"),
      navbarNotificationsBell: document.querySelector("#navbarNotificationsBell"),
      navbarNotificationsDialog: document.querySelector("#navbarNotificationsDialog"),
      navbarNotificationsUnreadDot: document.querySelector("#navbarNotificationsUnreadDot"),
      navbarNotificationsList: document.querySelector("#navbarNotificationsList"),
      navbarNotificationsEmpty: document.querySelector("#navbarNotificationsEmpty"),
      profileAvatar: document.querySelector("#profileAvatar"),
      profileDisplayName: document.querySelector("#profileDisplayName"),
      profileMeta: document.querySelector("#profileMeta"),
      profileMenuLink: document.querySelector("#profileMenuLink")
    };
  }

  function setSignedOutState(message) {
    const elements = getElements();
    closeProfileMenu();
    closeNotificationsMenu();
    resetNotificationsState();
    renderNotifications();
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

    hydrateNotifications({
      supabase: options.supabase || (typeof authConfig.getSupabaseClient === "function" ? authConfig.getSupabaseClient() : null),
      userId: cleanText(options.user?.id)
    });
  }

  function resetNotificationsState() {
    notificationsState.supabase = null;
    notificationsState.userId = "";
    notificationsState.notifications = [];
    notificationsState.available = true;
    notificationsState.isOpen = false;
    notificationsState.prefs = {
      comment_notifications: true,
      reply_notifications: true,
      rating_notifications: true
    };
  }

  function cleanText(value) {
    return String(value || "").trim();
  }

  function getPreferenceKey(eventType) {
    if (eventType === "comment") {
      return "comment_notifications";
    }

    if (eventType === "reply") {
      return "reply_notifications";
    }

    if (eventType === "rating") {
      return "rating_notifications";
    }

    return "";
  }

  function isNotificationEnabled(eventType) {
    const key = getPreferenceKey(cleanText(eventType));
    if (!key) {
      return true;
    }

    return Boolean(notificationsState.prefs[key]);
  }

  function formatNotificationDate(value) {
    const parsed = new Date(value || "");
    if (Number.isNaN(parsed.getTime())) {
      return "Just now";
    }

    return parsed.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  async function hydrateNotifications({ supabase, userId }) {
    notificationsState.supabase = supabase || null;
    notificationsState.userId = cleanText(userId);
    notificationsState.notifications = [];

    if (!notificationsState.supabase || !notificationsState.userId) {
      notificationsState.available = false;
      renderNotifications();
      return;
    }

    await loadNotificationPreferences();
    await loadNotifications();
    renderNotifications();
  }

  async function loadNotificationPreferences() {
    const { data, error } = await notificationsState.supabase
      .from("user_notification_preferences")
      .select("comment_notifications,reply_notifications,rating_notifications")
      .eq("user_id", notificationsState.userId)
      .maybeSingle();

    if (error) {
      if (error.code === "42P01" || error.code === "42501" || error.code === "PGRST205") {
        notificationsState.available = false;
        return;
      }

      console.error(error);
      notificationsState.available = false;
      return;
    }

    notificationsState.available = true;
    notificationsState.prefs = {
      comment_notifications: Boolean(data?.comment_notifications ?? true),
      reply_notifications: Boolean(data?.reply_notifications ?? true),
      rating_notifications: Boolean(data?.rating_notifications ?? true)
    };
  }

  async function loadNotifications() {
    if (!notificationsState.available) {
      notificationsState.notifications = [];
      return;
    }

    const { data, error } = await notificationsState.supabase
      .from("user_notifications")
      .select("id,event_type,message,link_url,recipe_id,created_at,read_at")
      .eq("user_id", notificationsState.userId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      if (error.code === "42P01" || error.code === "42501" || error.code === "PGRST205") {
        notificationsState.available = false;
        notificationsState.notifications = [];
        return;
      }

      console.error(error);
      notificationsState.notifications = [];
      return;
    }

    notificationsState.notifications = Array.isArray(data) ? data : [];
  }

  async function markVisibleNotificationsRead() {
    if (!notificationsState.available || !notificationsState.supabase || !notificationsState.userId) {
      return;
    }

    const unreadIds = notificationsState.notifications
      .filter((item) => !item.read_at)
      .map((item) => item.id)
      .filter(Boolean);

    if (!unreadIds.length) {
      return;
    }

    const { error } = await notificationsState.supabase
      .from("user_notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", unreadIds)
      .eq("user_id", notificationsState.userId);

    if (error) {
      if (error.code !== "42P01" && error.code !== "42501" && error.code !== "PGRST205") {
        console.error(error);
      }
      return;
    }

    notificationsState.notifications = notificationsState.notifications.map((item) => ({
      ...item,
      read_at: item.read_at || new Date().toISOString()
    }));

    renderNotifications();
  }

  function renderNotifications() {
    const elements = getElements();
    const signedIn = Boolean(elements.signedInProfile && !elements.signedInProfile.hidden);
    const shouldShow = signedIn && notificationsState.available;

    if (elements.navbarNotifications) {
      elements.navbarNotifications.hidden = !shouldShow;
    }

    if (!shouldShow) {
      return;
    }

    const unreadCount = notificationsState.notifications.filter((item) => !item.read_at).length;
    if (elements.navbarNotificationsUnreadDot) {
      elements.navbarNotificationsUnreadDot.hidden = unreadCount === 0;
    }

    if (!elements.navbarNotificationsList || !elements.navbarNotificationsEmpty) {
      return;
    }

    const filtered = notificationsState.notifications.filter((item) => isNotificationEnabled(item.event_type));
    elements.navbarNotificationsList.innerHTML = "";
    elements.navbarNotificationsEmpty.hidden = true;

    if (!filtered.length) {
      elements.navbarNotificationsEmpty.hidden = false;
      elements.navbarNotificationsEmpty.textContent = notificationsState.notifications.length
        ? "No notifications match your current toggles."
        : "No notifications yet.";
      return;
    }

    filtered.forEach((item) => {
      const li = document.createElement("li");
      li.className = `navbar-notification-item${item.read_at ? "" : " unread"}`;

      const message = document.createElement("p");
      message.className = "navbar-notification-message";
      message.textContent = cleanText(item.message) || "Notification";

      const link = document.createElement("a");
      link.className = "navbar-notification-link";
      link.href = cleanText(item.link_url) || "#";
      link.textContent = "Click here to view";
      link.addEventListener("click", () => {
        closeNotificationsMenu();
      });

      const time = document.createElement("p");
      time.className = "navbar-notification-time";
      time.textContent = formatNotificationDate(item.created_at);

      li.append(message, link, time);
      elements.navbarNotificationsList.append(li);
    });
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