const $ = (selector) => document.querySelector(selector);

let recipes = [];
let page = 1;
let perPage = 30;
let totalRecipes = 0;
let currentRecipe = null;
let editingKey = null;
let listRequest = 0;
let initialLoad = true;
let suggestionSources = [];
let suggestionTags = [];
let suggestionsPromise = null;
let searchTimer;

const recipeCache = new Map();
const fields = [
	'name', 'comments', 'cook_time', 'directions', 'rating', 'servings', 'source',
	'description', 'tag_list', 'reheating_instructions', 'preparation_time',
	'ingredients', 'nutrition',
];
const nutritionFields = [
	['calories', 'Calories'], ['totalfat', 'Total fat'], ['satfat', 'Saturated fat'],
	['transfat', 'Trans fat'], ['carbo', 'Carbohydrates'], ['fiber', 'Fiber'],
	['protein', 'Protein'], ['sodium', 'Sodium'], ['sugar', 'Sugar'],
	['cholesterol', 'Cholesterol'], ['iron', 'Iron'], ['vitaminc', 'Vitamin C'],
	['vitamina', 'Vitamin A'], ['monofat', 'Monounsaturated fat'],
	['polyfat', 'Polyunsaturated fat'], ['calcium', 'Calcium'],
];
const longFields = new Set([
	'comments', 'directions', 'description', 'reheating_instructions',
	'ingredients', 'nutrition',
]);

function $safe(value) {
	return String(value ?? '').replace(/[&<>"']/g, (character) => ({
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#39;',
	}[character]));
}

function nutritionText(values = {}) {
	return nutritionFields
		.filter(([key]) => values[key] !== undefined && values[key] !== null && values[key] !== '')
		.map(([key, label]) => `${label}: ${values[key]}`)
		.join('\n');
}

function parseNutritionText(value) {
	const labels = new Map(nutritionFields.flatMap(([key, label]) => [
		[key.toLowerCase(), key],
		[label.toLowerCase(), key],
	]));
	const nutrition = {};

	for (const line of String(value || '').split(/\r?\n/)) {
		if (!line.trim()) continue;
		const separator = line.indexOf(':');
		if (separator < 1) {
			throw Error('Enter nutrition facts one per line as “Label: value”.');
		}

		const label = line.slice(0, separator).trim().toLowerCase();
		const key = labels.get(label);
		if (!key) throw Error(`Unknown nutrition label: ${line.slice(0, separator).trim()}.`);
		nutrition[key] = line.slice(separator + 1).trim();
	}

	return nutrition;
}

function sourceLabel(recipe) {
	const raw = (recipe.source || '').trim();
	if (!raw) return '';

	if (/^https?:\/\//i.test(raw)) {
		try {
			const host = new URL(raw).hostname.replace(/^(www|m)\./i, '').toLowerCase();
			const names = {
				'allrecipes.com': 'Allrecipes',
				'foodnetwork.com': 'Food Network',
				'bonappetit.com': 'Bon Appétit',
				'nytimes.com': 'New York Times Cooking',
				'marthastewart.com': 'Martha Stewart',
				'foodandwine.com': 'Food & Wine',
				'tasteofhome.com': 'Taste of Home',
			};
			return `Web · ${names[host] || host}`;
		} catch {
			return 'Web';
		}
	}

	if (/^(?:uspca|uscpa|upsca) conference 2015$/i.test(raw)) {
		return 'USPCA Conference (2015)';
	}
	return raw;
}

function recordMeta(recipe) {
	const items = [];
	const source = sourceLabel(recipe);
	const tags = String(recipe.tag_list || '').split(',').map((tag) => tag.trim()).filter(Boolean);
	if (source) items.push(`Source: ${source}`);
	if (tags.length) items.push(`Tags: ${tags.join(' · ')}`);
	return items.join('　|　');
}

async function loadRecipes() {
	const request = ++listRequest;
	const query = $('#query').value.trim();
	const params = new URLSearchParams({
		limit: String(perPage),
		offset: String((page - 1) * perPage),
	});
	if (query) params.set('q', query);

	const response = await fetch(`./api/recipes?${params}`);
	if (!response.ok) {
		const error = await response.json().catch(() => ({}));
		throw Error(error.error || 'Could not load the recipe database.');
	}

	const data = await response.json();
	if (request !== listRequest) return;
	recipes = data.recipes || [];
	totalRecipes = Number(data.total) || 0;
	showRows();

	if (initialLoad) {
		initialLoad = false;
		openSharedRecipe();
	}
}

function refreshSuggestions() {
	$('#tagSuggestions').innerHTML = suggestionTags
		.map((tag) => `<option value="${$safe(tag)}">`)
		.join('');
	$('#sourceSuggestions').innerHTML = suggestionSources
		.map((source) => `<option value="${$safe(source)}">`)
		.join('');
}

