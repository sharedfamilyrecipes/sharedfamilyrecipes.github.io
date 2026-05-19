const state = {
  supabase: null,
  useSupabase: false,
  session: null,
  currentProfile: null,
  canModerateComments: false,
  activeReplyParentId: "",
  recipe: null,
  ratingAverage: 0,
  ratingCount: 0,
  userRating: 0,
  comments: [],
  commentsAvailable: true
};

const ui = {
  authForm: null,
  authEmail: null,
  authPassword: null,
  signInBtn: null,
  signUpBtn: null,
  signOutBtn: null,
  authMessage: null,
  recipePanel: document.querySelector("#recipePanel"),
  recipeStatus: document.querySelector("#recipeStatus"),
  recipeMealType: document.querySelector("#recipeMealType"),
  recipeTitle: document.querySelector("#recipeTitle"),
  recipeAuthorAvatar: document.querySelector("#recipeAuthorAvatar"),
  recipeByline: document.querySelector("#recipeByline"),
  recipeDescription: document.querySelector("#recipeDescription"),
  recipeTags: document.querySelector("#recipeTags"),
  ingredientsList: document.querySelector("#ingredientsList"),
  stepsList: document.querySelector("#stepsList"),
  ratingSummary: document.querySelector("#ratingSummary"),
  ratingMeta: document.querySelector("#ratingMeta"),
  ratingInput: document.querySelector("#ratingInput"),
  commentsMeta: document.querySelector("#commentsMeta"),
  commentsEmpty: document.querySelector("#commentsEmpty"),
  commentsList: document.querySelector("#commentsList"),
  commentForm: document.querySelector("#commentForm"),
  commentInput: document.querySelector("#commentInput"),
  commentSubmit: document.querySelector("#commentSubmit"),
  commentsStatus: document.querySelector("#commentsStatus"),
  copyRecipeLink: document.querySelector("#copyRecipeLink")
};

init().catch((error) => {
  console.error(error);
  ui.recipeStatus.textContent = "Could not initialize recipe page.";
});

async function init() {
  await waitForSharedNavbar();
  hydrateSharedNavbarUi();
  bindEvents();
  setupSupabaseClient();
  configureSharedNavbarAuth();

  if (!state.useSupabase) {
    ui.recipeStatus.textContent = "Recipe services are currently unavailable.";
    ui.copyRecipeLink.disabled = true;
    return;
  }

  const recipeId = getRecipeIdFromUrl();
  if (!recipeId) {
    ui.recipeStatus.textContent = "Recipe link is missing an id.";
    ui.copyRecipeLink.disabled = true;
    return;
  }

  await refreshSession();
  await loadRecipe(recipeId);

  state.supabase.auth.onAuthStateChange(async () => {
    await refreshSession();
    if (state.recipe?.id) {
      await Promise.all([hydrateRecipeRatings(state.recipe.id), hydrateRecipeComments(state.recipe.id)]);
      renderRatingBlock();
      renderCommentsBlock();
    }
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
  ui.copyRecipeLink.addEventListener("click", copyRecipeLink);
  ui.commentForm?.addEventListener("submit", handleCommentSubmit);
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
      ui.recipeStatus.textContent = message || "Sign-out failed.";
    }
  });
}

function getRecipeIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return String(params.get("id") || "").trim();
}

async function refreshSession() {
  const { data, error } = await state.supabase.auth.getSession();
  if (error) {
    console.error(error);
    ui.recipeStatus.textContent = "Could not check sign-in status.";
    return;
  }

  state.session = data.session;

  if (!state.session?.user) {
    state.currentProfile = null;
    state.canModerateComments = false;
    window.SharedNavbar?.setSignedOutState("");
    renderCommentsBlock();
    return;
  }

  await syncCurrentUserProfile();
  state.currentProfile = await loadCurrentUserProfile();
  await hydrateCommentModerationPermission();
  updateNavbarProfile();
  renderCommentsBlock();
}

