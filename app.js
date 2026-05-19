const DEFAULT_OPTIONS = {
  mealTypes: ["Breakfast", "Lunch", "Dinner", "Snack", "Dessert"],
  ingredients: [
    "Chicken",
    "Beef",
    "Pasta",
    "Rice",
    "Vegetarian",
    "Pork"
  ],
  allergies: ["Milk Free", "Gluten Free"],
  audience: ["Adults", "Kids", "Family"]
};

const state = {
  recipes: [],
  filters: {
    mealTypes: new Set(),
    ingredients: new Set(),
    allergies: new Set(),
    audience: new Set(),
    searchText: ""
  },
  supabase: null,
  useSupabase: false,
  session: null,
  currentProfile: null,
  canAdd: false,
  editingRecipeId: null
};

const ui = {
  searchInput: document.querySelector("#searchInput"),
  mealTypeFilters: document.querySelector("#mealTypeFilters"),
  ingredientFilters: document.querySelector("#ingredientFilters"),
  allergyFilters: document.querySelector("#allergyFilters"),
  audienceFilters: document.querySelector("#audienceFilters"),
  clearFilters: document.querySelector("#clearFilters"),
  recipeGrid: document.querySelector("#recipeGrid"),
  resultCount: document.querySelector("#resultCount"),
  cardTemplate: document.querySelector("#recipeCardTemplate"),
  addDialog: document.querySelector("#addDialog"),
  openAddRecipe: document.querySelector("#openAddRecipe"),
  closeAddDialog: document.querySelector("#closeAddDialog"),
  cancelAddDialog: document.querySelector("#cancelAddDialog"),
  addRecipeForm: document.querySelector("#addRecipeForm"),
  addDialogTitle: document.querySelector("#addDialogTitle"),
  saveRecipeBtn: document.querySelector("#saveRecipeBtn"),
  ingredientTagInputs: document.querySelector("#ingredientTagInputs"),
  allergyTagInputs: document.querySelector("#allergyTagInputs"),
  audienceTagInputs: document.querySelector("#audienceTagInputs"),
  formStatus: document.querySelector("#formStatus"),
  authForm: null,
  authEmail: null,
  authPassword: null,
  signInBtn: null,
  signUpBtn: null,
  signOutBtn: null,
  authMessage: null,
  signedOutAuth: null,
  signedInProfile: null,
  profileAvatar: null,
  profileDisplayName: null,
  profileMeta: null,
  profileMenuLink: null
};

init().catch((error) => {
  console.error(error);
});