async function loadSuggestions() {
	if (!suggestionsPromise) {
		suggestionsPromise = fetch('./api/recipes/suggestions')
			.then(async (response) => {
				if (!response.ok) throw Error('Could not load tag and source suggestions.');
				const data = await response.json();
				suggestionTags = data.tags || [];
				suggestionSources = data.sources || [];
				refreshSuggestions();
			})
			.catch((error) => {
				suggestionsPromise = null;
				throw error;
			});
	}
	return suggestionsPromise;
}

function showRows() {
	const maxPage = Math.max(1, Math.ceil(totalRecipes / perPage));
	page = Math.min(page, maxPage);

	if (!recipes.length) {
		$('#listing').innerHTML = totalRecipes
			? '<div class="empty">Loading recipes…</div>'
			: '<div class="empty">No recipes found. Try another search.</div>';
		$('#pager').innerHTML = '';
		return;
	}

	const body = recipes.map((recipe) => {
		const key = recipe.recipe_key || recipe.key;
		const preview = (recipe.preview || '').replace(/\s+/g, ' ');
		const time = recipe.preparation_time || recipe.cook_time;
		return `<tr class="recipe-row" data-key="${$safe(key)}" tabindex="0">
			<td>
				<div class="name">${$safe(recipe.name || 'Untitled recipe')}</div>
				<span class="sub">${$safe(preview)}</span>
				${recordMeta(recipe) ? `<span class="sub record-meta">${$safe(recordMeta(recipe))}</span>` : ''}
			</td>
			<td class="data">${recipe.servings ? $safe(recipe.servings) : '—'}</td>
			<td class="data">${time ? `${$safe(time)} min` : '—'}</td>
			<td>
				<button class="open" data-view="${$safe(key)}">View</button>
				<button class="share" data-share="${$safe(key)}">Share</button>
			</td>
		</tr>`;
	}).join('');

	$('#listing').innerHTML = `<div class="table-wrap">
		<table class="table">
			<thead><tr><th>Recipe</th><th>Serves</th><th>Time</th><th></th></tr></thead>
			<tbody>${body}</tbody>
		</table>
	</div>`;

	const first = (page - 1) * perPage + 1;
	const last = Math.min(page * perPage, totalRecipes);
	$('#pager').innerHTML = `<span>${first}–${last} of ${totalRecipes} recipes</span>
		<span>
			<button class="pagebtn" id="prev" ${page === 1 ? 'disabled' : ''}>Previous</button>
			<button class="pagebtn" id="next" ${page === maxPage ? 'disabled' : ''}>Next</button>
		</span>`;
	$('#prev').onclick = () => {
		page--;
		loadRecipes().catch(showLoadError);
	};
	$('#next').onclick = () => {
		page++;
		loadRecipes().catch(showLoadError);
	};

	document.querySelectorAll('.recipe-row').forEach((row) => {
		row.onclick = (event) => {
			if (!event.target.closest('button')) detailByKey(row.dataset.key);
		};
		row.onkeydown = (event) => {
			if ((event.key === 'Enter' || event.key === ' ') && event.target === row) {
				event.preventDefault();
				detailByKey(row.dataset.key);
			}
		};
	});
	document.querySelectorAll('[data-view]').forEach((button) => {
		button.onclick = (event) => {
			event.stopPropagation();
			detailByKey(button.dataset.view);
		};
	});
	document.querySelectorAll('[data-share]').forEach((button) => {
		button.onclick = (event) => {
			event.stopPropagation();
			shareRecipe({ key: button.dataset.share });
		};
	});
}

function showLoadError(error) {
	$('#listing').innerHTML = `<div class="load-error">${$safe(error.message)}</div>`;
}

async function detailByKey(key) {
	if (recipeCache.has(key)) {
		detail(recipeCache.get(key));
		return;
	}

	$('#modalTitle').textContent = 'Loading recipe…';
	$('#modalBody').innerHTML = '<p class="source-credit">Fetching recipe details…</p>';
	$('#overlay').classList.add('open');

	try {
		const response = await fetch(`./api/recipes/${encodeURIComponent(key)}`);
		const data = await response.json().catch(() => ({}));
		if (!response.ok) throw Error(data.error || 'Could not load this recipe.');
		recipeCache.set(key, data.recipe);
		detail(data.recipe);
	} catch (error) {
		$('#modalTitle').textContent = 'Could not load recipe';
		$('#modalBody').textContent = error.message;
	}
}

function recipeUrl(recipe) {
	const url = new URL(location.href);
	url.search = '';
	url.hash = '';
	url.searchParams.set('recipe', recipe.key);
	return url.href;
}

