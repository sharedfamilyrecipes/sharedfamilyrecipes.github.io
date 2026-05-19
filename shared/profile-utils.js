(function attachSharedProfileUtils() {
  const AVATAR_BUCKET = "profile-avatars";

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getDisplayName(profile, user) {
    const explicitName = String(profile?.display_name || "").trim();
    if (explicitName) {
      return explicitName;
    }

    const email = String(profile?.email || user?.email || "").trim();
    if (email) {
      return email.split("@")[0];
    }

    return "Profile";
  }

  function getInitials(value) {
    const parts = String(value || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);

    if (!parts.length) {
      return "U";
    }

    return parts.map((part) => part[0]).join("").toUpperCase();
  }

  function getAvatarUrl(profile, supabase) {
    if (!profile || profile.avatar_kind !== "upload" || !profile.avatar_path || !supabase?.storage) {
      return "";
    }

    const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(profile.avatar_path);
    return String(data?.publicUrl || "");
  }

  function renderAvatarContent(profile, user, supabase) {
    const uploadUrl = getAvatarUrl(profile, supabase);
    if (uploadUrl) {
      return `<img src="${escapeHtml(uploadUrl)}" alt="" />`;
    }

    return `<span>${escapeHtml(getInitials(getDisplayName(profile, user)))}</span>`;
  }

  function renderAvatar(element, profile, user, supabase) {
    if (!element) {
      return;
    }

    element.innerHTML = renderAvatarContent(profile, user, supabase);
    element.setAttribute("data-avatar-kind", profile?.avatar_kind || "initials");
  }

  window.SharedProfileUtils = {
    avatarBucket: AVATAR_BUCKET,
    escapeHtml,
    getDisplayName,
    getInitials,
    getAvatarUrl,
    renderAvatarContent,
    renderAvatar
  };
})();