async function init() {
  await waitForSharedNavbar();
  hydrateSharedNavbarUi();
  bindEvents();
  updateAuthButtonState();
  setupSupabaseClient();
  configureSharedNavbarAuth();

  if (state.useSupabase) {
    await refreshSessionAndPermissions();
    await loadRecipesFromSupabase();

    state.supabase.auth.onAuthStateChange((event) => {
      refreshSessionAndPermissions().then(() => hydrateRecipeRatings()).then(() => render());
    });
  } else {
    ui.authMessage.textContent =
      "Supabase is required. Add values in supabase-config.js.";
    state.recipes = [];
  }

  buildFilterAndFormInputs();
  render();
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
  ui.searchInput.addEventListener("input", (event) => {
    state.filters.searchText = event.target.value.trim().toLowerCase();
    render();
  });

  ui.clearFilters.addEventListener("click", () => {
    clearAllFilters();
    render();
  });

  ui.openAddRecipe.addEventListener("click", () => {
    if (!state.canAdd) {
      return;
    }

    resetAddDialogMode();
    ui.formStatus.textContent = "";
    ui.addRecipeForm.reset();
    syncFormChipStates();
    openDialog(ui.addDialog);
  });

  ui.closeAddDialog.addEventListener("click", () => {
    resetAddDialogMode();
    closeDialog(ui.addDialog);
  });
  ui.cancelAddDialog.addEventListener("click", () => {
    resetAddDialogMode();
    closeDialog(ui.addDialog);
  });
  ui.addRecipeForm.addEventListener("submit", handleAddRecipeSubmit);

  ui.signInBtn?.addEventListener("click", signIn);
  ui.signUpBtn?.addEventListener("click", signUp);
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
      setAuthMessage(message || "Sign-out failed.");
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

async function refreshSessionAndPermissions() {
  updateAuthButtonState();

  const { data, error } = await state.supabase.auth.getSession();
  if (error) {
    console.error(error);
    setAuthMessage("Could not check sign-in status.");
    state.session = null;
    state.currentProfile = null;
    state.canAdd = false;
    updateAddButtonState();
    updateAuthButtonState();
    return;
  }

  state.session = data.session;
  updateAuthButtonState();

  if (!state.session?.user) {
    state.currentProfile = null;
    state.canAdd = false;
    updateAddButtonState();
    setAuthMessage("");
    render();
    return;
  }

  await syncCurrentUserProfile();
  state.currentProfile = await loadCurrentUserProfile();

  const userId = state.session.user.id;
  const userEmail = state.session.user.email || "(no email)";

  const { data: editorRow, error: editorError } = await state.supabase
    .from("recipe_editors")
    .select("can_add")
    .eq("user_id", userId)
    .maybeSingle();

  if (editorError) {
    console.error(editorError);
    state.canAdd = false;
    updateNavbarProfile();
    updateAddButtonState();
    return;
  }

  state.canAdd = Boolean(editorRow && editorRow.can_add);
  updateNavbarProfile();

  updateAddButtonState();
}

function updateAddButtonState() {
  ui.openAddRecipe.hidden = !state.session || !state.canAdd;

  if (!state.session || !state.canAdd) {
    ui.openAddRecipe.classList.add("btn-ghost");
    ui.openAddRecipe.classList.remove("btn-primary");
    return;
  }

  ui.openAddRecipe.classList.remove("btn-ghost");
  ui.openAddRecipe.classList.add("btn-primary");
}

function updateAuthButtonState() {
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

function setAuthMessage(message) {
  if (ui.authMessage) {
    ui.authMessage.textContent = message;
  }

  if (!state.session?.user && window.SharedNavbar) {
    window.SharedNavbar.setSignedOutState(message);
  }
}

async function loadRecipesFromSupabase() {
  const { data, error } = await state.supabase
    .from("recipes")
    .select(
      "id,title,added_by,description,meal_type,ingredient_tags,allergy_tags,audience_tags,ingredients,steps,created_by"
    )
    .order("title", { ascending: true });

  if (error) {
    console.error(error);
    state.recipes = [];
    return;
  }

  state.recipes = data.map(fromDbRecipeRow);
  await hydrateRecipeDisplayNames();
  await hydrateRecipeRatings();
}

async function hydrateRecipeDisplayNames() {
  if (!state.useSupabase || !state.recipes.length) {
    return;
  }

  const creatorIds = [...new Set(state.recipes.map((recipe) => recipe.createdByUserId).filter(Boolean))];
  if (!creatorIds.length) {
    return;
  }

  const { data, error } = await state.supabase
    .from("user_profiles")
    .select("user_id,display_name,email,avatar_kind,avatar_path,avatar_icon")
    .in("user_id", creatorIds);

  if (error) {
    if (error.code !== "42P01" && error.code !== "42501" && error.code !== "PGRST205") {
      console.error(error);
    }
    return;
  }

  const profileByUserId = new Map();
  (data || []).forEach((row) => {
    const userId = cleanText(row.user_id);
    if (!userId) {
      return;
    }

    const displayName = cleanText(row.display_name);
    const emailName = cleanText(row.email).split("@")[0] || "";
    const finalName = displayName || emailName;

    profileByUserId.set(userId, {
      display_name: finalName,
      email: cleanText(row.email),
      avatar_kind: cleanText(row.avatar_kind),
      avatar_path: cleanText(row.avatar_path),
      avatar_icon: cleanText(row.avatar_icon)
    });
  });

  state.recipes = state.recipes.map((recipe) => ({
    ...recipe,
    addedBy: profileByUserId.get(recipe.createdByUserId)?.display_name || recipe.addedBy,
    authorProfile:
      profileByUserId.get(recipe.createdByUserId) ||
      {
        display_name: recipe.addedBy,
        avatar_kind: "initials",
        avatar_path: "",
        avatar_icon: ""
      }
  }));
}

async function hydrateRecipeRatings() {
  state.recipes = state.recipes.map((recipe) => ({
    ...recipe,
    ratingAverage: 0,
    ratingCount: 0,
    userRating: 0
  }));

  if (!state.useSupabase || !state.recipes.length) {
    return;
  }

  const { data: allRatings, error: allRatingsError } = await state.supabase
    .from("recipe_ratings")
    .select("recipe_id,rating");

  if (allRatingsError) {
    console.error(allRatingsError);
    return;
  }

  const statsByRecipeId = new Map();
  allRatings.forEach((row) => {
    const recipeId = String(row.recipe_id || "");
    const ratingValue = Number(row.rating || 0);

    if (!recipeId || !Number.isFinite(ratingValue) || ratingValue < 1 || ratingValue > 5) {
      return;
    }

    const current = statsByRecipeId.get(recipeId) || { sum: 0, count: 0 };
    current.sum += ratingValue;
    current.count += 1;
    statsByRecipeId.set(recipeId, current);
  });

  const myRatingsByRecipeId = new Map();
  if (state.session?.user?.id) {
    const { data: myRatings, error: myRatingsError } = await state.supabase
      .from("recipe_ratings")
      .select("recipe_id,rating")
      .eq("user_id", state.session.user.id);

    if (!myRatingsError) {
      myRatings.forEach((row) => {
        myRatingsByRecipeId.set(String(row.recipe_id || ""), Number(row.rating || 0));
      });
    } else {
      console.error(myRatingsError);
    }
  }

  state.recipes = state.recipes.map((recipe) => {
    const stats = statsByRecipeId.get(recipe.id);
    const count = stats ? stats.count : 0;
    const average = count > 0 ? stats.sum / count : 0;

    return {
      ...recipe,
      ratingAverage: average,
      ratingCount: count,
      userRating: myRatingsByRecipeId.get(recipe.id) || 0
    };
  });
}

function clearAllFilters() {
  state.filters.mealTypes.clear();
  state.filters.ingredients.clear();
  state.filters.allergies.clear();
  state.filters.audience.clear();
  state.filters.searchText = "";
  ui.searchInput.value = "";

  [ui.mealTypeFilters, ui.ingredientFilters, ui.allergyFilters, ui.audienceFilters].forEach(
    (container) => {
      container.querySelectorAll(".chip.active").forEach((chip) => {
        chip.classList.remove("active");
      });
    }
  );
}

function getFilterOptions() {
  const mealTypes = new Set(DEFAULT_OPTIONS.mealTypes);
  const ingredients = new Set(DEFAULT_OPTIONS.ingredients);
  const allergies = new Set(DEFAULT_OPTIONS.allergies);
  const audience = new Set(DEFAULT_OPTIONS.audience);

  state.recipes.forEach((recipe) => {
    mealTypes.add(recipe.mealType);
    recipe.ingredientTags.forEach((item) => ingredients.add(item));
    recipe.allergyTags.forEach((item) => allergies.add(item));
    recipe.audienceTags.forEach((item) => audience.add(item));
  });

  return {
    mealTypes: [...mealTypes].filter(Boolean).sort(),
    ingredients: [...ingredients].filter(Boolean).sort(),
    allergies: [...allergies].filter(Boolean).sort(),
    audience: [...audience].filter(Boolean).sort()
  };
}

function buildFilterAndFormInputs() {
  const options = getFilterOptions();

  buildChipToggles(ui.mealTypeFilters, options.mealTypes, state.filters.mealTypes);
  buildChipToggles(ui.ingredientFilters, options.ingredients, state.filters.ingredients);
  buildChipToggles(ui.allergyFilters, options.allergies, state.filters.allergies);
  buildChipToggles(ui.audienceFilters, options.audience, state.filters.audience);

  buildFormCheckboxes(ui.ingredientTagInputs, "ingredientTags", options.ingredients);
  buildFormCheckboxes(ui.allergyTagInputs, "allergyTags", options.allergies);
  buildFormCheckboxes(ui.audienceTagInputs, "audienceTags", options.audience);

  const mealTypeSelect = ui.addRecipeForm.elements.mealType;
  mealTypeSelect.innerHTML = '<option value="">Choose one...</option>';
  options.mealTypes.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    mealTypeSelect.append(option);
  });
}