async function shareRecipe(recipe) {
	if (!recipe) return;
	const url = recipeUrl(recipe);
	$('#shareUrl').value = url;
	$('#sharePanel').hidden = false;
	$('#copyState').textContent = 'Copying link…';

	try {
		await navigator.clipboard.writeText(url);
		$('#copyState').textContent = 'Link copied to clipboard. You can also select it above.';
	} catch {
		$('#copyState').textContent = 'Select the link above to copy it.';
	}
	$('#shareUrl').focus();
	$('#shareUrl').select();
}

async function copyShareLink() {
	const input = $('#shareUrl');
	input.focus();
	input.select();
	try {
		await navigator.clipboard.writeText(input.value);
		$('#copyState').textContent = 'Link copied to clipboard.';
	} catch {
		$('#copyState').textContent = 'Link selected. Use your browser’s Copy command.';
	}
}

function detail(recipe) {
	if (!recipe) return;
	currentRecipe = recipe;
	const sections = [
		['About', recipe.description],
		['Ingredients', recipe.ingredients],
		['Method', recipe.directions],
		['Reheating', recipe.reheating_instructions],
		['Notes', recipe.comments],
	].filter(([, value]) => value && String(value).trim());
	const meta = [
		recipe.servings ? `Serves ${recipe.servings}` : '',
		recipe.preparation_time ? `Prep ${recipe.preparation_time} min` : '',
		recipe.cook_time ? `Cook ${recipe.cook_time} min` : '',
		recipe.rating ? `Rating ${recipe.rating}` : '',
	].filter(Boolean).join('　·　');
	const nutrition = nutritionFields
		.map(([key, label]) => [label, recipe.nutrition?.[key]])
		.filter(([, value]) => value !== '' && value != null);
	const nutritionHtml = nutrition.length
		? `<section class="detail-section nutrition">
			<h3>Nutrition · as recorded</h3>
			<dl>${nutrition.map(([name, value]) => `<div><dt>${$safe(name)}</dt><dd>${$safe(value)}</dd></div>`).join('')}</dl>
		</section>`
		: '';

	const rawSource = (recipe.source || '').trim();
	const isUrl = /^https?:\/\//i.test(rawSource);
	let label = rawSource ? '' : 'No source recorded';
	if (isUrl) {
		try {
			label = `Web · ${new URL(rawSource).hostname.replace(/^(www|m)\./i, '')}`;
		} catch {
			label = 'Web';
		}
	}
	const sourceHtml = `<section class="detail-section">
		<h3>Source</h3>
		<p class="source-credit">${$safe(label)}${isUrl ? `<br><a href="${$safe(rawSource)}" target="_blank" rel="noopener noreferrer">Open original recipe ↗</a>` : ''}</p>
	</section>`;
	const tags = String(recipe.tag_list || '').split(',').map((tag) => tag.trim()).filter(Boolean);
	const tagsHtml = tags.length
		? `<section class="detail-section">
			<h3>Tags</h3>
			<ul class="tags">${tags.map((tag) => `<li>${$safe(tag)}</li>`).join('')}</ul>
		</section>`
		: '';

	$('#modalTitle').textContent = recipe.name || 'Recipe';
	$('#modalBody').innerHTML = (meta ? `<div class="detail-meta">${$safe(meta)}</div>` : '')
		+ sections.map(([title, value]) => `<section class="detail-section"><h3>${$safe(title)}</h3><p>${$safe(value)}</p></section>`).join('')
		+ sourceHtml + tagsHtml + nutritionHtml;
	$('#modalShare').onclick = () => shareRecipe(recipe);
	$('#editFromDetail').onclick = () => openEditor(recipe);
	$('#overlay').classList.add('open');
}

async function apiWrite(url, method, payload) {
	const response = await fetch(url, {
		method,
		headers: { 'content-type': 'application/json' },
		body: payload === undefined ? undefined : JSON.stringify(payload),
	});
	const data = response.status === 204 ? null : await response.json().catch(() => null);
	if (!response.ok) throw Error(data?.error || 'Could not save changes.');
	return data;
}

function openEditor(recipe = null) {
	loadSuggestions().catch(() => {});
	editingKey = recipe?.key || null;
	$('#editorTitle').textContent = recipe ? 'Edit recipe' : 'Add a recipe';
	$('#formMessage').textContent = '';
	$('#deleteRecipe').hidden = !recipe;
	$('#formFields').innerHTML = fields.map((key) => {
		if (key === 'nutrition') {
			return `<div class="field wide">
				<label for="field-nutrition">Nutrition facts</label>
				<textarea id="field-nutrition" name="nutrition" rows="8" placeholder="Calories: 250\nProtein: 12 g">${$safe(nutritionText(recipe?.nutrition))}</textarea>
			</div>`;
		}

		const wide = longFields.has(key) || key === 'source';
		const label = key.replaceAll('_', ' ');
		const list = key === 'source' ? 'sourceSuggestions' : key === 'tag_list' ? 'tagSuggestions' : '';
		const value = recipe?.[key] ?? '';
		return `<div class="field ${wide ? 'wide' : ''}">
			<label for="field-${key}">${$safe(label)}</label>
			${longFields.has(key)
				? `<textarea id="field-${key}" name="${key}" ${list ? `list="${list}"` : ''}>${$safe(value)}</textarea>`
				: `<input id="field-${key}" name="${key}" type="text" ${list ? `list="${list}"` : ''} value="${$safe(value)}" autocomplete="off">`}
		</div>`;
	}).join('');
	$('#overlay').classList.remove('open');
	$('#editorOverlay').classList.add('open');
	$('#formFields input, #formFields textarea')[1]?.focus();
}