async function hydrateCommentModerationPermission() {
  if (!state.session?.user?.id) {
    state.canModerateComments = false;
    return;
  }

  const { data, error } = await state.supabase
    .from("recipe_editors")
    .select("can_add")
    .eq("user_id", state.session.user.id);

  if (error) {
    if (error.code !== "42P01" && error.code !== "42501" && error.code !== "PGRST205") {
      console.error(error);
    }
    state.canModerateComments = false;
    return;
  }

  state.canModerateComments = Array.isArray(data)
    ? data.some((row) => Boolean(row.can_add))
    : false;
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

async function loadRecipe(recipeId) {
  ui.recipeStatus.textContent = "Loading recipe...";

  const { data, error } = await state.supabase
    .from("recipes")
    .select(
      "id,title,added_by,description,meal_type,ingredient_tags,allergy_tags,audience_tags,ingredients,steps,created_by"
    )
    .eq("id", recipeId)
    .maybeSingle();

  if (error) {
    console.error(error);
    ui.recipeStatus.textContent = "Could not load this recipe.";
    return;
  }

  if (!data) {
    ui.recipeStatus.textContent = "Recipe not found.";
    return;
  }

  const recipe = normalizeRecipe(data);
  recipe.authorProfile = await hydrateRecipeAuthorProfile(recipe);
  recipe.addedBy = window.SharedProfileUtils?.getDisplayName
    ? window.SharedProfileUtils.getDisplayName(recipe.authorProfile, null)
    : recipe.addedBy;

  state.recipe = recipe;
  await hydrateRecipeRatings(recipe.id);
  await hydrateRecipeComments(recipe.id);
  renderRecipe();
  ui.recipePanel.hidden = false;
  ui.recipeStatus.textContent = "";
}

async function hydrateRecipeAuthorProfile(recipe) {
  if (!recipe.createdByUserId) {
    return {
      display_name: recipe.addedBy,
      avatar_kind: "initials",
      avatar_path: "",
      avatar_icon: ""
    };
  }

  const { data, error } = await state.supabase
    .from("user_profiles")
    .select("display_name,email,avatar_kind,avatar_path,avatar_icon")
    .eq("user_id", recipe.createdByUserId)
    .maybeSingle();

  if (error) {
    if (error.code !== "42P01" && error.code !== "42501" && error.code !== "PGRST205") {
      console.error(error);
    }
    return {
      display_name: recipe.addedBy,
      avatar_kind: "initials",
      avatar_path: "",
      avatar_icon: ""
    };
  }

  const displayName = cleanText(data?.display_name);
  const emailFallback = cleanText(data?.email).split("@")[0] || "";

  return {
    display_name: displayName || emailFallback || recipe.addedBy,
    email: cleanText(data?.email),
    avatar_kind: cleanText(data?.avatar_kind),
    avatar_path: cleanText(data?.avatar_path),
    avatar_icon: cleanText(data?.avatar_icon)
  };
}

function renderRecipe() {
  if (!state.recipe) {
    return;
  }

  document.title = `${state.recipe.title} | Shared Family Recipes`;
  ui.recipeMealType.textContent = state.recipe.mealType;
  ui.recipeTitle.textContent = state.recipe.title;
  ui.recipeByline.textContent = state.recipe.addedBy;
  if (window.SharedProfileUtils?.renderAvatar && ui.recipeAuthorAvatar) {
    window.SharedProfileUtils.renderAvatar(
      ui.recipeAuthorAvatar,
      state.recipe.authorProfile || { display_name: state.recipe.addedBy, avatar_kind: "initials" },
      null,
      state.supabase
    );
  }
  ui.recipeDescription.textContent = state.recipe.description;

  ui.recipeTags.innerHTML = "";
  [
    state.recipe.mealType,
    ...state.recipe.ingredientTags,
    ...state.recipe.allergyTags,
    ...state.recipe.audienceTags
  ]
    .filter(Boolean)
    .forEach((tag) => {
      const span = document.createElement("span");
      span.className = "tag";
      span.textContent = tag;
      ui.recipeTags.append(span);
    });

  ui.ingredientsList.innerHTML = "";
  state.recipe.ingredients.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    ui.ingredientsList.append(li);
  });

  ui.stepsList.innerHTML = "";
  state.recipe.steps.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    ui.stepsList.append(li);
  });

  renderRatingBlock();
  renderCommentsBlock();
}