function buildChipToggles(container, values, selectedSet) {
  container.innerHTML = "";
  values.forEach((value) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.textContent = value;

    if (selectedSet.has(value)) {
      button.classList.add("active");
    }

    button.addEventListener("click", () => {
      if (selectedSet.has(value)) {
        selectedSet.delete(value);
      } else {
        selectedSet.add(value);
      }

      button.classList.toggle("active");
      render();
    });

    container.append(button);
  });
}

function buildFormCheckboxes(container, name, values) {
  container.innerHTML = "";
  values.forEach((value) => {
    const id = `${name}-${slug(value)}`;
    const label = document.createElement("label");
    label.className = "chip";
    label.htmlFor = id;

    const input = document.createElement("input");
    input.id = id;
    input.name = name;
    input.type = "checkbox";
    input.value = value;
    input.hidden = true;

    input.addEventListener("change", () => {
      label.classList.toggle("active", input.checked);
    });

    label.append(input, document.createTextNode(value));
    container.append(label);
  });
}

function render() {
  const filtered = state.recipes.filter(matchesFilters);
  renderRecipeGrid(filtered);
  ui.resultCount.textContent = `${filtered.length} recipe${filtered.length === 1 ? "" : "s"}`;
}

function matchesFilters(recipe) {
  const { mealTypes, ingredients, allergies, audience, searchText } = state.filters;

  const passesMeal = mealTypes.size === 0 || mealTypes.has(recipe.mealType);
  const passesIngredients =
    ingredients.size === 0 || recipe.ingredientTags.some((tag) => ingredients.has(tag));
  const passesAllergies =
    allergies.size === 0 || recipe.allergyTags.some((tag) => allergies.has(tag));
  const passesAudience =
    audience.size === 0 || recipe.audienceTags.some((tag) => audience.has(tag));

  const haystack = [
    recipe.title,
    recipe.addedBy,
    recipe.description,
    recipe.mealType,
    ...recipe.ingredientTags,
    ...recipe.allergyTags,
    ...recipe.audienceTags,
    ...recipe.ingredients,
    ...recipe.steps
  ]
    .join(" ")
    .toLowerCase();

  const passesSearch = !searchText || haystack.includes(searchText);

  return (
    passesMeal && passesIngredients && passesAllergies && passesAudience && passesSearch
  );
}