function closeEditor() {
	$('#editorOverlay').classList.remove('open');
}

$('#recipeForm').onsubmit = async (event) => {
	event.preventDefault();
	$('#formMessage').textContent = 'Saving…';
	$('#saveRecipe').disabled = true;
	const formData = new FormData(event.currentTarget);
	const payload = {};

	try {
		for (const key of fields) {
			payload[key] = key === 'nutrition'
				? parseNutritionText(formData.get('nutrition'))
				: formData.get(key) || '';
		}
		const data = await apiWrite(
			editingKey ? `./api/recipes/${encodeURIComponent(editingKey)}` : './api/recipes',
			editingKey ? 'PUT' : 'POST',
			payload,
		);

		if (editingKey) {
			recipeCache.set(editingKey, data.recipe);
			const index = recipes.findIndex((item) => (item.recipe_key || item.key) === editingKey);
			if (index >= 0) {
				Object.assign(recipes[index], {
					...data.recipe,
					recipe_key: editingKey,
					preview: (data.recipe.description || data.recipe.ingredients || '').slice(0, 320),
				});
			}
		} else {
			recipeCache.set(data.key, data.recipe);
			recipes.unshift({
				recipe_key: data.key,
				...data.recipe,
				preview: (data.recipe.description || data.recipe.ingredients || '').slice(0, 320),
			});
			totalRecipes++;
		}

		const savedRecipe = data.recipe;
		suggestionTags = [...new Set([
			...suggestionTags,
			...String(savedRecipe.tag_list || '').split(',').map((tag) => tag.trim()).filter(Boolean),
		])].sort((a, b) => a.localeCompare(b));
		if (savedRecipe.source) {
			suggestionSources = [...new Set([...suggestionSources, savedRecipe.source])]
				.sort((a, b) => a.localeCompare(b));
		}
		refreshSuggestions();
		page = 1;
		loadRecipes().catch(showLoadError);
		closeEditor();
		if (currentRecipe && currentRecipe.key === editingKey) detail(recipeCache.get(editingKey));
	} catch (error) {
		$('#formMessage').textContent = error.message;
	} finally {
		$('#saveRecipe').disabled = false;
	}
};

$('#deleteRecipe').onclick = async () => {
	if (!editingKey || !confirm('Delete this recipe permanently?')) return;
	$('#formMessage').textContent = 'Deleting…';
	try {
		await apiWrite(`./api/recipes/${encodeURIComponent(editingKey)}`, 'DELETE');
		recipeCache.delete(editingKey);
		recipes = recipes.filter((recipe) => (recipe.recipe_key || recipe.key) !== editingKey);
		totalRecipes = Math.max(0, totalRecipes - 1);
		page = 1;
		loadRecipes().catch(showLoadError);
		closeEditor();
		close();
	} catch (error) {
		$('#formMessage').textContent = error.message;
	}
};

function close() {
	$('#overlay').classList.remove('open');
}

function openSharedRecipe() {
	const key = new URLSearchParams(location.search).get('recipe');
	if (key) detailByKey(key);
}

$('#query').oninput = () => {
	page = 1;
	clearTimeout(searchTimer);
	searchTimer = setTimeout(() => loadRecipes().catch(showLoadError), 250);
};
$('#newRecipe').onclick = () => openEditor();
$('#copyLink').onclick = copyShareLink;
$('#shareClose').onclick = () => $('#sharePanel').hidden = true;
$('#close').onclick = close;
$('#editorClose').onclick = closeEditor;
$('#overlay').onclick = (event) => {
	if (event.target === $('#overlay')) close();
};
$('#editorOverlay').onclick = (event) => {
	if (event.target === $('#editorOverlay')) closeEditor();
};
document.addEventListener('keydown', (event) => {
	if (event.key === 'Escape') {
		close();
		closeEditor();
	}
});

loadRecipes().catch((error) => {
	$('#listing').innerHTML = `<div class="load-error">
		${$safe(error.message)}<br><br>
		For local development, run <code>npx wrangler pages dev .</code> after setting up the D1 binding.
	</div>`;
});
