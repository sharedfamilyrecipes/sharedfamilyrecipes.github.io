const DEFAULT_OPTIONS = {
  mealTypes: ["Breakfast", "Lunch", "Dinner", "Snack", "Dessert"],
  ingredients: [
    "Chicken",
    "Beef",
    "Pasta",
    "Eggs",
    "Rice",
    "Vegetarian",
    "Seafood",
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
  canAdd: false
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
  recipeDialog: document.querySelector("#recipeDialog"),
  recipeDialogContent: document.querySelector("#recipeDialogContent"),
  closeRecipeDialog: document.querySelector("#closeRecipeDialog"),
  addDialog: document.querySelector("#addDialog"),
  openAddRecipe: document.querySelector("#openAddRecipe"),
  closeAddDialog: document.querySelector("#closeAddDialog"),
  cancelAddDialog: document.querySelector("#cancelAddDialog"),
  addRecipeForm: document.querySelector("#addRecipeForm"),
  ingredientTagInputs: document.querySelector("#ingredientTagInputs"),
  allergyTagInputs: document.querySelector("#allergyTagInputs"),
  audienceTagInputs: document.querySelector("#audienceTagInputs"),
  formStatus: document.querySelector("#formStatus"),
  authForm: document.querySelector("#authForm"),
  authEmail: document.querySelector("#authEmail"),
  authPassword: document.querySelector("#authPassword"),
  signInBtn: document.querySelector("#signInBtn"),
  signUpBtn: document.querySelector("#signUpBtn"),
  signOutBtn: document.querySelector("#signOutBtn"),
  authMessage: document.querySelector("#authMessage")
};

init().catch((error) => {
  console.error(error);
});

async function init() {
  bindEvents();
  setupSupabaseClient();

  if (state.useSupabase) {
    await refreshSessionAndPermissions();
    await loadRecipesFromSupabase();

    state.supabase.auth.onAuthStateChange(async () => {
      await refreshSessionAndPermissions();
      render();
    });
  } else {
    ui.authMessage.textContent =
      "Supabase is not configured yet. Add values in supabase-config.js.";
    await loadRecipesFromJson();
  }

  buildFilterAndFormInputs();
  render();
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
    if (!state.session) {
    }

    if (!state.canAdd) {
      return;
    }

    ui.formStatus.textContent = "";
    ui.addRecipeForm.reset();
    openDialog(ui.addDialog);
  });

  ui.closeAddDialog.addEventListener("click", () => closeDialog(ui.addDialog));
  ui.cancelAddDialog.addEventListener("click", () => closeDialog(ui.addDialog));
  ui.addRecipeForm.addEventListener("submit", handleAddRecipeSubmit);

  ui.closeRecipeDialog.addEventListener("click", () => closeDialog(ui.recipeDialog));

  ui.signInBtn.addEventListener("click", signIn);
  ui.signUpBtn.addEventListener("click", signUp);
  ui.signOutBtn.addEventListener("click", signOut);
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
  const { data, error } = await state.supabase.auth.getSession();
  if (error) {
    console.error(error);
    ui.authMessage.textContent = "Could not check sign-in status.";
    state.session = null;
    state.canAdd = false;
    updateAddButtonState();
    return;
  }

  state.session = data.session;

  if (!state.session?.user) {
    state.canAdd = false;
    ui.authMessage.textContent = "Signed out. Sign in to add recipes.";
    updateAddButtonState();
    return;
  }

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
    ui.authMessage.textContent = `Signed in as ${userEmail}. Permission check failed.`;
    updateAddButtonState();
    return;
  }

  state.canAdd = Boolean(editorRow && editorRow.can_add);
  ui.authMessage.textContent = `Signed in as ${userEmail}.`;

  updateAddButtonState();
}

function updateAddButtonState() {
  if (!state.session || !state.canAdd) {
    ui.openAddRecipe.classList.add("btn-ghost");
    ui.openAddRecipe.classList.remove("btn-primary");
    return;
  }

  ui.openAddRecipe.classList.remove("btn-ghost");
  ui.openAddRecipe.classList.add("btn-primary");
}

async function loadRecipesFromSupabase() {
  const { data, error } = await state.supabase
    .from("recipes")
    .select("id,title,added_by,description,meal_type,ingredient_tags,allergy_tags,audience_tags,ingredients,steps")
    .order("title", { ascending: true });

  if (error) {
    console.error(error);
    state.recipes = [];
    return;
  }

  state.recipes = data.map(fromDbRecipeRow);
}

async function loadRecipesFromJson() {
  try {
    const response = await fetch("recipes.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Could not load recipes.json");
    }

    const recipes = await response.json();
    state.recipes = recipes.map(normalizeRecipe);
  } catch (error) {
    console.error(error);
    state.recipes = [];
  }
}