function renderRecipeGrid(recipes) {
  ui.recipeGrid.innerHTML = "";

  if (!recipes.length) {
    ui.recipeGrid.innerHTML =
      '<p class="empty-state">No recipes match these filters yet. Try clearing filters.</p>';
    return;
  }

  recipes
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title))
    .forEach((recipe) => {
      const card = ui.cardTemplate.content.firstElementChild.cloneNode(true);
      card.querySelector("h3").textContent = recipe.title;
      card.querySelector(".added-by-name").textContent = recipe.addedBy;
      const authorAvatar = card.querySelector(".recipe-author-avatar");
      if (authorAvatar && window.SharedProfileUtils?.renderAvatar) {
        window.SharedProfileUtils.renderAvatar(
          authorAvatar,
          recipe.authorProfile || { display_name: recipe.addedBy, avatar_kind: "initials" },
          null,
          state.supabase
        );
      }
      card.querySelector(".description").textContent = recipe.description;

      const tagBox = card.querySelector(".tags");
      [recipe.mealType, ...recipe.ingredientTags, ...recipe.allergyTags, ...recipe.audienceTags]
        .slice(0, 6)
        .forEach((tag) => {
          const span = document.createElement("span");
          span.className = "tag";
          span.textContent = tag;
          tagBox.append(span);
        });

      const ratingSummary = card.querySelector(".rating-summary");
      const ratingMeta = card.querySelector(".rating-meta");
      const ratingInput = card.querySelector(".rating-input");

      const ratingDisplay = Number.isInteger(recipe.ratingAverage)
        ? String(recipe.ratingAverage)
        : recipe.ratingAverage.toFixed(1);
      ratingSummary.textContent = `${renderStars(recipe.ratingAverage)} ${ratingDisplay}/5`;
      ratingMeta.textContent =
        recipe.ratingCount > 0
          ? `${recipe.ratingCount} rating${recipe.ratingCount === 1 ? "" : "s"}`
          : "No ratings yet";

      ratingInput.innerHTML = "";
      for (let score = 1; score <= 5; score += 1) {
        const starButton = document.createElement("button");
        starButton.type = "button";
        starButton.className = "star-btn";
        starButton.textContent = "★";
        starButton.setAttribute("aria-label", `Rate ${recipe.title} ${score} stars`);

        if (recipe.userRating >= score) {
          starButton.classList.add("active");
        }

        if (!state.useSupabase || !state.session?.user) {
          starButton.disabled = true;
          starButton.title = state.useSupabase
            ? "Sign in to rate recipes"
            : "Configure Supabase to enable ratings";
        }

        starButton.addEventListener("click", async () => {
          await submitRecipeRating(recipe.id, score);
        });

        ratingInput.append(starButton);
      }

      const editBtn = card.querySelector(".edit-btn");
      const deleteBtn = card.querySelector(".delete-btn");
      const canManage = canManageRecipe(recipe);

      if (canManage) {
        editBtn.hidden = false;
        deleteBtn.hidden = false;

        editBtn.addEventListener("click", () => {
          openEditRecipeDialog(recipe);
        });

        deleteBtn.addEventListener("click", async () => {
          await deleteRecipe(recipe);
        });
      }

      const detailsLink = card.querySelector(".details-link");
      detailsLink.href = getRecipePageUrl(recipe.id);
      detailsLink.setAttribute("aria-label", `View recipe page for ${recipe.title}`);

      ui.recipeGrid.append(card);
    });
}