async function hydrateRecipeComments(recipeId) {
  state.comments = [];
  state.commentsAvailable = true;

  const { data: commentRows, error: commentError } = await state.supabase
    .from("recipe_comments")
    .select("id,recipe_id,user_id,parent_comment_id,content,created_at")
    .eq("recipe_id", recipeId)
    .order("created_at", { ascending: true });

  if (commentError) {
    if (commentError.code === "42P01" || commentError.code === "PGRST205") {
      state.commentsAvailable = false;
      return;
    }

    console.error(commentError);
    return;
  }

  const userIds = [...new Set((commentRows || []).map((row) => cleanText(row.user_id)).filter(Boolean))];
  const profileByUserId = new Map();

  if (userIds.length) {
    const { data: profileRows, error: profileError } = await state.supabase
      .from("user_profiles")
      .select("user_id,display_name,email,avatar_kind,avatar_path,avatar_icon")
      .in("user_id", userIds);

    if (!profileError) {
      (profileRows || []).forEach((row) => {
        const userId = cleanText(row.user_id);
        if (!userId) {
          return;
        }

        profileByUserId.set(userId, {
          display_name: cleanText(row.display_name),
          email: cleanText(row.email),
          avatar_kind: cleanText(row.avatar_kind),
          avatar_path: cleanText(row.avatar_path),
          avatar_icon: cleanText(row.avatar_icon)
        });
      });
    } else if (profileError.code !== "42P01" && profileError.code !== "42501" && profileError.code !== "PGRST205") {
      console.error(profileError);
    }
  }

  state.comments = (commentRows || [])
    .map((row) => {
      const userId = cleanText(row.user_id);
      const fallbackName = userId ? "Family member" : "Guest";
      const profile = profileByUserId.get(userId) || {
        display_name: fallbackName,
        avatar_kind: "initials",
        avatar_path: "",
        avatar_icon: ""
      };

      const displayName = window.SharedProfileUtils?.getDisplayName
        ? window.SharedProfileUtils.getDisplayName(profile, null)
        : cleanText(profile.display_name) || fallbackName;

      return {
        id: cleanText(row.id),
        recipeId: cleanText(row.recipe_id),
        userId,
        parentCommentId: cleanText(row.parent_comment_id),
        content: cleanText(row.content),
        createdAt: row.created_at || null,
        authorProfile: profile,
        authorName: displayName || fallbackName
      };
    })
    .filter((comment) => comment.id && comment.recipeId && comment.content);
}

async function hydrateRecipeRatings(recipeId) {
  state.ratingAverage = 0;
  state.ratingCount = 0;
  state.userRating = 0;

  const { data: allRatings, error: allRatingsError } = await state.supabase
    .from("recipe_ratings")
    .select("rating")
    .eq("recipe_id", recipeId);

  if (allRatingsError) {
    console.error(allRatingsError);
    return;
  }

  let sum = 0;
  let count = 0;
  allRatings.forEach((row) => {
    const value = Number(row.rating || 0);
    if (!Number.isFinite(value) || value < 1 || value > 5) {
      return;
    }

    sum += value;
    count += 1;
  });

  state.ratingCount = count;
  state.ratingAverage = count ? sum / count : 0;

  if (!state.session?.user?.id) {
    return;
  }

  const { data: myRating, error: myRatingError } = await state.supabase
    .from("recipe_ratings")
    .select("rating")
    .eq("recipe_id", recipeId)
    .eq("user_id", state.session.user.id)
    .maybeSingle();

  if (myRatingError) {
    console.error(myRatingError);
    return;
  }

  state.userRating = Number(myRating?.rating || 0);
}