function clearAllFilters() {
  state.filters.mealTypes.clear();
  state.filters.ingredients.clear();
  state.filters.allergies.clear();
  state.filters.audience.clear();
  state.filters.searchText = "";
  ui.searchInput.value = "";
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
      card.querySelector(".added-by").textContent = `Added by ${recipe.addedBy}`;
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

      card.querySelector(".details-btn").addEventListener("click", () => {
        openRecipeDialog(recipe);
      });

      ui.recipeGrid.append(card);
    });
}

function openRecipeDialog(recipe) {
  const ingredientItems = recipe.ingredients
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  const stepItems = recipe.steps.map((item) => `<li>${escapeHtml(item)}</li>`).join("");

  ui.recipeDialogContent.innerHTML = `
    <h2>${escapeHtml(recipe.title)}</h2>
    <p><strong>Added by:</strong> ${escapeHtml(recipe.addedBy)}</p>
    <p>${escapeHtml(recipe.description)}</p>
    <div class="tags">
      ${[recipe.mealType, ...recipe.ingredientTags, ...recipe.allergyTags, ...recipe.audienceTags]
        .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
        .join("")}
    </div>
    <h3>Ingredients</h3>
    <ul class="ingredients">${ingredientItems}</ul>
    <h3>Steps</h3>
    <ol class="steps">${stepItems}</ol>
  `;

  openDialog(ui.recipeDialog);
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

  const recipe = normalizeRecipe({
    title: formData.get("title"),
    addedBy: formData.get("addedBy"),
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
    !recipe.addedBy ||
    !recipe.mealType ||
    !recipe.ingredients.length ||
    !recipe.steps.length
  ) {
    ui.formStatus.textContent =
      "Please fill in recipe name, added by, meal type, ingredients, and steps.";
    return;
  }

  const { error } = await state.supabase.from("recipes").insert({
    title: recipe.title,
    added_by: recipe.addedBy,
    description: recipe.description,
    meal_type: recipe.mealType,
    ingredient_tags: recipe.ingredientTags,
    allergy_tags: recipe.allergyTags,
    audience_tags: recipe.audienceTags,
    ingredients: recipe.ingredients,
    steps: recipe.steps
  });

  if (error) {
    console.error(error);
    ui.formStatus.textContent = "Could not save recipe. Check permissions and try again.";
    return;
  }

  ui.formStatus.textContent = "Recipe saved.";
  closeDialog(ui.addDialog);
  await loadRecipesFromSupabase();
  buildFilterAndFormInputs();
  render();
}

async function signUp() {
  if (!state.useSupabase) {
    ui.authMessage.textContent = "Configure Supabase first.";
    return;
  }

  const email = ui.authEmail.value.trim();
  const password = ui.authPassword.value;

  if (!email || !password) {
    ui.authMessage.textContent = "Enter email and password to create an account.";
    return;
  }

  const { error } = await state.supabase.auth.signUp({
    email,
    password
  });

  if (error) {
    console.error(error);
    ui.authMessage.textContent = `Sign-up failed: ${error.message}`;
    return;
  }

  ui.authMessage.textContent =
    "Account created. Confirm your email if prompted, then ask the owner to approve your account.";
}

async function signIn() {
  if (!state.useSupabase) {
    ui.authMessage.textContent = "Configure Supabase first.";
    return;
  }

  const email = ui.authEmail.value.trim();
  const password = ui.authPassword.value;

  if (!email || !password) {
    ui.authMessage.textContent = "Enter email and password to sign in.";
    return;
  }

  const { error } = await state.supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    console.error(error);
    ui.authMessage.textContent = `Sign-in failed: ${error.message}`;
    return;
  }

  await refreshSessionAndPermissions();
  ui.authMessage.textContent = "Signed in.";
}

async function signOut() {
  if (!state.useSupabase) {
    ui.authMessage.textContent = "Supabase is not configured.";
    return;
  }

  const { error } = await state.supabase.auth.signOut();
  if (error) {
    console.error(error);
    ui.authMessage.textContent = `Sign-out failed: ${error.message}`;
    return;
  }

  await refreshSessionAndPermissions();
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
    steps: row.steps
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
    steps: cleanArray(raw.steps)
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
  if (typeof dialogElement.showModal === "function") {
    dialogElement.showModal();
    return;
  }

  dialogElement.setAttribute("open", "");
}

function closeDialog(dialogElement) {
  if (typeof dialogElement.close === "function") {
    dialogElement.close();
    return;
  }

  dialogElement.removeAttribute("open");
}