function getRecipePageUrl(recipeId) {
  return `recipe/index.html?id=${encodeURIComponent(recipeId)}`;
}

async function submitRecipeRating(recipeId, rating) {
  if (!state.useSupabase) {
    ui.authMessage.textContent = "Configure Supabase before rating recipes.";
    return;
  }

  if (!state.session?.user?.id) {
    ui.authMessage.textContent = "Sign in to rate recipes.";
    return;
  }

  const safeRating = Math.max(1, Math.min(5, Number(rating || 0)));
  if (!Number.isFinite(safeRating)) {
    return;
  }

  const { error } = await state.supabase.from("recipe_ratings").upsert(
    {
      recipe_id: recipeId,
      user_id: state.session.user.id,
      rating: safeRating
    },
    {
      onConflict: "recipe_id,user_id"
    }
  );

  if (error) {
    console.error(error);
    ui.authMessage.textContent = "Could not save rating. Please try again.";
    return;
  }

  await hydrateRecipeRatings();
  render();
}

async function handleAddRecipeSubmit(event) {
  event.preventDefault();

  if (!state.useSupabase) {
    ui.formStatus.textContent = "Configure Supabase before adding shared recipes.";
    return;
  }

  if (!state.session || !state.canAdd) {
    ui.formStatus.textContent = "You are not approved to add recipes.";
    return;
  }

  const formData = new FormData(ui.addRecipeForm);
  const displayNameFromProfile =
    window.SharedProfileUtils?.getDisplayName?.(state.currentProfile, state.session?.user) ||
    cleanText(state.session?.user?.email).split("@")[0] ||
    "Family";

  const recipe = normalizeRecipe({
    title: formData.get("title"),
    addedBy: displayNameFromProfile,
    description: formData.get("description"),
    mealType: formData.get("mealType"),
    ingredientTags: formData.getAll("ingredientTags"),
    allergyTags: formData.getAll("allergyTags"),
    audienceTags: formData.getAll("audienceTags"),
    ingredients: toLines(formData.get("ingredientsList")),
    steps: toLines(formData.get("stepsList"))
  });

  if (
    !recipe.title ||
    !recipe.mealType ||
    !recipe.ingredients.length ||
    !recipe.steps.length
  ) {
    ui.formStatus.textContent =
      "Please fill in recipe name, meal type, ingredients, and steps.";
    return;
  }

  const payload = {
    title: recipe.title,
    added_by:
      (window.SharedProfileUtils?.getDisplayName
        ? window.SharedProfileUtils.getDisplayName(state.currentProfile, state.session?.user)
        : "") || recipe.addedBy,
    description: recipe.description,
    meal_type: recipe.mealType,
    ingredient_tags: recipe.ingredientTags,
    allergy_tags: recipe.allergyTags,
    audience_tags: recipe.audienceTags,
    ingredients: recipe.ingredients,
    steps: recipe.steps
  };

  let error = null;

  if (state.editingRecipeId) {
    const result = await state.supabase
      .from("recipes")
      .update(payload)
      .eq("id", state.editingRecipeId)
      .eq("created_by", state.session.user.id)
      .select("id")
      .single();

    error = result.error;
  } else {
    const result = await state.supabase.from("recipes").insert({
      ...payload,
      created_by: state.session.user.id
    });

    error = result.error;
  }

  if (error) {
    console.error(error);
    ui.formStatus.textContent = state.editingRecipeId
      ? "Could not update recipe. You can only edit your own recipes."
      : "Could not save recipe. Check permissions and try again.";
    return;
  }

  ui.formStatus.textContent = state.editingRecipeId ? "Recipe updated." : "Recipe saved.";
  resetAddDialogMode();
  closeDialog(ui.addDialog);
  await loadRecipesFromSupabase();
  buildFilterAndFormInputs();
  render();
}

