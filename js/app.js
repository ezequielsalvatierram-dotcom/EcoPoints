/* ========================================================
   EcoPoints - Logica interactiva de la plataforma
   Navegacion, mapa, puntos, retos, recompensas y administracion
   ======================================================== */

const ecoState = {
    points: 0,
    kgRecycled: 34.8,
    co2Avoided: 45.2,
};

const STORAGE_KEYS = {
    locations: 'ecoAdminLocations',
    rewards: 'ecoAdminRewards',
    challenges: 'ecoAdminChallenges',
    deliveries: 'ecoPendingDeliveries',
    removedLocations: 'ecoRemovedDefaultLocations',
    removedRewards: 'ecoRemovedDefaultRewards',
    removedChallenges: 'ecoRemovedDefaultChallenges',
    challengeProgress: 'ecoChallengeProgress',
    challengeWindows: 'ecoChallengeWindows'
};

const DEFAULT_CHALLENGE_RULES = [
    { id: 'default-challenge-bottles', type: 'weight', material: 'plastic', target: 3, bonus: 180, durationDays: 7 },
    { id: 'default-challenge-aluminum', type: 'weight', material: 'aluminum', target: 1, bonus: 250, durationDays: 7 },
    { id: 'default-challenge-route', type: 'stations', target: 2, bonus: 100, durationDays: 7 }
];

const DEFAULT_LOCATIONS = [
    { id: 'default-point-central', name: 'Punto Verde Central', lat: -17.7833, lng: -63.1821, desc: 'Av. Las Americas #450', hours: 'Lun a Sab 08:00 - 18:00', materials: ['Plastico', 'Vidrio', 'Papel'] },
    { id: 'default-point-north', name: 'EcoEstacion Norte', lat: -17.7650, lng: -63.1780, desc: 'Calle Sucre esq. 3er Anillo', hours: 'Abierto 24/7', materials: ['Plastico PET', 'Aluminio'] },
    { id: 'default-point-campus', name: 'Campus Verde Universitario', lat: -17.7710, lng: -63.1950, desc: 'Ingreso Campus Principal', hours: 'Lun a Vie 07:00 - 21:00', materials: ['Papel/Carton', 'Plastico'] }
];

function readStoredCollection(key) {
    try {
        const saved = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(saved) ? saved : [];
    } catch (error) {
        return [];
    }
}

function saveStoredCollection(key, items) {
    try {
        localStorage.setItem(key, JSON.stringify(items));
        return true;
    } catch (error) {
        return false;
    }
}

function readStoredIdList(key) {
    try {
        const value = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
    } catch (error) {
        return [];
    }
}

function createContentId(prefix) {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

function ensureStoredItemIds(key, prefix) {
    const items = readStoredCollection(key);
    let changed = false;
    items.forEach(item => {
        if (!item.id) {
            item.id = createContentId(prefix);
            changed = true;
        }
    });
    if (changed) saveStoredCollection(key, items);
    return items;
}

function getActiveLocations() {
    const removed = readStoredIdList(STORAGE_KEYS.removedLocations);
    const defaults = DEFAULT_LOCATIONS.filter(location => !removed.includes(location.id));
    return [...defaults, ...ensureStoredItemIds(STORAGE_KEYS.locations, 'point')];
}

let locations = getActiveLocations();
let map = null;
let markers = [];
let selectedLocationIndex = 0;
let lastModalTrigger = null;

function isEcoAdmin() {
    if (typeof getCurrentEcoUser !== 'function') return false;
    const user = getCurrentEcoUser();
    return Boolean(user && user.isAdmin);
}

function renderAdminControls() {
    const isAdmin = isEcoAdmin();
    const reviewPanel = document.getElementById('adminReviewPanel');
    const managerPanel = document.getElementById('adminContentManager');
    const managerShortcut = document.getElementById('adminManageContentShortcut');
    const usersPanel = document.getElementById('adminUsersPanel');
    if (reviewPanel) reviewPanel.hidden = !isAdmin;
    if (managerPanel) managerPanel.hidden = !isAdmin;
    if (usersPanel) usersPanel.hidden = !isAdmin;
    if (managerShortcut) managerShortcut.hidden = !isAdmin;
    ['adminAddPointButton', 'adminAddRewardButton', 'adminAddChallengeButton'].forEach(id => {
        const button = document.getElementById(id);
        if (button) button.hidden = !isAdmin;
    });
}

function showAdminMessage(elementId, message, type) {
    const element = document.getElementById(elementId);
    if (!element) return;
    element.textContent = message;
    element.className = `login-message ${type}`;
}

function openAdminModal(modalId) {
    if (!isEcoAdmin()) {
        alert('Esta funcion esta disponible solamente para la cuenta administradora.');
        return;
    }

    openModalWithFocus(modalId);
}

function scrollToAdminContentManager() {
    if (!isEcoAdmin()) return;
    const panel = document.getElementById('adminContentManager');
    if (!panel) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    panel.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
}


/** Navegacion dinamica entre las secciones de la plataforma. */
function navigateTo(sectionId) {
    document.querySelectorAll('.section').forEach(section => section.classList.remove('active'));
    const target = document.getElementById(`sec-${sectionId}`);
    if (target) target.classList.add('active');

    document.querySelectorAll('.nav-links button').forEach(button => {
        const isActive = button.getAttribute('onclick')?.includes(`'${sectionId}'`) || false;
        button.classList.toggle('active', isActive);
        if (isActive) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
    });

    const navLinks = document.getElementById('navLinks');
    const menuToggle = document.getElementById('menuToggle');
    if (navLinks) navLinks.classList.remove('open');
    if (menuToggle) menuToggle.setAttribute('aria-expanded', 'false');

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });

    if (sectionId === 'puntos') {
        setTimeout(() => {
            initMap();
            if (map) map.invalidateSize();
        }, 200);
    }

    if (sectionId === 'perfil' && typeof renderEcoProfile === 'function') {
        renderEcoProfile();
        renderAdminUsers();
    }

    if (sectionId === 'retos') renderChallengeProgress();
}

function createLocationPopup(location) {
    const content = document.createElement('div');
    const title = document.createElement('strong');
    const address = document.createElement('p');
    const materials = document.createElement('p');

    title.textContent = location.name;
    address.textContent = location.desc;
    materials.textContent = `Acepta: ${(location.materials || []).join(', ')}`;
    content.append(title, address, materials);

    if (location.hours) {
        const hours = document.createElement('p');
        hours.textContent = `Horario: ${location.hours}`;
        content.appendChild(hours);
    }
    if (location.phone) {
        const phone = document.createElement('p');
        phone.textContent = `Telefono: ${location.phone}`;
        content.appendChild(phone);
    }
    if (location.notes) {
        const notes = document.createElement('p');
        notes.textContent = location.notes;
        content.appendChild(notes);
    }
    return content;
}

function addLocationMarker(location) {
    if (!map || typeof L === 'undefined') return null;
    const smallPin = L.icon({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [18, 30],
        iconAnchor: [9, 30],
        popupAnchor: [1, -25],
        shadowSize: [25, 25]
    });
    const marker = L.marker([Number(location.lat), Number(location.lng)], { icon: smallPin }).addTo(map);
    marker.bindPopup(createLocationPopup(location));
    markers.push(marker);
    return marker;
}

