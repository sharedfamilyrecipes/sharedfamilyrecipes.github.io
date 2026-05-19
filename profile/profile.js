const state = {
  supabase: null,
  useSupabase: false,
  session: null,
  profile: null,
  selectedAvatarKind: "initials",
  notificationPrefs: {
    comment_notifications: true,
    reply_notifications: true,
    rating_notifications: true
  },
  notificationsAvailable: true
};

const ui = {
  authForm: null,
  authEmail: null,
  authPassword: null,
  signInBtn: null,
  signUpBtn: null,
  signOutBtn: null,
  authMessage: null,
  profileAvatar: null,
  profileDisplayName: null,
  profileMeta: null,
  profileMenuLink: null,
  profileForm: document.querySelector("#profileForm"),
  passwordForm: document.querySelector("#passwordForm"),
  displayName: document.querySelector("#displayName"),
  avatarUpload: document.querySelector("#avatarUpload"),
  useInitialsBtn: document.querySelector("#useInitialsBtn"),
  profileStatus: document.querySelector("#profileStatus"),
  passwordStatus: document.querySelector("#passwordStatus"),
  profilePreviewAvatar: document.querySelector("#profilePreviewAvatar"),
  profileSummaryName: document.querySelector("#profileSummaryName"),
  profileSummaryEmail: document.querySelector("#profileSummaryEmail"),
  profileGateMessage: document.querySelector("#profileGateMessage"),
  newPassword: document.querySelector("#newPassword"),
  confirmPassword: document.querySelector("#confirmPassword"),
  notificationPrefsForm: document.querySelector("#notificationPrefsForm"),
  prefComments: document.querySelector("#prefComments"),
  prefReplies: document.querySelector("#prefReplies"),
  prefRatings: document.querySelector("#prefRatings"),
  notificationsStatus: document.querySelector("#notificationsStatus")
};

init().catch((error) => {
  console.error(error);
  ui.profileGateMessage.textContent = "Could not initialize the profile page.";
});

async function init() {
  await waitForSharedNavbar();
  hydrateSharedNavbarUi();
  bindEvents();
  setupSupabaseClient();
  configureSharedNavbarAuth();

  if (!state.useSupabase) {
    ui.profileGateMessage.textContent = "Supabase is required. Update supabase-config.js.";
    setFormsDisabled(true);
    return;
  }

  await refreshSession();
  state.supabase.auth.onAuthStateChange(async () => {
    await refreshSession();
  });
}

async function waitForSharedNavbar() {
  if (!window.SharedNavbar?.ready) {
    return;
  }

  try {
    await window.SharedNavbar.ready;
  } catch (error) {
    console.error(error);
  }
}

function hydrateSharedNavbarUi() {
  const navbarUi = window.SharedNavbar?.getElements ? window.SharedNavbar.getElements() : {};
  Object.assign(ui, navbarUi);
}

function bindEvents() {
  ui.signInBtn?.addEventListener("click", signIn);
  ui.signUpBtn?.addEventListener("click", signUp);
  ui.profileForm.addEventListener("submit", saveProfile);
  ui.passwordForm.addEventListener("submit", updatePassword);
  ui.useInitialsBtn.addEventListener("click", () => {
    state.selectedAvatarKind = "initials";
    ui.avatarUpload.value = "";
    renderProfileSummary();
  });
  ui.avatarUpload.addEventListener("change", () => {
    if (ui.avatarUpload.files?.length) {
      state.selectedAvatarKind = "upload";
      renderProfileSummary();
    }
  });

  [ui.prefComments, ui.prefReplies, ui.prefRatings].forEach((toggle) => {
    toggle?.addEventListener("change", saveNotificationPreferences);
  });
}

function setupSupabaseClient() {
  const hasSupabaseLib =
    typeof window.supabase !== "undefined" &&
    typeof window.supabase.createClient === "function";
  const url = typeof window.SUPABASE_URL === "string" ? window.SUPABASE_URL.trim() : "";
  const anonKey =
    typeof window.SUPABASE_ANON_KEY === "string" ? window.SUPABASE_ANON_KEY.trim() : "";

  if (!hasSupabaseLib || !url || !anonKey || url.includes("YOUR_") || anonKey.includes("YOUR_")) {
    state.useSupabase = false;
    return;
  }

  state.supabase = window.supabase.createClient(url, anonKey);
  state.useSupabase = true;
}