async function signUp() {
  const result = await window.SharedAuthUtils.signUp({
    supabase: state.useSupabase ? state.supabase : null,
    email: ui.authEmail.value,
    password: ui.authPassword.value
  });

  if (!result.ok) {
    if (!state.useSupabase) {
      setAuthMessage("Configure Supabase first.");
      return;
    }

    if (result.error) {
      console.error(result.error);
    }

    setAuthMessage(result.message);
    return;
  }

  setAuthMessage(
    "Account created. Confirm your email if prompted, then ask the owner to approve your account."
  );
}

async function signIn() {
  const result = await window.SharedAuthUtils.signIn({
    supabase: state.useSupabase ? state.supabase : null,
    email: ui.authEmail.value,
    password: ui.authPassword.value,
    onSuccess: refreshSessionAndPermissions
  });

  if (!result.ok) {
    if (!state.useSupabase) {
      setAuthMessage("Configure Supabase first.");
      return;
    }

    if (result.error) {
      console.error(result.error);
    }

    setAuthMessage(result.message);
    return;
  }
}

async function signOut() {
  const result = await window.SharedAuthUtils.signOut({
    supabase: state.useSupabase ? state.supabase : null,
    reloadAlways: true
  });

  if (!result.ok) {
    if (result.error) {
      console.error(result.error);
    }
    setAuthMessage(result.message || "Supabase is not configured.");
  }
}

function fromDbRecipeRow(row) {
  return normalizeRecipe({
    id: row.id,
    title: row.title,
    addedBy: row.added_by,
    description: row.description,
    mealType: row.meal_type,
    ingredientTags: row.ingredient_tags,
    allergyTags: row.allergy_tags,
    audienceTags: row.audience_tags,
    ingredients: row.ingredients,
    steps: row.steps,
    createdByUserId: row.created_by,
    ratingAverage: 0,
    ratingCount: 0,
    userRating: 0
  });
}