/** Inicializar el mapa interactivo y sus puntos registrados. */
function initMap() {
    if (map) {
        map.invalidateSize();
        return;
    }

    const mapDiv = document.getElementById('leafletMap');
    if (!mapDiv || typeof L === 'undefined') return;

    map = L.map('leafletMap').setView([-17.7833, -63.1821], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap colaboradores'
    }).addTo(map);

    locations.forEach(location => addLocationMarker(location));
}

function rebuildMapMarkers() {
    if (!map) return;
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    locations.forEach(location => addLocationMarker(location));
}

function renderLocationsList() {
    const list = document.getElementById('locationsList');
    if (!list) return;

    list.replaceChildren();
    if (!locations.length) {
        const empty = document.createElement('p');
        empty.className = 'admin-empty-message';
        empty.textContent = 'No hay puntos de reciclaje registrados.';
        list.appendChild(empty);
        return;
    }
    locations.forEach((location, index) => {
        const item = document.createElement('div');
        item.className = `location-item${index === selectedLocationIndex ? ' active' : ''}`;
        item.setAttribute('role', 'button');
        item.setAttribute('tabindex', '0');
        item.setAttribute('aria-label', `${location.name}. ${location.desc}. Acepta: ${(location.materials || []).join(', ')}`);
        item.addEventListener('click', () => centerMapOn(index));
        item.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                centerMapOn(index);
            }
        });

        const title = document.createElement('h4');
        title.textContent = location.name;

        const address = document.createElement('p');
        address.textContent = location.desc;

        const optionalDetails = document.createElement('div');
        optionalDetails.className = 'location-optional-details';
        if (location.hours) {
            const hours = document.createElement('p');
            hours.textContent = `Horario: ${location.hours}`;
            optionalDetails.appendChild(hours);
        }
        if (location.phone) {
            const phone = document.createElement('p');
            phone.textContent = `Telefono: ${location.phone}`;
            optionalDetails.appendChild(phone);
        }
        if (location.notes) {
            const notes = document.createElement('p');
            notes.textContent = location.notes;
            optionalDetails.appendChild(notes);
        }

        const tags = document.createElement('div');
        (location.materials || []).forEach(material => {
            const tag = document.createElement('span');
            tag.className = 'tag-pill';
            tag.textContent = material;
            tags.appendChild(tag);
        });

        item.append(title, address);
        if (optionalDetails.childElementCount) item.appendChild(optionalDetails);
        item.appendChild(tags);
        list.appendChild(item);
    });
}

function updateRecycleStationOptions() {
    const select = document.getElementById('recycleStation');
    if (!select) return;

    const previousValue = select.value;
    select.replaceChildren();
    if (!locations.length) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No hay puntos disponibles';
        select.appendChild(option);
        select.disabled = true;
        return;
    }
    select.disabled = false;
    locations.forEach((location, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = location.name;
        select.appendChild(option);
    });

    if (previousValue && Number(previousValue) < locations.length) {
        select.value = previousValue;
    }
}

/** Centrar el mapa en la ubicacion seleccionada. */
function centerMapOn(index) {
    if (!map) initMap();
    const location = locations[index];
    if (!location) return;

    selectedLocationIndex = index;
    if (map) {
        map.setView([Number(location.lat), Number(location.lng)], 15);
        if (markers[index]) markers[index].openPopup();
    }

    renderLocationsList();
}

/** Apertura y cierre de modales. */
function openModalWithFocus(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    lastModalTrigger = document.activeElement;
    modal.classList.add('active');
    const dialog = modal.querySelector('[role="dialog"]');
    if (dialog) dialog.focus();
}

function openRecycleModal(materialKey = '') {
    const typeSelect = document.getElementById('recycleType');
    if (typeSelect && materialKey) {
        const matchingOption = Array.from(typeSelect.options).find(option => option.dataset.material === materialKey);
        if (matchingOption) typeSelect.value = matchingOption.value;
    }
    const weightInput = document.getElementById('recycleWeight');
    if (weightInput) weightInput.value = '';
    openModalWithFocus('modalRecycle');
    updateCalcPreview();
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
    if (lastModalTrigger && typeof lastModalTrigger.focus === 'function') {
        lastModalTrigger.focus();
    }
    lastModalTrigger = null;
}

function updateCalcPreview() {
    const typeSelect = document.getElementById('recycleType');
    const weightInput = document.getElementById('recycleWeight');
    const previewEl = document.getElementById('previewPoints');
    if (!typeSelect || !weightInput || !previewEl) return;

    const rate = parseFloat(typeSelect.value) || 50;
    const weight = parseFloat(weightInput.value) || 0;
    previewEl.innerText = `${Math.round(rate * weight)} EcoPoints estimados`;
}