async function refreshSession() {
  const { data, error } = await state.supabase.auth.getSession();
  if (error) {
    console.error(error);
    ui.profileGateMessage.textContent = "Could not check sign-in status.";
    return;
  }

  state.session = data.session;

  if (!state.session?.user) {
    state.profile = null;
    state.notificationPrefs =
      window.SharedNotifications?.makeDefaultPreferences?.() || state.notificationPrefs;
    ui.profileGateMessage.textContent = "";
    setFormsDisabled(true);
    window.SharedNavbar?.setSignedOutState("");
    renderProfileSummary();
    renderNotificationPreferences();
    return;
  }

  setFormsDisabled(false);
  await syncCurrentUserProfile();
  state.profile = await loadCurrentUserProfile();
  state.notificationPrefs = await loadNotificationPreferences();
  state.selectedAvatarKind = state.profile?.avatar_kind === "upload" ? "upload" : "initials";
  ui.displayName.value = state.profile?.display_name || "";
  ui.profileGateMessage.textContent = "";
  updateNavbarProfile();
  renderProfileSummary();
  renderNotificationPreferences();
}

function renderProfileSummary() {
  const user = state.session?.user || null;
  const previewProfile = {
    ...(state.profile || {}),
    display_name: ui.displayName.value.trim() || state.profile?.display_name || "",
    avatar_kind: state.selectedAvatarKind,
    avatar_icon: "",
    avatar_path: state.selectedAvatarKind === "upload" ? state.profile?.avatar_path || "" : state.profile?.avatar_path || ""
  };
  const displayName = window.SharedProfileUtils.getDisplayName(previewProfile, user);

  ui.profileSummaryName.textContent = displayName;
  ui.profileSummaryEmail.textContent = user?.email || "";
  window.SharedProfileUtils.renderAvatar(ui.profilePreviewAvatar, previewProfile, user, state.supabase);
}

function setFormsDisabled(disabled) {
  ui.profileForm.querySelectorAll("input, button").forEach((element) => {
    element.disabled = disabled;
  });
  ui.passwordForm.querySelectorAll("input, button").forEach((element) => {
    element.disabled = disabled;
  });

  ui.notificationPrefsForm?.querySelectorAll("input").forEach((element) => {
    element.disabled = disabled || !state.notificationsAvailable;
  });
}

async function saveProfile(event) {
  event.preventDefault();

  if (!state.session?.user) {
    ui.profileStatus.textContent = "Sign in to save profile changes.";
    return;
  }

  ui.profileStatus.textContent = "Saving profile...";

  let avatarPath = state.profile?.avatar_path || "";
  let avatarKind = state.selectedAvatarKind;

  if (ui.avatarUpload.files?.length) {
    const uploadResult = await uploadAvatar(ui.avatarUpload.files[0]);
    if (!uploadResult.ok) {
      ui.profileStatus.textContent = uploadResult.message;
      return;
    }

    avatarPath = uploadResult.path;
    avatarKind = "upload";
  } else if (avatarKind !== "upload") {
    avatarPath = "";
  }

  const payload = {
    user_id: state.session.user.id,
    email: state.session.user.email || "",
    display_name: ui.displayName.value.trim(),
    avatar_kind: avatarKind,
    avatar_icon: "",
    avatar_path: avatarPath,
    avatar_updated_at: new Date().toISOString()
  };

  const { error } = await state.supabase.from("user_profiles").upsert(payload, {
    onConflict: "user_id"
  });

  if (error) {
    console.error(error);
    ui.profileStatus.textContent = getProfileSaveErrorMessage(error);
    return;
  }

  state.profile = await loadCurrentUserProfile();
  await syncRecipeAuthorNames();
  state.selectedAvatarKind = state.profile?.avatar_kind === "upload" ? "upload" : "initials";
  ui.avatarUpload.value = "";
  updateNavbarProfile();
  renderProfileSummary();
  ui.profileStatus.textContent = "Profile updated.";
}

async function syncRecipeAuthorNames() {
  if (!state.useSupabase || !state.session?.user?.id) {
    return;
  }

  const nextDisplayName =
    window.SharedProfileUtils?.getDisplayName?.(state.profile, state.session.user) ||
    String(state.session.user.email || "").split("@")[0] ||
    "Family";

  const { error } = await state.supabase
    .from("recipes")
    .update({ added_by: nextDisplayName })
    .eq("created_by", state.session.user.id);

  if (error) {
    console.error("Could not sync recipe author names after profile update.", error);
  }
}