function renderRatingBlock() {
  const ratingDisplay = Number.isInteger(state.ratingAverage)
    ? String(state.ratingAverage)
    : state.ratingAverage.toFixed(1);

  ui.ratingSummary.textContent = `${renderStars(state.ratingAverage)} ${ratingDisplay}/5`;
  ui.ratingMeta.textContent =
    state.ratingCount > 0
      ? `${state.ratingCount} rating${state.ratingCount === 1 ? "" : "s"}`
      : "No ratings yet";

  ui.ratingInput.innerHTML = "";
  for (let score = 1; score <= 5; score += 1) {
    const starButton = document.createElement("button");
    starButton.type = "button";
    starButton.className = "star-btn";
    starButton.textContent = "★";
    starButton.setAttribute("aria-label", `Rate ${state.recipe?.title || "recipe"} ${score} stars`);

    if (state.userRating >= score) {
      starButton.classList.add("active");
    }

    if (!state.session?.user?.id) {
      starButton.disabled = true;
      starButton.title = "Sign in to rate recipes";
    }

    starButton.addEventListener("click", async () => {
      await submitRecipeRating(score);
    });

    ui.ratingInput.append(starButton);
  }
}

function renderCommentsBlock() {
  if (!ui.commentsList || !ui.commentsMeta || !ui.commentsEmpty || !ui.commentInput || !ui.commentSubmit) {
    return;
  }

  const signedIn = Boolean(state.session?.user?.id);

  if (!state.commentsAvailable) {
    ui.commentsMeta.textContent = "Comments unavailable";
    ui.commentsList.innerHTML = "";
    ui.commentsEmpty.hidden = false;
    ui.commentsEmpty.textContent = "Comments are not available right now.";
    ui.commentInput.value = "";
    ui.commentInput.disabled = true;
    ui.commentSubmit.disabled = true;
    ui.commentsStatus.textContent = "";
    return;
  }

  const total = state.comments.length;
  ui.commentsMeta.textContent = total === 1 ? "1 comment" : `${total} comments`;
  ui.commentsEmpty.hidden = total > 0;
  if (total === 0) {
    ui.commentsEmpty.textContent = "No comments yet. Be the first one.";
  }

  ui.commentInput.disabled = !signedIn;
  ui.commentSubmit.disabled = !signedIn;
  if (!signedIn) {
    ui.commentsStatus.textContent = "Sign in to add a comment.";
  } else if (ui.commentsStatus.textContent === "Sign in to add a comment.") {
    ui.commentsStatus.textContent = "";
  }

  const commentsByParentId = new Map();
  state.comments.forEach((comment) => {
    const key = comment.parentCommentId || "";
    if (!commentsByParentId.has(key)) {
      commentsByParentId.set(key, []);
    }
    commentsByParentId.get(key).push(comment);
  });

  commentsByParentId.forEach((items) => {
    items.sort((a, b) => {
      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();
      return aTime - bTime;
    });
  });

  ui.commentsList.innerHTML = "";
  (commentsByParentId.get("") || []).forEach((comment) => {
    ui.commentsList.append(renderCommentNode(comment, commentsByParentId, signedIn, 0));
  });
}

