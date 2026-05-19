const state = {
  supabase: null,
  useSupabase: false,
  session: null,
  currentProfile: null,
  canManagePermissions: false,
  editorRows: [],
  canReadUserProfiles: null,
  emailByUserId: new Map()
};

const ui = {
  authForm: null,
  authEmail: null,
  authPassword: null,
  signInBtn: null,
  signOutBtn: null,
  signUpBtn: null,
  authMessage: null,
  signedOutAuth: null,
  signedInProfile: null,
  profileAvatar: null,
  profileDisplayName: null,
  profileMeta: null,
  profileMenuLink: null,
  authStatus: document.querySelector("#authStatus"),
  adminBoard: document.querySelector("#adminBoard"),
  accessDenied: document.querySelector("#accessDenied"),
  accessDeniedDetail: document.querySelector("#accessDeniedDetail"),
  grantForm: document.querySelector("#grantForm"),
  grantUserId: document.querySelector("#grantUserId"),
  refreshUsersBtn: document.querySelector("#refreshUsersBtn"),
  boardStatus: document.querySelector("#boardStatus"),
  usersTableBody: document.querySelector("#usersTableBody")
};

init().catch((error) => {
  console.error(error);
  ui.authStatus.textContent = "Could not initialize admin page.";
});

async function init() {
  await waitForSharedNavbar();
  hydrateSharedNavbarUi();
  bindEvents();
  setupSupabaseClient();
  configureSharedNavbarAuth();

  if (!state.useSupabase) {
    ui.authStatus.textContent = "Supabase is required. Update supabase-config.js.";
    renderAccess();
    return;
  }

  await refreshSessionAndAccess();

  state.supabase.auth.onAuthStateChange(async () => {
    await refreshSessionAndAccess();
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
  ui.refreshUsersBtn.addEventListener("click", async () => {
    await loadPermissionRows();
  });
  ui.grantForm.addEventListener("submit", grantPermission);
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
      setAuthStatus(message || "Sign-out failed.");
    }
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

async function refreshSessionAndAccess() {
  updateAuthButtons();
  ui.accessDeniedDetail.textContent = "";

  const { data, error } = await state.supabase.auth.getSession();
  if (error) {
    console.error(error);
    setAuthStatus("Could not check sign-in status.");
    state.session = null;
    state.currentProfile = null;
    state.canManagePermissions = false;
    state.editorRows = [];
    renderAccess();
    return;
  }

  state.session = data.session;
  updateAuthButtons();

  if (!state.session?.user?.id) {
    state.currentProfile = null;
    state.canManagePermissions = false;
    state.editorRows = [];
    setAuthStatus("Signed out.");
    ui.accessDeniedDetail.textContent = "Sign in first.";
    renderAccess();
    return;
  }

  const email = state.session.user.email || "(no email)";
  await syncCurrentUserProfile();
  state.currentProfile = await loadCurrentUserProfile();
  updateNavbarProfile();
  setAuthStatus(`Signed in as ${email}.`);

  const { data: editorRows, error: editorError } = await state.supabase
    .from("recipe_editors")
    .select("can_add")
    .eq("user_id", state.session.user.id);

  if (editorError) {
    console.error(editorError);
    ui.boardStatus.textContent = "Could not verify admin access.";
    ui.accessDeniedDetail.textContent = `Permission lookup failed: ${editorError.message}`;
    state.canManagePermissions = false;
    state.editorRows = [];
    renderAccess();
    return;
  }

  state.canManagePermissions = Array.isArray(editorRows)
    ? editorRows.some((row) => Boolean(row.can_add))
    : false;

  if (!state.canManagePermissions) {
    ui.accessDeniedDetail.textContent =
      `No can_add=true row found for user ${state.session.user.id}. Add one in recipe_editors.`;
  }

  renderAccess();

  if (state.canManagePermissions) {
    await loadPermissionRows();
  }
}

function updateAuthButtons() {
  const signedIn = Boolean(state.session?.user);

  if (window.SharedNavbar) {
    if (signedIn) {
      updateNavbarProfile();
    } else {
      window.SharedNavbar.setSignedOutState(ui.authMessage?.textContent || "");
    }
  }

  if (ui.signOutBtn) {
    ui.signOutBtn.hidden = !signedIn;
  }
}

function renderAccess() {
  ui.adminBoard.hidden = !state.canManagePermissions;
  ui.accessDenied.hidden = state.canManagePermissions;

  if (!state.canManagePermissions) {
    ui.usersTableBody.innerHTML = "";
    ui.boardStatus.textContent = "";
  }
}

async function loadPermissionRows() {
  if (!state.canManagePermissions) {
    return;
  }

  ui.boardStatus.textContent = "Loading users...";

  const { data, error } = await state.supabase
    .from("recipe_editors")
    .select("*")
    .order("can_add", { ascending: false });

  if (error) {
    console.error(error);
    ui.boardStatus.textContent = "Could not load users. Check table permissions in Supabase.";
    state.editorRows = [];
    renderPermissionTable();
    return;
  }

  state.editorRows = (data || []).map((row) => ({
    userId: String(row.user_id || ""),
    email: cleanText(row.email || row.user_email),
    displayName: "",
    avatarKind: "initials",
    avatarIcon: "",
    avatarPath: "",
    canAdd: Boolean(row.can_add)
  }));

  const lookupMessage = await hydrateUserProfiles();

  state.editorRows = state.editorRows.map((row) => {
    const sessionMatch =
      state.session?.user?.id && row.userId === state.session.user.id && state.session.user.email;

    return {
      ...row,
      email: row.email || state.emailByUserId.get(row.userId) || (sessionMatch ? state.session.user.email : ""),
      displayName:
        row.displayName ||
        (row.userId === state.session?.user?.id
          ? window.SharedProfileUtils?.getDisplayName(state.currentProfile, state.session.user)
          : "")
    };
  });

  const unresolvedEmailCount = state.editorRows.filter((row) => !cleanText(row.email)).length;
  const showLookupMessage = unresolvedEmailCount > 0 && Boolean(lookupMessage);

  renderPermissionTable();
  ui.boardStatus.textContent = `${state.editorRows.length} user${
    state.editorRows.length === 1 ? "" : "s"
  } loaded.${showLookupMessage ? ` ${lookupMessage}` : ""}`;
}

async function hydrateUserProfiles() {
  const missingIds = state.editorRows
    .filter((row) => (!row.email || !row.displayName || row.avatarKind === "initials") && row.userId)
    .map((row) => row.userId);

  if (!missingIds.length) {
    return "";
  }

  const { rowsByUserId, lookupAvailable, message } = await lookupProfilesByUserId(missingIds);

  if (lookupAvailable === false) {
    state.canReadUserProfiles = false;
    return message || "";
  }

  if (lookupAvailable === true) {
    state.canReadUserProfiles = true;
  }

  state.editorRows = state.editorRows.map((row) => ({
    ...row,
    email: row.email || rowsByUserId.get(row.userId)?.email || "",
    displayName: row.displayName || rowsByUserId.get(row.userId)?.displayName || "",
    avatarKind: rowsByUserId.get(row.userId)?.avatarKind || row.avatarKind,
    avatarIcon: rowsByUserId.get(row.userId)?.avatarIcon || row.avatarIcon,
    avatarPath: rowsByUserId.get(row.userId)?.avatarPath || row.avatarPath
  }));

  rowsByUserId.forEach((profileRow, userId) => {
    if (profileRow.email) {
      state.emailByUserId.set(userId, profileRow.email);
    }
  });

  return "";
}

async function lookupProfilesByUserId(userIds) {
  const idList = [...new Set(userIds.filter(Boolean))];
  if (!idList.length) {
    return { rowsByUserId: new Map(), lookupAvailable: null, message: "" };
  }

  const { data, error } = await state.supabase
    .from("user_profiles")
    .select("user_id,email,display_name,avatar_kind,avatar_icon,avatar_path")
    .in("user_id", idList);

  if (error) {
    const missingTable = error.code === "42P01";
    const denied = error.code === "42501";

    if (missingTable) {
      return {
        rowsByUserId: new Map(),
        lookupAvailable: false,
        message: "Some emails unavailable (user_profiles table not found)."
      };
    }

    if (denied) {
      return {
        rowsByUserId: new Map(),
        lookupAvailable: false,
        message: "Some emails unavailable (user_profiles RLS blocks read access)."
      };
    }

    console.error(error);
    return {
      rowsByUserId: new Map(),
      lookupAvailable: false,
      message: "Some emails unavailable (profile lookup failed)."
    };
  }

  const rowsByUserId = new Map();
  (data || []).forEach((row) => {
    const userId = String(row.user_id || "");
    const email = cleanText(row.email);
    if (userId) {
      rowsByUserId.set(userId, {
        email,
        displayName: cleanText(row.display_name),
        avatarKind: cleanText(row.avatar_kind) || "initials",
        avatarIcon: cleanText(row.avatar_icon),
        avatarPath: cleanText(row.avatar_path)
      });
    }
  });

  return { rowsByUserId, lookupAvailable: true, message: "" };
}

function renderPermissionTable() {
  ui.usersTableBody.innerHTML = "";

  if (!state.editorRows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="5">No users found in recipe_editors.</td>';
    ui.usersTableBody.append(tr);
    return;
  }

  state.editorRows
    .slice()
    .sort((a, b) => a.userId.localeCompare(b.userId))
    .forEach((row) => {
      const tr = document.createElement("tr");

      const chipClass = row.canAdd ? "allowed" : "denied";
      const chipLabel = row.canAdd ? "Allowed" : "Not Allowed";
      const actionLabel = row.canAdd ? "Remove" : "Grant";
      const safeEmail = cleanText(row.email);
      const displayName =
        cleanText(row.displayName) ||
        window.SharedProfileUtils?.getDisplayName({ email: safeEmail }, null) ||
        "Unknown";
      const subtitle = safeEmail || "Unknown";
      const avatarMarkup = window.SharedProfileUtils?.renderAvatarContent
        ? window.SharedProfileUtils.renderAvatarContent(
            {
              display_name: row.displayName,
              email: safeEmail,
              avatar_kind: row.avatarKind,
              avatar_icon: row.avatarIcon,
              avatar_path: row.avatarPath
            },
            { email: safeEmail },
            state.supabase
          )
        : "<span>U</span>";

      tr.innerHTML = `
        <td><span class="profile-avatar profile-avatar-small users-avatar">${avatarMarkup}</span></td>
        <td class="user-summary"><strong>${escapeHtml(displayName)}</strong><span>${escapeHtml(subtitle)}</span></td>
        <td class="user-id">${escapeHtml(row.userId)}</td>
        <td><span class="permission-chip ${chipClass}">${chipLabel}</span></td>
        <td><button type="button" class="btn btn-ghost">${actionLabel}</button></td>
      `;

      const actionButton = tr.querySelector("button");
      actionButton.addEventListener("click", async () => {
        await setPermission(row.userId, !row.canAdd);
      });

      ui.usersTableBody.append(tr);
    });
}

async function grantPermission(event) {
  event.preventDefault();

  if (!state.canManagePermissions) {
    return;
  }

  const userId = ui.grantUserId.value.trim();
  if (!userId) {
    ui.boardStatus.textContent = "Enter a user ID or email.";
    return;
  }

  const looksLikeEmail = userId.includes("@");
  const resolvedUserId = looksLikeEmail ? await resolveUserIdFromEmail(userId) : userId;
  if (!resolvedUserId) {
    return;
  }

  await setPermission(resolvedUserId, true);
  ui.grantForm.reset();
}

async function resolveUserIdFromEmail(emailValue) {
  const email = cleanText(emailValue).toLowerCase();
  if (!email) {
    ui.boardStatus.textContent = "Enter a valid email.";
    return "";
  }

  const { data, error } = await state.supabase
    .from("user_profiles")
    .select("user_id")
    .ilike("email", email)
    .limit(1);

  if (error) {
    const missingTable = error.code === "42P01";
    const denied = error.code === "42501";

    if (missingTable || denied) {
      ui.boardStatus.textContent =
        "Cannot resolve by email right now. Use a user ID or allow read access to user_profiles.";
      return "";
    }

    console.error(error);
    ui.boardStatus.textContent = "Could not resolve email to user ID.";
    return "";
  }

  const match = Array.isArray(data) && data[0] ? String(data[0].user_id || "") : "";
  if (!match) {
    ui.boardStatus.textContent = "No user profile found for that email.";
    return "";
  }

  state.emailByUserId.set(match, email);

  return match;
}

async function setPermission(userId, canAdd) {
  if (!state.canManagePermissions) {
    return;
  }

  ui.boardStatus.textContent = canAdd ? "Granting permission..." : "Removing permission...";

  const { error } = await state.supabase
    .from("recipe_editors")
    .upsert(
      {
        user_id: userId,
        can_add: canAdd
      },
      {
        onConflict: "user_id"
      }
    );

  if (error) {
    console.error(error);
    ui.boardStatus.textContent =
      "Could not update permission. Confirm your RLS policy allows updating recipe_editors.";
    return;
  }

  await loadPermissionRows();
}

async function signIn() {
  const result = await window.SharedAuthUtils.signIn({
    supabase: state.useSupabase ? state.supabase : null,
    email: ui.authEmail.value,
    password: ui.authPassword.value,
    onSuccess: refreshSessionAndAccess
  });

  if (!result.ok) {
    if (result.error) {
      console.error(result.error);
    }
    setAuthStatus(result.message);
  }
}

async function signUp() {
  const result = await window.SharedAuthUtils.signUp({
    supabase: state.useSupabase ? state.supabase : null,
    email: ui.authEmail.value,
    password: ui.authPassword.value
  });

  if (!result.ok) {
    if (result.error) {
      console.error(result.error);
    }
    setAuthStatus(result.message);
    return;
  }

  setAuthStatus(
    "Account created. Confirm your email if prompted, then wait for an admin to grant add permission."
  );
}

async function signOut() {
  const result = await window.SharedAuthUtils.signOut({
    supabase: state.useSupabase ? state.supabase : null
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
  if (!state.useSupabase || !state.session?.user?.id) {
    return null;
  }

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
      email: state.session.user.email || ""
    };
  }

  return data || {
    user_id: state.session.user.id,
    email: state.session.user.email || ""
  };
}

function updateNavbarProfile() {
  if (!state.session?.user || !window.SharedNavbar) {
    return;
  }

  const displayName = window.SharedProfileUtils?.getDisplayName
    ? window.SharedProfileUtils.getDisplayName(state.currentProfile, state.session.user)
    : state.session.user.email || "Profile";

  window.SharedNavbar.setSignedInState({
    displayName,
    meta: state.session.user.email || "",
    profile: state.currentProfile,
    user: state.session.user,
    supabase: state.supabase,
    message: ""
  });
}

function setAuthStatus(message) {
  ui.authStatus.textContent = message;

  if (!state.session?.user && window.SharedNavbar) {
    window.SharedNavbar.setSignedOutState(message);
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cleanText(value) {
  return String(value || "").trim();
}