async function uploadAvatar(file) {
  if (!state.supabase?.storage) {
    return { ok: false, message: "Storage is not available in the current configuration." };
  }

  if (!file.type.startsWith("image/")) {
    return { ok: false, message: "Choose an image file." };
  }

  if (file.size > 2 * 1024 * 1024) {
    return { ok: false, message: "Profile images must be 2 MB or smaller." };
  }

  const extension = file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "png";
  const filePath = `${state.session.user.id}/avatar.${extension}`;
  const { error } = await state.supabase.storage
    .from(window.SharedProfileUtils.avatarBucket)
    .upload(filePath, file, { upsert: true, cacheControl: "3600" });

  if (error) {
    console.error(error);
    return {
      ok: false,
      message: getAvatarUploadErrorMessage(error)
    };
  }

  return { ok: true, path: filePath };
}

function getAvatarUploadErrorMessage(error) {
  const message = String(error?.message || "").toLowerCase();
  const statusCode = String(error?.statusCode || "");

  if (message.includes("bucket") && message.includes("not found")) {
    return "Storage bucket profile-avatars was not found. Run the storage bucket SQL setup and try again.";
  }

  if (statusCode === "404") {
    return "Storage bucket profile-avatars was not found. Run the storage bucket SQL setup and try again.";
  }

  if (statusCode === "403" || message.includes("permission") || message.includes("policy")) {
    return "Upload was blocked by storage policies. Apply the profile avatar storage policies in Supabase and try again.";
  }

  return (
    error?.message ||
    "Could not upload avatar. Confirm the profile-avatars bucket exists and upload policies are enabled."
  );
}

async function updatePassword(event) {
  event.preventDefault();

  if (!state.session?.user) {
    ui.passwordStatus.textContent = "Sign in to change your password.";
    return;
  }

  const newPassword = ui.newPassword.value;
  const confirmPassword = ui.confirmPassword.value;

  if (!newPassword || newPassword.length < 8) {
    ui.passwordStatus.textContent = "Enter a password with at least 8 characters.";
    return;
  }

  if (newPassword !== confirmPassword) {
    ui.passwordStatus.textContent = "Passwords do not match.";
    return;
  }

  const { error } = await state.supabase.auth.updateUser({ password: newPassword });
  if (error) {
    console.error(error);
    ui.passwordStatus.textContent = `Could not change password: ${error.message}`;
    return;
  }

  ui.passwordForm.reset();
  ui.passwordStatus.textContent = "Password updated.";
}

async function signUp() {
  const result = await window.SharedAuthUtils.signUp({
    supabase: state.useSupabase ? state.supabase : null,
    email: ui.authEmail.value,
    password: ui.authPassword.value
  });

  if (!result.ok) {
    if (!state.useSupabase) {
      window.SharedNavbar?.setSignedOutState("Configure Supabase first.");
      return;
    }

    if (result.error) {
      console.error(result.error);
    }

    window.SharedNavbar?.setSignedOutState(result.message);
    return;
  }

  window.SharedNavbar?.setSignedOutState(
    "Account created. Confirm your email if prompted, then sign in to finish setting up your profile."
  );
}

async function signIn() {
  const result = await window.SharedAuthUtils.signIn({
    supabase: state.useSupabase ? state.supabase : null,
    email: ui.authEmail.value,
    password: ui.authPassword.value,
    onSuccess: refreshSession
  });

  if (!result.ok) {
    if (!state.useSupabase) {
      window.SharedNavbar?.setSignedOutState("Configure Supabase first.");
      return;
    }

    if (result.error) {
      console.error(result.error);
    }

    window.SharedNavbar?.setSignedOutState(result.message);
  }
}

async function signOut() {
  const result = await window.SharedAuthUtils.signOut({
    supabase: state.useSupabase ? state.supabase : null,
    reloadAlways: true
  });

  if (!result.ok && result.error) {
    console.error(result.error);
  }
}

async function syncCurrentUserProfile() {
  if (!state.useSupabase || !state.session?.user?.id || !state.session.user.email) {
    return;
  }

  const { error } = await state.supabase.from("user_profiles").upsert(
    {
      user_id: state.session.user.id,
      email: state.session.user.email
    },
    {
      onConflict: "user_id"
    }
  );

  if (error && error.code !== "42P01" && error.code !== "42501" && error.code !== "PGRST205") {
    console.error(error);
  }
}

