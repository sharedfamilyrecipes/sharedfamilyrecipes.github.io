(function attachSharedNotifications() {
  const EVENT_TYPES = {
    COMMENT: "comment",
    REPLY: "reply",
    RATING: "rating"
  };

  const PREFERENCE_KEYS = {
    [EVENT_TYPES.COMMENT]: "comment_notifications",
    [EVENT_TYPES.REPLY]: "reply_notifications",
    [EVENT_TYPES.RATING]: "rating_notifications"
  };

  const DEFAULT_PREFERENCES = {
    comment_notifications: true,
    reply_notifications: true,
    rating_notifications: true
  };

  function cleanText(value) {
    return String(value || "").trim();
  }

  function buildRecipeHref(recipeId) {
    const safeId = cleanText(recipeId);
    if (!safeId) {
      return "";
    }

    return `../recipe/index.html?id=${encodeURIComponent(safeId)}`;
  }

  function getPreferenceKey(eventType) {
    return PREFERENCE_KEYS[cleanText(eventType)] || "";
  }

  function buildNotificationMessage({ eventType, actorDisplayName, recipeTitle }) {
    const safeActor = cleanText(actorDisplayName) || "A family member";
    const safeTitle = cleanText(recipeTitle) || "Recipe";

    if (eventType === EVENT_TYPES.REPLY) {
      return `${safeActor} has replied to your comments. ${safeTitle}.`;
    }

    if (eventType === EVENT_TYPES.RATING) {
      return "Your recipe has received a new rating.";
    }

    return `${safeActor} has commented on your recipe. ${safeTitle}.`;
  }

  function makeDefaultPreferences(overrides) {
    return {
      ...DEFAULT_PREFERENCES,
      ...(overrides || {})
    };
  }

  window.SharedNotifications = {
    EVENT_TYPES,
    DEFAULT_PREFERENCES,
    cleanText,
    buildRecipeHref,
    getPreferenceKey,
    buildNotificationMessage,
    makeDefaultPreferences
  };
})();
