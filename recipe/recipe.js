const state = {
  supabase: null,
  useSupabase: false,
  session: null,
  currentProfile: null,
  recipe: null,
  ratingAverage: 0,
  ratingCount: 0,
  userRating: 0
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
    ui.recipeStatus.textContent = "Supabase is required. Update supabase-config.js.";
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
      await hydrateRecipeRatings(state.recipe.id);
      renderRatingBlock();
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
    window.SharedNavbar?.setSignedOutState("");
    return;
  }

  await syncCurrentUserProfile();
  state.currentProfile = await loadCurrentUserProfile();
  updateNavbarProfile();
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

async function submitRecipeRating(rating) {
  if (!state.session?.user?.id || !state.recipe?.id) {
    ui.recipeStatus.textContent = "Sign in to rate recipes.";
    return;
  }

  const safeRating = Math.max(1, Math.min(5, Number(rating || 0)));
  if (!Number.isFinite(safeRating)) {
    return;
  }

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
  await hydrateRecipeRatings(state.recipe.id);
  renderRatingBlock();
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
      window.SharedNavbar?.setSignedOutState("Configure Supabase first.");
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