async function loadCurrentUserProfile() {
  const { data, error } = await state.supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", state.session.user.id)
    .maybeSingle();

  if (error) {
    if (error.code !== "42P01" && error.code !== "42501" && error.code !== "PGRST205") {
      console.error(error);
    }

    return {
      user_id: state.session.user.id,
      email: state.session.user.email || "",
      avatar_kind: "initials"
    };
  }

  return data || {
    user_id: state.session.user.id,
    email: state.session.user.email || "",
    avatar_kind: "initials"
  };
}

function updateNavbarProfile() {
  if (!state.session?.user || !window.SharedNavbar) {
    return;
  }

  const displayName = window.SharedProfileUtils.getDisplayName(state.profile, state.session.user);
  window.SharedNavbar.setSignedInState({
    displayName,
    meta: state.session.user.email || "",
    profile: state.profile,
    user: state.session.user,
    supabase: state.supabase,
    message: ""
  });
}

async function loadNotificationPreferences() {
  const defaults = window.SharedNotifications?.makeDefaultPreferences?.() || {
    comment_notifications: true,
    reply_notifications: true,
    rating_notifications: true
  };

  if (!state.session?.user?.id) {
    return defaults;
  }

  const { data, error } = await state.supabase
    .from("user_notification_preferences")
    .select("comment_notifications,reply_notifications,rating_notifications")
    .eq("user_id", state.session.user.id)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.code === "42501" || error.code === "PGRST205") {
      state.notificationsAvailable = false;
      ui.notificationsStatus.textContent =
        "Notifications are unavailable. Run the notifications migration in Supabase.";
      return defaults;
    }

    console.error(error);
    return defaults;
  }

  state.notificationsAvailable = true;
  const resolved = {
    ...defaults,
    ...(data || {})
  };

  await state.supabase.from("user_notification_preferences").upsert(
    {
      user_id: state.session.user.id,
      ...resolved,
      updated_at: new Date().toISOString()
    },
    {
      onConflict: "user_id"
    }
  );

  return resolved;
}

function renderNotificationPreferences() {
  ui.prefComments.checked = Boolean(state.notificationPrefs.comment_notifications);
  ui.prefReplies.checked = Boolean(state.notificationPrefs.reply_notifications);
  ui.prefRatings.checked = Boolean(state.notificationPrefs.rating_notifications);
  ui.notificationsStatus.textContent = state.notificationsAvailable
    ? ""
    : "Notifications are unavailable right now.";
}

async function saveNotificationPreferences() {
  if (!state.session?.user?.id || !state.notificationsAvailable) {
    return;
  }

  state.notificationPrefs = {
    comment_notifications: Boolean(ui.prefComments.checked),
    reply_notifications: Boolean(ui.prefReplies.checked),
    rating_notifications: Boolean(ui.prefRatings.checked)
  };

  ui.notificationsStatus.textContent = "Saving notification preferences...";

  const { error } = await state.supabase.from("user_notification_preferences").upsert(
    {
      user_id: state.session.user.id,
      ...state.notificationPrefs,
      updated_at: new Date().toISOString()
    },
    {
      onConflict: "user_id"
    }
  );

  if (error) {
    console.error(error);
    ui.notificationsStatus.textContent = "Could not save notification preferences.";
    return;
  }

  ui.notificationsStatus.textContent = "Notification preferences updated.";
}

function getProfileSaveErrorMessage(error) {
  const message = String(error?.message || "");

  if (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    message.includes("schema cache") ||
    message.includes("public.user_profiles")
  ) {
    return "Profile table is missing in Supabase. Run the migration 20260519_add_profile_fields.sql, then refresh this page.";
  }

  if (error.code === "PGRST204" || error.message?.includes("display_name")) {
    return "Profile columns are not available yet. Run the migration before saving display names or avatars.";
  }

  if (error.code === "42501") {
    return "Profile save was blocked by RLS. Apply the migration policies before saving changes.";
  }

  return `Could not save profile: ${error.message}`;
}

function configureSharedNavbarAuth() {
  if (!window.SharedNavbar?.setAuthConfig) {
    return;
  }

  window.SharedNavbar.setAuthConfig({
    getSupabaseClient: () => (state.useSupabase ? state.supabase : null),
    onSignOutError: (message, error) => {
      if (error) {
        console.error(error);
      }
      window.SharedNavbar?.setSignedOutState(message || "Sign-out failed.");
    }
  });
}