function renderCommentNode(comment, commentsByParentId, signedIn, depth) {
  const item = document.createElement("li");
  item.className = "comment-item";
  if (depth > 0) {
    item.classList.add("comment-reply-item");
  }

  const head = document.createElement("div");
  head.className = "comment-item-head";

  const avatar = document.createElement("span");
  avatar.className = "profile-avatar comment-author-avatar";
  if (window.SharedProfileUtils?.renderAvatar) {
    window.SharedProfileUtils.renderAvatar(avatar, comment.authorProfile, null, state.supabase);
  }

  const meta = document.createElement("div");
  meta.className = "comment-meta";

  const author = document.createElement("p");
  author.className = "comment-author";
  author.textContent = comment.authorName || "Family member";

  const time = document.createElement("p");
  time.className = "comment-time";
  time.textContent = formatCommentDate(comment.createdAt);

  meta.append(author, time);
  head.append(avatar, meta);

  const actions = document.createElement("div");
  actions.className = "comment-actions";

  if (signedIn) {
    const replyBtn = document.createElement("button");
    replyBtn.type = "button";
    replyBtn.className = "comment-action";
    const isReplyOpen = state.activeReplyParentId === comment.id;
    replyBtn.textContent = isReplyOpen ? "Cancel" : "Reply";
    replyBtn.addEventListener("click", () => {
      state.activeReplyParentId = isReplyOpen ? "" : comment.id;
      renderCommentsBlock();
    });
    actions.append(replyBtn);
  }

  const canDelete =
    signedIn &&
    Boolean(comment.userId) &&
    (comment.userId === state.session.user.id || state.canModerateComments);

  if (canDelete) {
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "comment-delete";
    deleteBtn.textContent = "Delete";
    deleteBtn.setAttribute("aria-label", `Delete comment by ${comment.authorName}`);
    deleteBtn.addEventListener("click", async () => {
      await deleteRecipeComment(comment.id);
    });
    actions.append(deleteBtn);
  }

  if (actions.children.length) {
    head.append(actions);
  }

  const body = document.createElement("p");
  body.className = "comment-content";
  body.textContent = comment.content;

  item.append(head, body);

  if (signedIn && state.activeReplyParentId === comment.id) {
    item.append(createReplyForm(comment));
  }

  const children = commentsByParentId.get(comment.id) || [];
  if (children.length) {
    const childList = document.createElement("ul");
    childList.className = "comment-children";
    children.forEach((child) => {
      childList.append(renderCommentNode(child, commentsByParentId, signedIn, depth + 1));
    });
    item.append(childList);
  }

  return item;
}

function createReplyForm(comment) {
  const form = document.createElement("form");
  form.className = "reply-form";

  const input = document.createElement("textarea");
  input.rows = 3;
  input.maxLength = 1200;
  input.placeholder = `Reply to ${comment.authorName || "comment"}...`;
  input.required = true;

  const actions = document.createElement("div");
  actions.className = "reply-form-actions";

  const submitBtn = document.createElement("button");
  submitBtn.type = "submit";
  submitBtn.className = "btn btn-secondary";
  submitBtn.textContent = "Post Reply";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn btn-ghost";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", () => {
    state.activeReplyParentId = "";
    renderCommentsBlock();
  });

  actions.append(submitBtn, cancelBtn);
  form.append(input, actions);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitRecipeComment({
      content: input.value,
      parentCommentId: comment.id,
      onStart: () => {
        submitBtn.disabled = true;
        cancelBtn.disabled = true;
        ui.commentsStatus.textContent = "Posting reply...";
      },
      onDone: () => {
        submitBtn.disabled = false;
        cancelBtn.disabled = false;
      }
    });
  });

  return form;
}