function normalizeRecipe(raw) {
  const fallbackId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random();

  return {
    id: String(raw.id || `seed-${fallbackId}`),
    title: cleanText(raw.title),
    addedBy: cleanText(raw.addedBy) || "Family",
    description: cleanText(raw.description),
    mealType: cleanText(raw.mealType),
    ingredientTags: cleanArray(raw.ingredientTags),
    allergyTags: cleanArray(raw.allergyTags),
    audienceTags: cleanArray(raw.audienceTags),
    ingredients: cleanArray(raw.ingredients),
    steps: cleanArray(raw.steps),
    createdByUserId: cleanText(raw.createdByUserId),
    authorProfile: raw.authorProfile || null,
    ratingAverage: Number(raw.ratingAverage || 0),
    ratingCount: Number(raw.ratingCount || 0),
    userRating: Number(raw.userRating || 0)
  };
}

function canManageRecipe(recipe) {
  return Boolean(
    state.useSupabase &&
      state.canAdd &&
      state.session?.user?.id &&
      recipe.createdByUserId &&
      recipe.createdByUserId === state.session.user.id
  );
}

function openEditRecipeDialog(recipe) {
  if (!canManageRecipe(recipe)) {
    ui.authMessage.textContent = "You can only edit your own recipes.";
    return;
  }

  state.editingRecipeId = recipe.id;
  ui.addDialogTitle.textContent = "Edit Recipe";
  ui.saveRecipeBtn.textContent = "Save Changes";
  ui.formStatus.textContent = "";

  ui.addRecipeForm.elements.title.value = recipe.title;
  ui.addRecipeForm.elements.description.value = recipe.description;
  ui.addRecipeForm.elements.mealType.value = recipe.mealType;
  ui.addRecipeForm.elements.ingredientsList.value = recipe.ingredients.join("\n");
  ui.addRecipeForm.elements.stepsList.value = recipe.steps.join("\n");

  setFormTagSelections("ingredientTags", recipe.ingredientTags);
  setFormTagSelections("allergyTags", recipe.allergyTags);
  setFormTagSelections("audienceTags", recipe.audienceTags);

  openDialog(ui.addDialog);
}

function setFormTagSelections(inputName, selectedTags) {
  const selected = new Set(selectedTags || []);
  const inputs = ui.addRecipeForm.querySelectorAll(`input[name="${inputName}"]`);

  inputs.forEach((input) => {
    input.checked = selected.has(input.value);
    if (input.parentElement) {
      input.parentElement.classList.toggle("active", input.checked);
    }
  });
}

function syncFormChipStates() {
  const chipInputs = ui.addRecipeForm.querySelectorAll('input[type="checkbox"]');
  chipInputs.forEach((input) => {
    if (input.parentElement) {
      input.parentElement.classList.toggle("active", input.checked);
    }
  });
}

function resetAddDialogMode() {
  state.editingRecipeId = null;
  ui.addDialogTitle.textContent = "Add A New Recipe";
  ui.saveRecipeBtn.textContent = "Save Recipe";
}

async function deleteRecipe(recipe) {
  if (!canManageRecipe(recipe)) {
    ui.authMessage.textContent = "You can only delete your own recipes.";
    return;
  }

  const confirmed = window.confirm(`Delete "${recipe.title}"? This cannot be undone.`);
  if (!confirmed) {
    return;
  }

  const { error } = await state.supabase
    .from("recipes")
    .delete()
    .eq("id", recipe.id)
    .eq("created_by", state.session.user.id)
    .select("id")
    .single();

  if (error) {
    console.error(error);
    ui.authMessage.textContent = "Could not delete recipe. You can only delete your own recipes.";
    return;
  }

  await loadRecipesFromSupabase();
  buildFilterAndFormInputs();
  render();
}

function renderStars(value) {
  const safeValue = Math.max(0, Math.min(5, Number(value || 0)));
  const full = Math.round(safeValue);
  return `${"★".repeat(full)}${"☆".repeat(5 - full)}`;
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

function toLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function openDialog(dialogElement) {
  const currentScrollY = window.scrollY;

  if (typeof dialogElement.showModal === "function") {
    dialogElement.showModal();
  } else {
    dialogElement.setAttribute("open", "");
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (window.scrollY !== currentScrollY) {
        window.scrollTo(0, currentScrollY);
      }
    });
  });
}

function closeDialog(dialogElement) {
  if (typeof dialogElement.close === "function") {
    dialogElement.close();
  } else {
    dialogElement.removeAttribute("open");
  }
}