function handleRecycleSubmit(event) {
    event.preventDefault();

    const currentUser = typeof getCurrentEcoUser === 'function' ? getCurrentEcoUser() : null;
    if (!currentUser) return;

    const typeSelect = document.getElementById('recycleType');
    const weightInput = document.getElementById('recycleWeight');
    const stationSelect = document.getElementById('recycleStation');
    const rate = parseFloat(typeSelect.value) || 50;
    const weight = parseFloat(weightInput.value) || 0;
    if (!Number.isFinite(weight) || weight <= 0) {
        alert('Ingresa un peso valido mayor que cero.');
        return;
    }
    const selectedIndex = stationSelect ? Number(stationSelect.value) : 0;
    const station = locations[selectedIndex] || locations[0];
    const selectedMaterialOption = typeSelect.options[typeSelect.selectedIndex];
    const material = selectedMaterialOption.text.split(' (')[0];
    const materialKey = selectedMaterialOption.dataset.material || inferMaterialKey(material);
    const pending = readStoredCollection(STORAGE_KEYS.deliveries);
    pending.push({
        id: `entrega-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        userEmail: currentUser.email,
        userName: currentUser.name,
        material,
        materialKey,
        weight,
        estimatedPoints: Math.round(rate * weight),
        pointsPerKg: rate,
        stationName: station ? station.name : 'Punto no especificado',
        submittedAt: new Date().toISOString()
    });

    if (!saveStoredCollection(STORAGE_KEYS.deliveries, pending)) {
        alert('No se pudo enviar la entrega para revision. Intentalo nuevamente.');
        return;
    }

    closeModal('modalRecycle');
    alert('La entrega fue enviada para revision. Los EcoPoints se acreditaran cuando la administradora evalúe el peso.');
    if (isEcoAdmin()) renderAdminDeliveries();
}

function redeemBenefit(name, cost) {
    if (ecoState.points < cost) {
        alert(`Necesitas ${cost} EcoPoints para canjear este premio. Tu saldo actual es de ${ecoState.points} pts.`);
        return;
    }

    ecoState.points -= cost;
    updateUIPoints();

    const voucherTitle = document.getElementById('voucherItemName');
    if (voucherTitle) voucherTitle.innerText = name;

    openModalWithFocus('modalVoucher');
}

function updateUIPoints() {
    const currentUser = typeof getCurrentEcoUser === 'function' ? getCurrentEcoUser() : null;
    if (currentUser && typeof setEcoPointsForEmail === 'function') {
        setEcoPointsForEmail(currentUser.email, ecoState.points);
    }
    const formatted = ecoState.points.toLocaleString();
    const headerPoints = document.getElementById('userPointsHeader');
    const heroPoints = document.getElementById('heroPoints');
    const statKg = document.getElementById('statKg');
    const statCo2 = document.getElementById('statCo2');
    const profilePoints = document.getElementById('profilePoints');

    if (headerPoints) headerPoints.innerText = `${formatted} EcoPoints`;
    if (heroPoints) heroPoints.innerText = formatted;
    if (statKg) statKg.innerText = `${ecoState.kgRecycled} kg`;
    if (statCo2) statCo2.innerText = `${ecoState.co2Avoided} kg`;
    if (profilePoints) profilePoints.innerText = `${formatted} EcoPoints`;
}

function createCustomRewardCard(reward) {
    const card = document.createElement('article');
    card.className = 'reward-card custom-admin-card';
    card.dataset.itemId = reward.id || '';

    if (reward.imageData) {
        const image = document.createElement('img');
        image.className = 'reward-img';
        image.src = reward.imageData;
        image.alt = `Imagen de ${reward.name}`;
        image.loading = 'lazy';
        card.appendChild(image);
    }

    const body = document.createElement('div');
    body.className = 'reward-body';
    const details = document.createElement('div');
    const type = document.createElement('span');
    type.className = 'custom-item-label';
    type.textContent = reward.type;
    const title = document.createElement('h3');
    title.className = 'custom-reward-name';
    title.textContent = reward.name;
    const description = document.createElement('p');
    description.className = 'custom-reward-description';
    description.textContent = reward.description;
    details.append(type, title, description);

    const actions = document.createElement('div');
    const cost = document.createElement('div');
    cost.className = 'reward-cost';
    cost.textContent = `${Number(reward.cost).toLocaleString()} EcoPoints`;
    const button = document.createElement('button');
    button.className = 'btn btn-primary custom-reward-button';
    button.type = 'button';
    button.textContent = 'Canjear Recompensa';
    button.addEventListener('click', () => redeemBenefit(reward.name, Number(reward.cost)));
    actions.append(cost, button);

    body.append(details, actions);
    card.append(body);
    return card;
}

function applyRemovedDefaultContent() {
    const removedRewards = readStoredIdList(STORAGE_KEYS.removedRewards);
    const removedChallenges = readStoredIdList(STORAGE_KEYS.removedChallenges);
    document.querySelectorAll('[data-default-reward]').forEach(card => {
        card.hidden = removedRewards.includes(card.dataset.defaultReward);
    });
    document.querySelectorAll('[data-default-challenge]').forEach(card => {
        card.hidden = removedChallenges.includes(card.dataset.defaultChallenge);
    });
}

function renderCustomRewards() {
    const grid = document.getElementById('rewardsGrid');
    if (!grid) return;

    grid.querySelectorAll('[data-admin-created="reward"]').forEach(card => card.remove());
    ensureStoredItemIds(STORAGE_KEYS.rewards, 'reward').forEach(reward => {
        const card = createCustomRewardCard(reward);
        card.dataset.adminCreated = 'reward';
        grid.appendChild(card);
    });
    applyRemovedDefaultContent();
}

function createCustomChallengeCard(challenge) {
    const card = document.createElement('article');
    card.className = 'challenge-card custom-admin-card';
    card.dataset.itemId = challenge.id || '';
    card.dataset.challengeId = challenge.id || '';

    const rule = getCustomChallengeRule(challenge);
    if (rule) {
        card.dataset.challengeType = 'weight';
        card.dataset.challengeMaterial = rule.material;
        card.dataset.challengeTarget = String(rule.target);
        card.dataset.challengeBonus = String(rule.bonus);
    }

    const top = document.createElement('div');
    top.className = 'challenge-top';
    const label = document.createElement('span');
    label.className = 'custom-item-label';
    label.textContent = 'NUEVO RETO';
    const bonus = document.createElement('span');
    bonus.className = 'challenge-bonus';
    bonus.textContent = `+${Number(challenge.bonus).toLocaleString()} EcoPoints`;
    top.append(label, bonus);

    const title = document.createElement('h3');
    title.className = 'challenge-name';
    title.textContent = challenge.name;
    const description = document.createElement('p');
    description.className = 'challenge-desc';
    description.textContent = challenge.description;
    const timeLimit = document.createElement('p');
    timeLimit.className = 'challenge-time-limit';
    timeLimit.textContent = 'Duración del reto';
    card.append(top, title, description, timeLimit);

    if (rule) {
        appendChallengeProgressMarkup(card, rule);
        const registerButton = document.createElement('button');
        registerButton.type = 'button';
        registerButton.className = 'btn btn-outline btn-sm challenge-register-button';
        registerButton.textContent = 'Registrar peso';
        registerButton.addEventListener('click', () => openRecycleModal(rule.material));
        card.appendChild(registerButton);
    } else {
        const note = document.createElement('p');
        note.className = 'challenge-desc challenge-setup-note';
        note.textContent = 'Este reto no tiene una meta de material y peso configurada.';
        card.appendChild(note);
    }
    return card;
}

function inferMaterialKey(value) {
    const text = String(value || '').toLocaleLowerCase('es');
    if (text.includes('plast')) return 'plastic';
    if (text.includes('alumin')) return 'aluminum';
    if (text.includes('papel') || text.includes('cart')) return 'paper';
    if (text.includes('vidrio')) return 'glass';
    return '';
}

function getCustomChallengeRule(challenge) {
    const material = challenge.material || inferMaterialKey(`${challenge.name || ''} ${challenge.description || ''}`);
    const descriptionMatch = String(challenge.description || '').match(/(\d+(?:[.,]\d+)?)\s*kg/i);
    const target = Number(challenge.targetKg) || (descriptionMatch ? Number(descriptionMatch[1].replace(',', '.')) : 0);
    const bonus = Number(challenge.bonus) || 0;
    if (!material || !Number.isFinite(target) || target <= 0 || !Number.isInteger(bonus) || bonus <= 0) return null;
    return { id: challenge.id, type: 'weight', material, target, bonus, durationDays: Number(challenge.durationDays) || 7, createdAt: challenge.createdAt || null };
}

function readChallengeWindows() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.challengeWindows) || '{}');
        return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    } catch (error) {
        return {};
    }
}

function getChallengeWindow(challenge) {
    const id = String(challenge.id || '');
    const durationValue = Number(challenge.durationDays);
    const durationDays = Number.isInteger(durationValue) && durationValue >= 1 && durationValue <= 365
        ? durationValue
        : 7;
    const windows = readChallengeWindows();
    let saved = windows[id];
    let startedAt = saved && saved.startedAt ? Date.parse(saved.startedAt) : NaN;

    if (!Number.isFinite(startedAt)) {
        const storedStart = Date.parse(challenge.createdAt || challenge.startedAt || '');
        startedAt = Number.isFinite(storedStart) ? storedStart : Date.now();
        windows[id] = { startedAt: new Date(startedAt).toISOString(), durationDays };
        try {
            localStorage.setItem(STORAGE_KEYS.challengeWindows, JSON.stringify(windows));
        } catch (error) {
            // El periodo sigue calculandose durante esta carga.
        }
    } else if (!saved.durationDays || Number(saved.durationDays) !== durationDays) {
        saved.durationDays = durationDays;
        windows[id] = saved;
        try {
            localStorage.setItem(STORAGE_KEYS.challengeWindows, JSON.stringify(windows));
        } catch (error) {
            // Se conserva la ventana calculada aunque el almacenamiento este lleno.
        }
    }

    const endsAt = startedAt + durationDays * 24 * 60 * 60 * 1000;
    return {
        startedAt,
        endsAt,
        durationDays,
        expired: Date.now() > endsAt,
        remainingMs: Math.max(0, endsAt - Date.now())
    };
}

function formatChallengeDate(timestamp) {
    return new Date(timestamp).toLocaleDateString('es-BO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

function challengeWindowLabel(windowInfo) {
    if (windowInfo.expired) return `Reto finalizado el ${formatChallengeDate(windowInfo.endsAt)}`;
    const remainingDays = Math.max(1, Math.ceil(windowInfo.remainingMs / (24 * 60 * 60 * 1000)));
    const dayLabel = remainingDays === 1 ? 'día' : 'días';
    return `Duración: ${windowInfo.durationDays} ${windowInfo.durationDays === 1 ? 'día' : 'días'} · Quedan ${remainingDays} ${dayLabel}`;
}

function getActiveChallengeRules() {
    const removed = readStoredIdList(STORAGE_KEYS.removedChallenges);
    const defaults = DEFAULT_CHALLENGE_RULES.filter(rule => !removed.includes(rule.id));
    const custom = ensureStoredItemIds(STORAGE_KEYS.challenges, 'challenge')
        .map(getCustomChallengeRule)
        .filter(Boolean);
    return [...defaults, ...custom];
}

function readChallengeProgressStore() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.challengeProgress) || '{}');
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
            return { users: {}, processedDeliveries: [] };
        }
        return {
            users: saved.users && typeof saved.users === 'object' && !Array.isArray(saved.users) ? saved.users : {},
            processedDeliveries: Array.isArray(saved.processedDeliveries) ? saved.processedDeliveries : []
        };
    } catch (error) {
        return { users: {}, processedDeliveries: [] };
    }
}

function saveChallengeProgressStore(store) {
    try {
        localStorage.setItem(STORAGE_KEYS.challengeProgress, JSON.stringify(store));
        return true;
    } catch (error) {
        return false;
    }
}

function applyApprovedDeliveryToChallengeProgress(delivery, store = readChallengeProgressStore()) {
    if (store.processedDeliveries.includes(delivery.id)) {
        return { store, bonus: 0, details: [], alreadyProcessed: true };
    }

    const email = String(delivery.userEmail || '').trim().toLowerCase();
    if (!email) return { store, bonus: 0, details: [], alreadyProcessed: false };

    const userProgress = store.users[email] || (store.users[email] = {});
    const materialKey = delivery.materialKey || inferMaterialKey(delivery.material);
    const approvedWeight = Number(delivery.approvedWeightKg ?? delivery.weight);
    let bonusTotal = 0;
    const details = [];

    getActiveChallengeRules().forEach(rule => {
        const windowInfo = getChallengeWindow(rule);
        const submittedAt = Date.parse(delivery.submittedAt || new Date().toISOString());
        if (!Number.isFinite(submittedAt) || submittedAt < windowInfo.startedAt || submittedAt > windowInfo.endsAt) return;

        if (rule.type === 'weight') {
            if (rule.material !== materialKey || !Number.isFinite(approvedWeight) || approvedWeight <= 0) return;
            const progress = userProgress[rule.id] || { approvedKg: 0, completedCycles: 0, bonusAwarded: 0 };
            const previousCycles = Number(progress.completedCycles) || 0;
            progress.approvedKg = Math.round(((Number(progress.approvedKg) || 0) + approvedWeight) * 1000) / 1000;
            const completedCycles = Math.floor((progress.approvedKg + 1e-9) / rule.target);
            const newCycles = Math.max(0, completedCycles - previousCycles);
            const awarded = newCycles * rule.bonus;
            progress.completedCycles = completedCycles;
            progress.bonusAwarded = (Number(progress.bonusAwarded) || 0) + awarded;
            userProgress[rule.id] = progress;
            if (awarded > 0) {
                bonusTotal += awarded;
                details.push({ name: rule.id, cycles: newCycles, amount: awarded });
            }
        } else if (rule.type === 'stations') {
            const stationName = String(delivery.stationName || '').trim();
            if (!stationName) return;
            const progress = userProgress[rule.id] || { stations: [], completedCycles: 0, bonusAwarded: 0 };
            if (!Array.isArray(progress.stations)) progress.stations = [];
            if (!progress.stations.includes(stationName)) progress.stations.push(stationName);
            const previousCycles = Number(progress.completedCycles) || 0;
            const completedCycles = Math.floor(progress.stations.length / rule.target);
            const newCycles = Math.max(0, completedCycles - previousCycles);
            const awarded = newCycles * rule.bonus;
            progress.completedCycles = completedCycles;
            progress.bonusAwarded = (Number(progress.bonusAwarded) || 0) + awarded;
            userProgress[rule.id] = progress;
            if (awarded > 0) {
                bonusTotal += awarded;
                details.push({ name: rule.id, cycles: newCycles, amount: awarded });
            }
        }
    });

    store.processedDeliveries.push(delivery.id);
    return { store, bonus: bonusTotal, details, alreadyProcessed: false };
}

function estimateDeliveryChallengeBonus(delivery, approvedWeight) {
    const previewStore = readChallengeProgressStore();
    const preview = applyApprovedDeliveryToChallengeProgress({
        ...delivery,
        approvedWeightKg: Number(approvedWeight)
    }, previewStore);
    return preview.bonus;
}

function appendChallengeProgressMarkup(card, rule) {
    const progressContainer = document.createElement('div');
    progressContainer.className = 'progress-bar-container';
    progressContainer.setAttribute('role', 'progressbar');
    progressContainer.setAttribute('aria-valuemin', '0');
    progressContainer.setAttribute('aria-valuemax', '100');
    progressContainer.setAttribute('aria-valuenow', '0');
    progressContainer.setAttribute('aria-label', `Avance de ${rule.target} kg del reto`);
    const fill = document.createElement('div');
    fill.className = 'progress-bar-fill';
    fill.style.width = '0%';
    progressContainer.appendChild(fill);

    const meta = document.createElement('div');
    meta.className = 'challenge-progress-info';
    const label = document.createElement('span');
    label.className = 'challenge-progress-label';
    label.textContent = `0.0 / ${rule.target.toFixed(1)} kg aprobados`;
    const percent = document.createElement('span');
    percent.className = 'challenge-progress-percent';
    percent.textContent = '0%';
    meta.append(label, percent);
    card.append(progressContainer, meta);
}

function renderChallengeProgress() {
    const user = typeof getCurrentEcoUser === 'function' ? getCurrentEcoUser() : null;
    const email = user ? String(user.email || '').trim().toLowerCase() : '';
    const store = readChallengeProgressStore();
    const userProgress = email ? (store.users[email] || {}) : {};
    const rules = new Map(getActiveChallengeRules().map(rule => [rule.id, rule]));

    document.querySelectorAll('.challenge-card[data-challenge-id]').forEach(card => {
        const id = card.dataset.challengeId;
        const rule = rules.get(id);
        if (!rule) return;
        const progress = userProgress[id] || {};
        const windowInfo = getChallengeWindow(rule);
        const timeLabel = card.querySelector('.challenge-time-limit');
        if (timeLabel) timeLabel.textContent = challengeWindowLabel(windowInfo);
        card.classList.toggle('challenge-expired', windowInfo.expired);
        const actionButton = card.querySelector('button');
        if (actionButton) {
            if (!actionButton.dataset.defaultLabel) actionButton.dataset.defaultLabel = actionButton.textContent.trim();
            actionButton.disabled = windowInfo.expired;
            actionButton.textContent = windowInfo.expired ? 'Reto finalizado' : actionButton.dataset.defaultLabel;
        }
        const fill = card.querySelector('.progress-bar-fill');
        const label = card.querySelector('.challenge-progress-label');
        const percentLabel = card.querySelector('.challenge-progress-percent');
        let percent = 0;
        let text = '';

        if (rule.type === 'weight') {
            const approvedKg = Number(progress.approvedKg) || 0;
            const cycles = Number(progress.completedCycles) || 0;
            const remainder = Math.round((approvedKg - (cycles * rule.target)) * 1000) / 1000;
            percent = cycles > 0 && remainder <= 0.001
                ? 100
                : Math.min(100, (Math.max(0, remainder) / rule.target) * 100);
            text = `${approvedKg.toFixed(1)} kg aprobados`;
            if (cycles > 0) text += ` · ${cycles} ${cycles === 1 ? 'meta completada' : 'metas completadas'}`;
            if (remainder > 0.001) text += ` · ${remainder.toFixed(1)} / ${rule.target.toFixed(1)} kg para la siguiente`;
            else if (cycles === 0) text = `0.0 / ${rule.target.toFixed(1)} kg aprobados`;
        } else {
            const stations = Array.isArray(progress.stations) ? progress.stations : [];
            const cycles = Number(progress.completedCycles) || 0;
            const remainder = stations.length % rule.target;
            percent = cycles > 0 && remainder === 0
                ? 100
                : Math.min(100, (remainder / rule.target) * 100);
            text = `${stations.length} puntos diferentes aprobados`;
            if (cycles > 0) text += ` · ${cycles} ${cycles === 1 ? 'bonificación completada' : 'bonificaciones completadas'}`;
            if (remainder > 0) text += ` · ${remainder} de ${rule.target} para la siguiente`;
            else if (cycles === 0) text = `0 de ${rule.target} puntos diferentes`;
        }

        const progressBar = card.querySelector('.progress-bar-container');
        if (fill) fill.style.width = `${Math.round(percent)}%`;
        if (progressBar) progressBar.setAttribute('aria-valuenow', String(Math.round(percent)));
        if (label) label.textContent = text;
        if (percentLabel) percentLabel.textContent = `${Math.round(percent)}%`;
    });

    const homeTimeLabel = document.getElementById('homeChallengeTimeLimit');
    const homeStatusLabel = document.getElementById('homeChallengeStatus');
    if (homeTimeLabel) {
        const homeRule = DEFAULT_CHALLENGE_RULES.find(rule => rule.id === 'default-challenge-bottles');
        const homeWindow = homeRule ? getChallengeWindow(homeRule) : null;
        homeTimeLabel.textContent = homeWindow ? challengeWindowLabel(homeWindow) : '';
        if (homeStatusLabel && homeWindow) homeStatusLabel.textContent = homeWindow.expired ? 'Reto finalizado' : 'Reto activo';
    }
}

function renderCustomChallenges() {
    const grid = document.getElementById('challengesGrid');
    if (!grid) return;

    grid.querySelectorAll('[data-admin-created="challenge"]').forEach(card => card.remove());
    ensureStoredItemIds(STORAGE_KEYS.challenges, 'challenge').forEach(challenge => {
        const card = createCustomChallengeCard(challenge);
        card.dataset.adminCreated = 'challenge';
        grid.appendChild(card);
    });
    applyRemovedDefaultContent();
}

function renderLoginBonusStatus() {
    const card = document.getElementById('loginBonusCard');
    const message = document.getElementById('loginBonusMessage');
    const button = document.getElementById('claimLoginBonusButton');
    const user = typeof getCurrentEcoUser === 'function' ? getCurrentEcoUser() : null;

    if (!card || !message || !user || user.isAdmin) {
        if (card) card.hidden = true;
        return;
    }

    const claimed = typeof hasLoginBonus === 'function' && hasLoginBonus(user.email);
    message.textContent = claimed
        ? 'Este regalo ya fue reclamado por esta cuenta.'
        : 'Reclama personalmente y sin costo tus 200 EcoPoints de bienvenida. Disponible una sola vez por cuenta.';

    if (button) {
        button.disabled = claimed;
        button.textContent = claimed ? 'Regalo reclamado' : 'Reclamar gratis';
        button.setAttribute('aria-label', claimed ? 'El regalo de bienvenida ya fue reclamado' : 'Reclamar 200 EcoPoints gratis');
    }
    card.hidden = false;
}

/** Acreditar el regalo de bienvenida cuando el usuario pulsa el boton. */
function claimLoginBonus() {
    const user = typeof getCurrentEcoUser === 'function' ? getCurrentEcoUser() : null;
    if (!user || user.isAdmin) return;

    if (typeof hasLoginBonus === 'function' && hasLoginBonus(user.email)) {
        renderLoginBonusStatus();
        return;
    }

    if (typeof grantFirstLoginBonus !== 'function' || !grantFirstLoginBonus(user)) {
        alert('No se pudo reclamar el regalo. Actualiza la pagina e intentalo nuevamente.');
        return;
    }

    ecoState.points = getEcoPointsForEmail(user.email);
    updateUIPoints();
    renderLoginBonusStatus();
    alert('¡Regalo reclamado! Se agregaron 200 EcoPoints a tu cuenta.');
}

function appendAdminManagerRow(container, titleText, detailText, type, id) {
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'admin-manager-item';

    const content = document.createElement('div');
    content.className = 'admin-manager-item-info';
    const title = document.createElement('strong');
    title.textContent = titleText;
    const detail = document.createElement('span');
    detail.textContent = detailText || '';
    content.append(title, detail);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-outline btn-sm admin-delete-button admin-delete-x';
    button.textContent = '×';
    button.setAttribute('aria-label', `Eliminar ${titleText}`);
    button.title = `Eliminar ${titleText}`;
    button.addEventListener('click', () => removeManagedContent(type, id));
    row.append(content, button);
    container.appendChild(row);
}

function renderAdminContentManager() {
    const panel = document.getElementById('adminContentManager');
    if (!panel) return;
    if (!isEcoAdmin()) {
        panel.hidden = true;
        return;
    }
    panel.hidden = false;

    const pointList = document.getElementById('adminManageLocations');
    const rewardList = document.getElementById('adminManageRewards');
    const challengeList = document.getElementById('adminManageChallenges');
    [pointList, rewardList, challengeList].forEach(list => { if (list) list.replaceChildren(); });

    locations.forEach(location => appendAdminManagerRow(pointList, location.name, location.desc, 'location', location.id));

    document.querySelectorAll('[data-default-reward]').forEach(card => {
        if (card.hidden) return;
        const name = card.querySelector('h3')?.textContent.trim() || 'Recompensa';
        const type = card.querySelector('.reward-body span')?.textContent.trim() || 'Catalogo';
        appendAdminManagerRow(rewardList, name, type, 'reward-default', card.dataset.defaultReward);
    });
    ensureStoredItemIds(STORAGE_KEYS.rewards, 'reward').forEach(reward => {
        appendAdminManagerRow(rewardList, reward.name, `${reward.type} · ${Number(reward.cost).toLocaleString()} EcoPoints`, 'reward', reward.id);
    });

    document.querySelectorAll('[data-default-challenge]').forEach(card => {
        if (card.hidden) return;
        const name = card.querySelector('.challenge-name')?.textContent.trim() || 'Reto';
        appendAdminManagerRow(challengeList, name, 'Reto de ejemplo', 'challenge-default', card.dataset.defaultChallenge);
    });
    ensureStoredItemIds(STORAGE_KEYS.challenges, 'challenge').forEach(challenge => {
        appendAdminManagerRow(challengeList, challenge.name, `${Number(challenge.bonus).toLocaleString()} EcoPoints por meta · ${challenge.targetKg || 'Meta sin definir'} kg · ${Number(challenge.durationDays) || 7} días`, 'challenge', challenge.id);
    });

    [[pointList, 'No hay puntos de reciclaje.'], [rewardList, 'No hay recompensas.'], [challengeList, 'No hay retos o misiones.']].forEach(([list, emptyText]) => {
        if (list && !list.childElementCount) {
            const empty = document.createElement('p');
            empty.className = 'admin-empty-message';
            empty.textContent = emptyText;
            list.appendChild(empty);
        }
    });
}

function renderAdminUsers() {
    const panel = document.getElementById('adminUsersPanel');
    const container = document.getElementById('adminRegisteredUsers');
    if (!panel || !container) return;
    if (!isEcoAdmin()) {
        panel.hidden = true;
        return;
    }
    panel.hidden = false;
    container.replaceChildren();

    const accountMap = new Map();
    const adminAccounts = [
        {
            email: adminAccount.email,
            name: localStorage.getItem('ecoAdminProfileName') || adminAccount.name,
            role: 'admin'
        },
        {
            email: demoUserAccount.email,
            name: localStorage.getItem('ecoDemoUserProfileName') || demoUserAccount.name,
            role: 'user'
        }
    ];
    [...adminAccounts, ...(typeof getEcoUsers === 'function' ? getEcoUsers() : [])].forEach(account => {
        const email = String(account.email || '').trim().toLowerCase();
        if (!email) return;
        accountMap.set(email, { ...account, email });
    });

    const accounts = Array.from(accountMap.values()).sort((a, b) => {
        if (a.role === 'admin' && b.role !== 'admin') return -1;
        if (a.role !== 'admin' && b.role === 'admin') return 1;
        return String(a.name || '').localeCompare(String(b.name || ''), 'es');
    });

    if (!accounts.length) {
        const empty = document.createElement('p');
        empty.className = 'admin-empty-message';
        empty.textContent = 'No hay cuentas registradas.';
        container.appendChild(empty);
        return;
    }

    accounts.forEach(account => {
        const row = document.createElement('article');
        row.className = 'admin-user-row';
        const identity = document.createElement('div');
        identity.className = 'admin-user-identity';
        const name = document.createElement('strong');
        name.textContent = account.name || 'Usuario';
        const email = document.createElement('span');
        email.textContent = account.email;
        const role = document.createElement('small');
        role.textContent = account.role === 'admin' ? 'Administradora' : 'Usuario registrado';
        identity.append(name, email, role);

        const balance = document.createElement('strong');
        balance.className = 'admin-user-balance';
        balance.textContent = `${getEcoPointsForEmail(account.email).toLocaleString()} EcoPoints`;
        row.append(identity, balance);
        container.appendChild(row);
    });
}

function removeIdFromStoredList(key, id) {
    const ids = readStoredIdList(key);
    if (!ids.includes(id)) ids.push(id);
    try {
        localStorage.setItem(key, JSON.stringify(ids));
        return true;
    } catch (error) {
        return false;
    }
}

function removeManagedContent(type, id) {
    if (!isEcoAdmin()) return;
    const labels = {
        location: 'este punto de reciclaje',
        'reward-default': 'esta recompensa',
        reward: 'esta recompensa',
        'challenge-default': 'este reto o mision',
        challenge: 'este reto o mision'
    };
    if (!window.confirm(`¿Deseas eliminar ${labels[type] || 'este elemento'}? Esta accion no se puede deshacer desde la plataforma.`)) return;

    let saved = false;
    if (type === 'location') {
        if (DEFAULT_LOCATIONS.some(location => location.id === id)) {
            saved = removeIdFromStoredList(STORAGE_KEYS.removedLocations, id);
        } else {
            const updated = ensureStoredItemIds(STORAGE_KEYS.locations, 'point').filter(item => item.id !== id);
            saved = saveStoredCollection(STORAGE_KEYS.locations, updated);
        }
        if (saved) {
            locations = getActiveLocations();
            selectedLocationIndex = Math.max(0, Math.min(selectedLocationIndex, locations.length - 1));
            renderLocationsList();
            updateRecycleStationOptions();
            rebuildMapMarkers();
        }
    } else if (type === 'reward-default') {
        saved = removeIdFromStoredList(STORAGE_KEYS.removedRewards, id);
        if (saved) applyRemovedDefaultContent();
    } else if (type === 'reward') {
        const updated = ensureStoredItemIds(STORAGE_KEYS.rewards, 'reward').filter(item => item.id !== id);
        saved = saveStoredCollection(STORAGE_KEYS.rewards, updated);
        if (saved) renderCustomRewards();
    } else if (type === 'challenge-default') {
        saved = removeIdFromStoredList(STORAGE_KEYS.removedChallenges, id);
        if (saved) applyRemovedDefaultContent();
    } else if (type === 'challenge') {
        const updated = ensureStoredItemIds(STORAGE_KEYS.challenges, 'challenge').filter(item => item.id !== id);
        saved = saveStoredCollection(STORAGE_KEYS.challenges, updated);
        if (saved) renderCustomChallenges();
    }

    if (!saved) {
        alert('No se pudo eliminar el elemento. Comprueba el espacio disponible en el navegador.');
        return;
    }
    renderAdminContentManager();
}

function renderAdminDeliveries() {
    const container = document.getElementById('adminPendingDeliveries');
    const panel = document.getElementById('adminReviewPanel');
    if (!container || !isEcoAdmin()) return;
    if (panel) panel.hidden = false;

    container.replaceChildren();
    const deliveries = readStoredCollection(STORAGE_KEYS.deliveries);
    if (!deliveries.length) {
        const empty = document.createElement('p');
        empty.className = 'admin-empty-message';
        empty.textContent = 'No hay entregas pendientes de revision.';
        container.appendChild(empty);
        return;
    }

    deliveries.forEach(delivery => {
        const card = document.createElement('article');
        card.className = 'admin-pending-card';

        const heading = document.createElement('h4');
        heading.textContent = delivery.userName || 'Usuario';
        const email = document.createElement('p');
        email.textContent = delivery.userEmail;
        const details = document.createElement('p');
        details.textContent = `${delivery.material} · peso declarado: ${delivery.weight} kg · ${delivery.stationName}`;
        const estimate = document.createElement('p');
        estimate.textContent = `Estimacion automatica: ${Number(delivery.estimatedPoints).toLocaleString()} EcoPoints`;

        const weightLabel = document.createElement('label');
        weightLabel.className = 'form-label';
        weightLabel.htmlFor = `approved-weight-${delivery.id}`;
        weightLabel.textContent = 'Peso verificado por la administradora (kg)';
        const weightInput = document.createElement('input');
        weightInput.className = 'form-control admin-review-weight';
        weightInput.type = 'number';
        weightInput.min = '0.1';
        weightInput.step = '0.1';
        weightInput.id = `approved-weight-${delivery.id}`;
        weightInput.value = String(Number(delivery.weight) || 0);
        const challengeBonusPreview = document.createElement('p');
        challengeBonusPreview.className = 'admin-challenge-bonus-preview';
        const updateBonusPreview = () => {
            const extra = estimateDeliveryChallengeBonus(delivery, Number(weightInput.value));
            challengeBonusPreview.textContent = `Bonificacion acumulada de retos al aprobar: +${extra.toLocaleString()} EcoPoints`;
        };
        weightInput.addEventListener('input', updateBonusPreview);
        updateBonusPreview();

        const pointsLabel = document.createElement('label');
        pointsLabel.className = 'form-label';
        pointsLabel.htmlFor = `approved-points-${delivery.id}`;
        pointsLabel.textContent = 'EcoPoints a acreditar';
        const pointsInput = document.createElement('input');
        pointsInput.className = 'form-control admin-review-points';
        pointsInput.type = 'number';
        pointsInput.min = '0';
        pointsInput.step = '1';
        pointsInput.id = `approved-points-${delivery.id}`;
        pointsInput.value = String(Math.max(0, Number(delivery.estimatedPoints) || 0));
        pointsInput.dataset.manual = 'false';
        pointsInput.addEventListener('input', () => { pointsInput.dataset.manual = 'true'; });
        weightInput.addEventListener('input', () => {
            if (pointsInput.dataset.manual === 'false' && Number.isFinite(Number(delivery.pointsPerKg))) {
                pointsInput.value = String(Math.round(Number(delivery.pointsPerKg) * (Number(weightInput.value) || 0)));
            }
        });

        const actions = document.createElement('div');
        actions.className = 'admin-review-actions';
        const approveButton = document.createElement('button');
        approveButton.type = 'button';
        approveButton.className = 'btn btn-primary btn-sm';
        approveButton.textContent = 'Aprobar y acreditar';
        approveButton.addEventListener('click', () => approveDelivery(delivery.id));
        const rejectButton = document.createElement('button');
        rejectButton.type = 'button';
        rejectButton.className = 'btn btn-outline btn-sm';
        rejectButton.textContent = 'Rechazar';
        rejectButton.addEventListener('click', () => rejectDelivery(delivery.id));
        actions.append(approveButton, rejectButton);

        card.append(heading, email, details, estimate, weightLabel, weightInput, challengeBonusPreview, pointsLabel, pointsInput, actions);
        container.appendChild(card);
    });
}

function approveDelivery(deliveryId) {
    if (!isEcoAdmin()) return;
    const pointsInput = document.getElementById(`approved-points-${deliveryId}`);
    const weightInput = document.getElementById(`approved-weight-${deliveryId}`);
    const points = pointsInput ? Number(pointsInput.value) : NaN;
    const approvedWeight = weightInput ? Number(weightInput.value) : NaN;
    if (!Number.isInteger(points) || points < 0) {
        alert('Ingresa una cantidad valida de EcoPoints para acreditar.');
        return;
    }
    if (!Number.isFinite(approvedWeight) || approvedWeight <= 0) {
        alert('Ingresa un peso verificado mayor que cero.');
        return;
    }

    const deliveries = readStoredCollection(STORAGE_KEYS.deliveries);
    const index = deliveries.findIndex(item => item.id === deliveryId);
    if (index === -1) return;
    const delivery = { ...deliveries[index], approvedWeightKg: approvedWeight };
    const previousProgress = readChallengeProgressStore();
    const progressResult = applyApprovedDeliveryToChallengeProgress(delivery, readChallengeProgressStore());
    if (progressResult.alreadyProcessed) {
        const remaining = deliveries.filter(item => item.id !== deliveryId);
        saveStoredCollection(STORAGE_KEYS.deliveries, remaining);
        renderAdminDeliveries();
        alert('Esta entrega ya habia sido procesada. No se acreditaron puntos duplicados.');
        return;
    }

    const currentBalance = getEcoPointsForEmail(delivery.userEmail);
    const totalCredit = points + progressResult.bonus;
    const updatedDeliveries = deliveries.filter(item => item.id !== deliveryId);

    if (!saveChallengeProgressStore(progressResult.store)) {
        alert('No se pudo guardar el avance de los retos. No se modifico el saldo.');
        return;
    }
    if (!setEcoPointsForEmail(delivery.userEmail, currentBalance + totalCredit)) {
        saveChallengeProgressStore(previousProgress);
        alert('No se pudo actualizar el saldo del usuario.');
        return;
    }
    if (!saveStoredCollection(STORAGE_KEYS.deliveries, updatedDeliveries)) {
        setEcoPointsForEmail(delivery.userEmail, currentBalance);
        saveChallengeProgressStore(previousProgress);
        alert('No se pudo cerrar la revision. Se revirtieron el saldo y el avance. Intentalo nuevamente.');
        return;
    }

    renderAdminDeliveries();
    renderAdminUsers();
    const bonusMessage = progressResult.bonus > 0
        ? ` Incluye +${progressResult.bonus.toLocaleString()} EcoPoints de bonificacion por retos.`
        : '';
    alert(`Se acreditaron ${points.toLocaleString()} EcoPoints por la entrega a ${delivery.userName || delivery.userEmail}.${bonusMessage}`);
}

function rejectDelivery(deliveryId) {
    if (!isEcoAdmin()) return;
    const deliveries = readStoredCollection(STORAGE_KEYS.deliveries);
    const updated = deliveries.filter(item => item.id !== deliveryId);
    if (!saveStoredCollection(STORAGE_KEYS.deliveries, updated)) {
        alert('No se pudo actualizar la lista de entregas.');
        return;
    }
    renderAdminDeliveries();
}

function renderClassificationImageFallbacks() {
    document.querySelectorAll('.waste-category-image').forEach(image => {
        const frame = image.closest('.waste-image-frame');
        if (!frame) return;
        const update = () => frame.classList.toggle('image-missing', !image.complete || image.naturalWidth === 0);
        image.addEventListener('load', update);
        image.addEventListener('error', update);
        if (image.complete) update();
    });
}

function handleAdminPointSubmit(event) {
    event.preventDefault();
    if (!isEcoAdmin()) return;

    const name = document.getElementById('newPointName').value.trim();
    const address = document.getElementById('newPointAddress').value.trim();
    const latText = document.getElementById('newPointLat').value.trim();
    const lngText = document.getElementById('newPointLng').value.trim();
    const lat = Number(latText);
    const lng = Number(lngText);
    const materials = document.getElementById('newPointMaterials').value
        .split(',')
        .map(material => material.trim())
        .filter(Boolean);
    const hours = document.getElementById('newPointHours').value.trim();
    const phone = document.getElementById('newPointPhone').value.trim();
    const notes = document.getElementById('newPointNotes').value.trim();

    if (!name || !address || !materials.length || !latText || !lngText || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        showAdminMessage('adminPointMessage', 'Completa los campos obligatorios e ingresa coordenadas validas.', 'error');
        return;
    }

    const newLocation = {
        id: createContentId('point'),
        name,
        lat,
        lng,
        desc: address,
        materials,
        hours,
        phone,
        notes
    };
    const savedLocations = readStoredCollection(STORAGE_KEYS.locations);
    savedLocations.push(newLocation);

    if (!saveStoredCollection(STORAGE_KEYS.locations, savedLocations)) {
        showAdminMessage('adminPointMessage', 'No se pudo guardar el punto en este navegador.', 'error');
        return;
    }

    locations.push(newLocation);
    renderLocationsList();
    updateRecycleStationOptions();
    if (!map) {
        initMap();
    } else {
        addLocationMarker(newLocation);
    }
    centerMapOn(locations.length - 1);
    renderAdminContentManager();

    document.getElementById('adminPointForm').reset();
    closeModal('modalAddPoint');
    alert('El nuevo punto de reciclaje se agrego correctamente.');
}

function isSupportedRewardImage(file) {
    return Boolean(file && ['image/jpeg', 'image/png', 'image/webp'].includes(file.type));
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada.'));
        reader.readAsDataURL(file);
    });
}

async function optimizeRewardImage(file) {
    if (!isSupportedRewardImage(file)) {
        throw new Error('Selecciona una imagen JPG, PNG o WebP.');
    }
    if (file.size > 8 * 1024 * 1024) {
        throw new Error('La imagen debe pesar menos de 8 MB.');
    }

    const source = await readFileAsDataUrl(file);
    const image = new Image();
    image.src = source;
    if (typeof image.decode === 'function') {
        await image.decode();
    } else {
        await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = () => reject(new Error('El archivo seleccionado no se pudo abrir como imagen.'));
        });
    }

    const maxDimension = 900;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo preparar la imagen.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    if (!blob) throw new Error('No se pudo comprimir la imagen.');
    return readFileAsDataUrl(blob);
}

function previewRewardImage() {
    const input = document.getElementById('newRewardImage');
    const preview = document.getElementById('newRewardImagePreview');
    if (!input || !preview) return;
    const file = input.files && input.files[0];
    if (!file) {
        preview.hidden = true;
        preview.removeAttribute('src');
        return;
    }
    if (!isSupportedRewardImage(file)) {
        showAdminMessage('adminRewardMessage', 'Selecciona una imagen JPG, PNG o WebP.', 'error');
        input.value = '';
        preview.hidden = true;
        return;
    }
    if (preview.dataset.objectUrl) URL.revokeObjectURL(preview.dataset.objectUrl);
    preview.dataset.objectUrl = URL.createObjectURL(file);
    preview.src = preview.dataset.objectUrl;
    preview.hidden = false;
}

async function handleAdminRewardSubmit(event) {
    event.preventDefault();
    if (!isEcoAdmin()) return;

    const type = document.getElementById('newRewardType').value;
    const name = document.getElementById('newRewardName').value.trim();
    const description = document.getElementById('newRewardDescription').value.trim();
    const cost = Number(document.getElementById('newRewardCost').value);
    const imageInput = document.getElementById('newRewardImage');
    const imageFile = imageInput && imageInput.files ? imageInput.files[0] : null;

    if (!name || !description || !Number.isInteger(cost) || cost < 1 || !imageFile) {
        showAdminMessage('adminRewardMessage', 'Completa los datos, selecciona una imagen e ingresa un costo mayor que cero.', 'error');
        return;
    }

    try {
        const imageData = await optimizeRewardImage(imageFile);
        const rewards = ensureStoredItemIds(STORAGE_KEYS.rewards, 'reward');
        rewards.push({ id: createContentId('reward'), type, name, description, cost, imageData });

        if (!saveStoredCollection(STORAGE_KEYS.rewards, rewards)) {
            showAdminMessage('adminRewardMessage', 'No se pudo guardar la recompensa. Puede que el almacenamiento del navegador este lleno.', 'error');
            return;
        }

        renderCustomRewards();
        renderAdminContentManager();
        document.getElementById('adminRewardForm').reset();
        const preview = document.getElementById('newRewardImagePreview');
        if (preview) {
            if (preview.dataset.objectUrl) URL.revokeObjectURL(preview.dataset.objectUrl);
            delete preview.dataset.objectUrl;
            preview.hidden = true;
            preview.removeAttribute('src');
        }
        closeModal('modalAddReward');
        alert('La nueva recompensa y su imagen se agregaron correctamente.');
    } catch (error) {
        showAdminMessage('adminRewardMessage', error.message || 'No se pudo cargar la imagen.', 'error');
    }
}

function handleAdminChallengeSubmit(event) {
    event.preventDefault();
    if (!isEcoAdmin()) return;

    const name = document.getElementById('newChallengeName').value.trim();
    const description = document.getElementById('newChallengeDescription').value.trim();
    const bonus = Number(document.getElementById('newChallengeBonus').value);
    const material = document.getElementById('newChallengeMaterial').value;
    const targetKg = Number(document.getElementById('newChallengeTargetKg').value);
    const durationDays = Number(document.getElementById('newChallengeDuration').value);

    if (!name || !description || !Number.isInteger(bonus) || bonus < 1 || !material || !Number.isFinite(targetKg) || targetKg <= 0 || !Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365) {
        showAdminMessage('adminChallengeMessage', 'Completa los datos, define una meta mayor que cero y establece una duración de 1 a 365 días.', 'error');
        return;
    }

    const challenges = readStoredCollection(STORAGE_KEYS.challenges);
    const challenge = { id: createContentId('challenge'), name, description, bonus, material, targetKg, durationDays, createdAt: new Date().toISOString() };
    challenges.push(challenge);

    if (!saveStoredCollection(STORAGE_KEYS.challenges, challenges)) {
        showAdminMessage('adminChallengeMessage', 'No se pudo guardar el reto en este navegador.', 'error');
        return;
    }

    getChallengeWindow(challenge);
    renderCustomChallenges();
    renderChallengeProgress();
    renderAdminContentManager();
    document.getElementById('adminChallengeForm').reset();
    closeModal('modalAddChallenge');
    alert('El nuevo reto ambiental se agrego correctamente.');
}

window.addEventListener('DOMContentLoaded', () => {
    const currentUser = typeof getCurrentEcoUser === 'function' ? getCurrentEcoUser() : null;
    ecoState.points = currentUser && typeof getEcoPointsForEmail === 'function'
        ? getEcoPointsForEmail(currentUser.email)
        : 0;
    updateUIPoints();
    renderAdminControls();
    renderAdminDeliveries();
    renderAdminUsers();
    renderClassificationImageFallbacks();
    renderLocationsList();
    updateRecycleStationOptions();
    renderCustomRewards();
    renderCustomChallenges();
    renderChallengeProgress();
    applyRemovedDefaultContent();
    renderLoginBonusStatus();
    renderAdminContentManager();

    const rewardImageInput = document.getElementById('newRewardImage');
    if (rewardImageInput) rewardImageInput.addEventListener('change', previewRewardImage);

    const menuToggle = document.getElementById('menuToggle');
    const navLinks = document.getElementById('navLinks');
    if (menuToggle && navLinks) {
        menuToggle.addEventListener('click', () => {
            const isOpen = navLinks.classList.toggle('open');
            menuToggle.setAttribute('aria-expanded', String(isOpen));
            menuToggle.setAttribute('aria-label', isOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación');
        });
    }

    const pointForm = document.getElementById('adminPointForm');
    const rewardForm = document.getElementById('adminRewardForm');
    const challengeForm = document.getElementById('adminChallengeForm');
    if (pointForm) pointForm.addEventListener('submit', handleAdminPointSubmit);
    if (rewardForm) rewardForm.addEventListener('submit', handleAdminRewardSubmit);
    if (challengeForm) challengeForm.addEventListener('submit', handleAdminChallengeSubmit);

    document.addEventListener('keydown', event => {
        const activeModal = document.querySelector('.modal-overlay.active');
        if (!activeModal) return;

        if (event.key === 'Escape') {
            closeModal(activeModal.id);
            return;
        }

        if (event.key === 'Tab') {
            const focusable = Array.from(activeModal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
                .filter(element => element.offsetParent !== null);
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    });

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', event => {
            if (event.target === overlay) closeModal(overlay.id);
        });
    });
});