function formatCommentDate(value) {
  if (!value) {
    return "Just now";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Just now";
  }

  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

async function handleCommentSubmit(event) {
  event.preventDefault();

  await submitRecipeComment({
    content: ui.commentInput.value,
    parentCommentId: "",
    onStart: () => {
      ui.commentSubmit.disabled = true;
      ui.commentsStatus.textContent = "Posting comment...";
    },
    onDone: () => {
      ui.commentSubmit.disabled = false;
    }
  });
}

async function submitRecipeComment(options) {
  const content = cleanText(options?.content || "").slice(0, 1200);
  const parentCommentId = cleanText(options?.parentCommentId || "");
  const parentComment = parentCommentId
    ? state.comments.find((comment) => comment.id === parentCommentId) || null
    : null;
  const onStart = typeof options?.onStart === "function" ? options.onStart : () => {};
  const onDone = typeof options?.onDone === "function" ? options.onDone : () => {};

  if (!state.commentsAvailable) {
    ui.commentsStatus.textContent = "Comments are not available right now.";
    return;
  }

  if (!state.session?.user?.id || !state.recipe?.id) {
    ui.commentsStatus.textContent = "Sign in to add a comment.";
    return;
  }

  if (!content) {
    ui.commentsStatus.textContent = parentCommentId ? "Write a reply first." : "Write a comment first.";
    return;
  }

  onStart();

  const { error } = await state.supabase.from("recipe_comments").insert({
    recipe_id: state.recipe.id,
    user_id: state.session.user.id,
    parent_comment_id: parentCommentId || null,
    content
  });

  if (error) {
    console.error(error);
    ui.commentsStatus.textContent = parentCommentId
      ? "Could not post reply. Please try again."
      : "Could not post comment. Please try again.";
    onDone();
    return;
  }

  if (!parentCommentId) {
    ui.commentInput.value = "";
  }

  await notifyCommentEvent({
    parentCommentId,
    parentComment
  });

  state.activeReplyParentId = "";
  ui.commentsStatus.textContent = parentCommentId ? "Reply posted." : "Comment posted.";
  await hydrateRecipeComments(state.recipe.id);
  renderCommentsBlock();
  onDone();
}

async function deleteRecipeComment(commentId) {
  if (!state.session?.user?.id || !state.recipe?.id || !commentId) {
    return;
  }

  ui.commentsStatus.textContent = "Removing comment...";

  const { error } = await state.supabase.from("recipe_comments").delete().eq("id", commentId);

  if (error) {
    console.error(error);
    ui.commentsStatus.textContent = "Could not remove comment.";
    return;
  }

  ui.commentsStatus.textContent = "Comment removed.";
  await hydrateRecipeComments(state.recipe.id);
  renderCommentsBlock();
}

async function submitRecipeRating(rating) {
  if (!state.session?.user?.id || !state.recipe?.id) {
    ui.recipeStatus.textContent = "Sign in to rate recipes.";
    return;
  }

  const safeRating = Math.max(1, Math.min(5, Number(rating || 0)));
  if (!Number.isFinite(safeRating)) {
    return;
  }

  let hadExistingRating = false;
  const { data: existingRating, error: existingRatingError } = await state.supabase
    .from("recipe_ratings")
    .select("rating")
    .eq("recipe_id", state.recipe.id)
    .eq("user_id", state.session.user.id)
    .maybeSingle();

  if (existingRatingError && existingRatingError.code !== "PGRST116") {
    console.error(existingRatingError);
  }

  hadExistingRating = Number(existingRating?.rating || 0) > 0;

  const { error } = await state.supabase.from("recipe_ratings").upsert(
    {
      recipe_id: state.recipe.id,
      user_id: state.session.user.id,
      rating: safeRating
    },
    {
      onConflict: "recipe_id,user_id"
    }
  );

  if (error) {
    console.error(error);
    ui.recipeStatus.textContent = "Could not save rating. Please try again.";
    return;
  }

  ui.recipeStatus.textContent = "Rating saved.";

  if (!hadExistingRating) {
    await notifyRatingEvent();
  }

  await hydrateRecipeRatings(state.recipe.id);
  renderRatingBlock();
}

function getCurrentActorDisplayName() {
  if (window.SharedProfileUtils?.getDisplayName) {
    return window.SharedProfileUtils.getDisplayName(state.currentProfile, state.session?.user || null);
  }

  return cleanText(state.session?.user?.email).split("@")[0] || "Family member";
}

async function notifyCommentEvent({ parentCommentId, parentComment }) {
  if (!window.SharedNotifications || !state.session?.user?.id || !state.recipe?.id) {
    return;
  }

  const actorUserId = cleanText(state.session.user.id);
  const actorDisplayName = getCurrentActorDisplayName();

  if (parentCommentId) {
    const parentUserId = cleanText(parentComment?.userId);
    if (!parentUserId || parentUserId === actorUserId) {
      return;
    }

    await createUserNotification({
      recipientUserId: parentUserId,
      eventType: window.SharedNotifications.EVENT_TYPES.REPLY,
      actorUserId,
      actorDisplayName
    });
    return;
  }

  const recipeOwnerId = cleanText(state.recipe.createdByUserId);
  if (!recipeOwnerId || recipeOwnerId === actorUserId) {
    return;
  }

  await createUserNotification({
    recipientUserId: recipeOwnerId,
    eventType: window.SharedNotifications.EVENT_TYPES.COMMENT,
    actorUserId,
    actorDisplayName
  });
}

async function notifyRatingEvent() {
  if (!window.SharedNotifications || !state.session?.user?.id || !state.recipe?.id) {
    return;
  }

  const actorUserId = cleanText(state.session.user.id);
  const recipeOwnerId = cleanText(state.recipe.createdByUserId);

  if (!recipeOwnerId || recipeOwnerId === actorUserId) {
    return;
  }

  await createUserNotification({
    recipientUserId: recipeOwnerId,
    eventType: window.SharedNotifications.EVENT_TYPES.RATING,
    actorUserId,
    actorDisplayName: getCurrentActorDisplayName()
  });
}

async function createUserNotification({ recipientUserId, eventType, actorUserId, actorDisplayName }) {
  const safeRecipientUserId = cleanText(recipientUserId);
  if (!safeRecipientUserId || !eventType) {
    return;
  }

  const message = window.SharedNotifications.buildNotificationMessage({
    eventType,
    actorDisplayName,
    recipeTitle: state.recipe?.title
  });

  const { error } = await state.supabase.from("user_notifications").insert({
    user_id: safeRecipientUserId,
    actor_user_id: cleanText(actorUserId),
    event_type: cleanText(eventType),
    recipe_id: cleanText(state.recipe?.id),
    recipe_title: cleanText(state.recipe?.title),
    message,
    link_url: window.SharedNotifications.buildRecipeHref(state.recipe?.id)
  });

  if (error && error.code !== "42P01" && error.code !== "42501" && error.code !== "PGRST205") {
    console.error(error);
  }
}

async function copyRecipeLink() {
  try {
    await navigator.clipboard.writeText(window.location.href);
    ui.recipeStatus.textContent = "Recipe link copied.";
  } catch (error) {
    console.error(error);
    ui.recipeStatus.textContent = "Could not copy link. You can copy it from the browser address bar.";
  }
}

async function signUp() {
  const result = await window.SharedAuthUtils.signUp({
    supabase: state.useSupabase ? state.supabase : null,
    email: ui.authEmail.value,
    password: ui.authPassword.value
  });

  if (!result.ok) {
    if (!state.useSupabase) {
      window.SharedNavbar?.setSignedOutState("Service is currently unavailable.");
      return;
    }

    if (result.error) {
      console.error(result.error);
    }

    window.SharedNavbar?.setSignedOutState(result.message);
    return;
  }

  window.SharedNavbar?.setSignedOutState(
    "Account created. Confirm your email if prompted, then sign in."
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
      window.SharedNavbar?.setSignedOutState("Service is currently unavailable.");
      return;
    }

    if (result.error) {
      console.error(result.error);
    }

    window.SharedNavbar?.setSignedOutState(result.message);
  }
}

function normalizeRecipe(row) {
  return {
    id: cleanText(row.id),
    title: cleanText(row.title),
    addedBy: cleanText(row.added_by) || "Family",
    description: cleanText(row.description),
    mealType: cleanText(row.meal_type),
    ingredientTags: cleanArray(row.ingredient_tags),
    allergyTags: cleanArray(row.allergy_tags),
    audienceTags: cleanArray(row.audience_tags),
    ingredients: cleanArray(row.ingredients),
    steps: cleanArray(row.steps),
    createdByUserId: cleanText(row.created_by),
    authorProfile: null
  };
}

function cleanText(value) {
  return String(value || "").trim();
}

function cleanArray(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => cleanText(item))
    .filter(Boolean)
    .filter((item, index, all) => all.indexOf(item) === index);
}

function renderStars(value) {
  const safeValue = Math.max(0, Math.min(5, Number(value || 0)));
  const full = Math.round(safeValue);
  return `${"★".repeat(full)}${"☆".repeat(5 - full)}`;
}
