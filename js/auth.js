/* ========================================================
   EcoPoints - Inicio de sesion y registro de usuarios
   Gestion de cuentas locales y control de acceso
   ======================================================== */

const USERS_STORAGE_KEY = 'ecoUsers';
const ADMIN_PROFILE_NAME_KEY = 'ecoAdminProfileName';
const DEMO_USER_PROFILE_NAME_KEY = 'ecoDemoUserProfileName';
const ECO_POINTS_BALANCES_KEY = 'ecoPointsBalances';
const LOGIN_BONUS_CLAIMS_KEY = 'ecoLoginBonusManualClaims';
const LEGACY_LOGIN_BONUS_CLAIMS_KEY = 'ecoLoginBonusClaims';
const LOGIN_BONUS_MIGRATION_KEY = 'ecoLoginBonusManualMigrationDone';
const LOGIN_BONUS_AMOUNT = 200;

/** Leer el saldo individual de cada cuenta. */
function getEcoPointsBalances() {
    try {
        const saved = JSON.parse(localStorage.getItem(ECO_POINTS_BALANCES_KEY) || '{}');
        return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    } catch (error) {
        return {};
    }
}

/** Obtener los EcoPoints de una cuenta. Las cuentas de usuario comienzan en cero. */
function getEcoPointsForEmail(email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const balances = getEcoPointsBalances();
    if (Object.prototype.hasOwnProperty.call(balances, normalizedEmail)) {
        const savedBalance = Number(balances[normalizedEmail]);
        return Number.isFinite(savedBalance) ? Math.max(0, Math.floor(savedBalance)) : 0;
    }
    return normalizedEmail === adminAccount.email ? 1450 : 0;
}

/** Guardar el saldo de una cuenta. */
function setEcoPointsForEmail(email, points) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const amount = Number(points);
    if (!normalizedEmail || !Number.isFinite(amount) || amount < 0) return false;
    const balances = getEcoPointsBalances();
    balances[normalizedEmail] = Math.floor(amount);
    try {
        localStorage.setItem(ECO_POINTS_BALANCES_KEY, JSON.stringify(balances));
        return true;
    } catch (error) {
        return false;
    }
}

/** Consultar si una cuenta ya recibio el bono de su primer inicio de sesion. */
function hasLoginBonus(email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    try {
        const claims = JSON.parse(localStorage.getItem(LOGIN_BONUS_CLAIMS_KEY) || '[]');
        return Array.isArray(claims) && claims.includes(normalizedEmail);
    } catch (error) {
        return false;
    }
}

/** Acreditar el regalo de bienvenida cuando el usuario lo reclama. */
function grantFirstLoginBonus(user) {
    if (!user || user.role === 'admin' || user.isAdmin) return false;

    const email = String(user.email || '').trim().toLowerCase();
    if (!email || hasLoginBonus(email)) return false;

    let claims = [];
    try {
        const savedClaims = JSON.parse(localStorage.getItem(LOGIN_BONUS_CLAIMS_KEY) || '[]');
        claims = Array.isArray(savedClaims) ? savedClaims : [];
    } catch (error) {
        return false;
    }

    if (claims.includes(email)) return false;

    const previousBalance = getEcoPointsForEmail(email);
    if (!setEcoPointsForEmail(email, previousBalance + LOGIN_BONUS_AMOUNT)) return false;

    try {
        claims.push(email);
        localStorage.setItem(LOGIN_BONUS_CLAIMS_KEY, JSON.stringify(claims));
        return true;
    } catch (error) {
        setEcoPointsForEmail(email, previousBalance);
        return false;
    }
}

/** Completar el inicio de sesion sin acreditar bonos automaticamente. */
function completeEcoLogin(user) {
    sessionStorage.removeItem('ecoLoginBonusNotice');
    startEcoSession(user);
}

// Cuenta interna con permisos de administracion.
const adminAccount = {
    email: 'andrea@ecopoints.com',
    password: '123456',
    name: 'Andrea',
    role: 'admin'
};

// Cuenta normal de demostracion para probar la experiencia de usuario.
const demoUserAccount = {
    email: 'usuario@ecopoints.com',
    password: '123456',
    name: 'Usuario',
    role: 'user'
};

/** Retirar de los saldos los bonos que la version anterior entregaba automaticamente. */
function migrateAutomaticLoginBonuses() {
    if (localStorage.getItem(LOGIN_BONUS_MIGRATION_KEY) === '1') return;

    try {
        const legacyClaims = JSON.parse(localStorage.getItem(LEGACY_LOGIN_BONUS_CLAIMS_KEY) || '[]');
        const balances = getEcoPointsBalances();

        if (Array.isArray(legacyClaims)) {
            legacyClaims.forEach(emailValue => {
                const email = String(emailValue || '').trim().toLowerCase();
                if (!email || !Object.prototype.hasOwnProperty.call(balances, email)) return;
                const balance = Number(balances[email]);
                if (Number.isFinite(balance)) {
                    balances[email] = Math.max(0, Math.floor(balance - LOGIN_BONUS_AMOUNT));
                }
            });
        }

        localStorage.setItem(ECO_POINTS_BALANCES_KEY, JSON.stringify(balances));
        localStorage.setItem(LOGIN_BONUS_MIGRATION_KEY, '1');
    } catch (error) {
        // La aplicacion seguira funcionando y podra intentar la migracion en otra carga.
    }
}

migrateAutomaticLoginBonuses();

/**
 * Obtener las cuentas registradas en el navegador.
 * @returns {Array} Lista de usuarios registrados.
 */
function getEcoUsers() {
    try {
        const savedUsers = localStorage.getItem(USERS_STORAGE_KEY);
        const users = savedUsers ? JSON.parse(savedUsers) : [];
        return Array.isArray(users) ? users : [];
    } catch (error) {
        return [];
    }
}

/**
 * Guardar la lista de cuentas en el almacenamiento local.
 * @param {Array} users - Cuentas registradas.
 * @returns {boolean} Indica si el guardado fue correcto.
 */
function saveEcoUsers(users) {
    try {
        localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Convertir la contrasena en un resumen SHA-256.
 * Requiere un navegador moderno y ejecutar el proyecto con Live Server.
 * @param {string} password - Contrasena ingresada.
 * @returns {Promise<string>} Resumen hexadecimal de la contrasena.
 */
async function hashPassword(password) {
    if (!window.crypto || !window.crypto.subtle) {
        throw new Error('No se puede proteger la contraseña en este navegador. Ejecuta el proyecto con Live Server.');
    }

    const data = new TextEncoder().encode(password);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);

    return Array.from(new Uint8Array(hashBuffer))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Obtener los datos de la sesion activa.
 * @returns {Object|null} Datos del usuario o null si no hay sesion.
 */
function getEcoSession() {
    const savedSession = sessionStorage.getItem('ecoSession');

    if (!savedSession) return null;

    try {
        const session = JSON.parse(savedSession);
        if (session.role === 'admin' && session.email !== adminAccount.email) {
            session.email = adminAccount.email;
            session.name = localStorage.getItem(ADMIN_PROFILE_NAME_KEY) || adminAccount.name;
            session.role = 'admin';
            sessionStorage.setItem('ecoSession', JSON.stringify(session));
        }
        return session;
    } catch (error) {
        sessionStorage.removeItem('ecoSession');
        return null;
    }
}

/**
 * Guardar la sesion y abrir la plataforma principal.
 * @param {Object} user - Datos basicos de la cuenta.
 */
function startEcoSession(user) {
    sessionStorage.setItem('ecoSession', JSON.stringify({
        email: user.email,
        name: user.name,
        role: user.role || 'user'
    }));

    window.location.href = 'index.html';
}


/**
 * Obtener los datos de la cuenta que tiene la sesion activa.
 * @returns {Object|null} Informacion del usuario actual.
 */
function getCurrentEcoUser() {
    const session = getEcoSession();
    if (!session) return null;

    if (session.email === adminAccount.email) {
        return {
            name: localStorage.getItem(ADMIN_PROFILE_NAME_KEY) || adminAccount.name,
            email: adminAccount.email,
            createdAt: null,
            role: 'admin',
            isAdmin: true,
            isDemo: true,
            points: getEcoPointsForEmail(adminAccount.email)
        };
    }

    if (session.email === demoUserAccount.email) {
        return {
            name: localStorage.getItem(DEMO_USER_PROFILE_NAME_KEY) || demoUserAccount.name,
            email: demoUserAccount.email,
            createdAt: null,
            role: 'user',
            isAdmin: false,
            isDemo: true,
            points: getEcoPointsForEmail(demoUserAccount.email)
        };
    }

    const registeredUser = getEcoUsers().find(user => user.email === session.email);

    if (registeredUser) {
        const role = registeredUser.role || 'user';
        return { ...registeredUser, role, isAdmin: role === 'admin', isDemo: false, points: getEcoPointsForEmail(registeredUser.email) };
    }

    return { ...session, role: 'user', isAdmin: false, createdAt: null, isDemo: false, points: getEcoPointsForEmail(session.email) };
}

/**
 * Convertir una fecha de registro a un formato legible.
 * @param {string|null} value - Fecha almacenada en formato ISO.
 * @returns {string} Fecha formateada o texto alternativo.
 */
function formatProfileDate(value) {
    if (!value) return 'No disponible';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'No disponible';

    return date.toLocaleDateString('es-BO', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });
}

/**
 * Mostrar los datos de la cuenta dentro de la seccion Mi Perfil.
 */
function renderEcoProfile() {
    const user = getCurrentEcoUser();
    if (!user) return;

    const nameInput = document.getElementById('profileNameInput');
    const emailInput = document.getElementById('profileEmailDisplay');
    const displayName = document.getElementById('profileDisplayName');
    const displayEmail = document.getElementById('profileDisplayEmail');
    const accountType = document.getElementById('profileAccountType');
    const createdAt = document.getElementById('profileCreatedAt');
    const avatar = document.getElementById('profileAvatar');

    if (nameInput) nameInput.value = user.name || '';
    if (emailInput) emailInput.value = user.email || '';
    if (displayName) displayName.textContent = user.name || 'Usuario';
    if (displayEmail) displayEmail.textContent = user.email || '';
    if (accountType) accountType.textContent = user.isAdmin ? 'Administradora' : 'Usuario registrado';
    if (createdAt) createdAt.textContent = formatProfileDate(user.createdAt);
    const createdAtItem = document.getElementById('profileCreatedAtItem');
    const accountTypeItem = document.getElementById('profileAccountTypeItem');
    if (createdAtItem) createdAtItem.hidden = !user.createdAt;
    if (accountTypeItem) accountTypeItem.classList.toggle('full-width', !user.createdAt);

    if (avatar) {
        const initials = (user.name || 'EcoPoints')
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map(part => part.charAt(0))
            .join('')
            .toUpperCase();
        avatar.textContent = initials || 'EP';
    }

}

/**
 * Guardar el nombre actualizado del usuario actual.
 * @param {Event} event - Evento de envio del formulario.
 */
function handleProfileUpdate(event) {
    event.preventDefault();

    const nameInput = document.getElementById('profileNameInput');
    const message = document.getElementById('profileMessage');
    const name = nameInput ? nameInput.value.trim() : '';
    const session = getEcoSession();

    if (!session) {
        window.location.replace('login.html');
        return;
    }

    if (name.length < 3) {
        showAuthMessage(message, 'El nombre debe tener al menos 3 caracteres.', 'error');
        return;
    }

    if (name.length > 60) {
        showAuthMessage(message, 'El nombre no puede superar los 60 caracteres.', 'error');
        return;
    }

    if (session.email === adminAccount.email) {
        session.name = name;
        localStorage.setItem(ADMIN_PROFILE_NAME_KEY, name);
        sessionStorage.setItem('ecoSession', JSON.stringify(session));
    } else if (session.email === demoUserAccount.email) {
        session.name = name;
        localStorage.setItem(DEMO_USER_PROFILE_NAME_KEY, name);
        sessionStorage.setItem('ecoSession', JSON.stringify(session));
    } else {
        const users = getEcoUsers();
        const userIndex = users.findIndex(user => user.email === session.email);

        if (userIndex === -1) {
            showAuthMessage(message, 'No se encontro la cuenta registrada en este navegador.', 'error');
            return;
        }

        users[userIndex].name = name;

        if (!saveEcoUsers(users)) {
            showAuthMessage(message, 'No se pudieron guardar los cambios. Intentalo nuevamente.', 'error');
            return;
        }

        session.name = name;
        sessionStorage.setItem('ecoSession', JSON.stringify(session));
    }

    const welcomeName = document.getElementById('ecoWelcomeName');
    if (welcomeName) welcomeName.textContent = `¡Hola, ${name}!`;

    renderEcoProfile();
    showAuthMessage(message, 'Los datos de tu perfil se actualizaron correctamente.', 'success');
}

/**
 * Validar el formulario e iniciar la sesion del usuario.
 * @param {Event} event - Evento de envio del formulario.
 */
async function handleLogin(event) {
    event.preventDefault();

    const emailInput = document.getElementById('loginEmail');
    const passwordInput = document.getElementById('loginPassword');
    const message = document.getElementById('loginMessage');

    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    // Validar primero la cuenta de demostracion existente.
    if (email === adminAccount.email && password === adminAccount.password) {
        completeEcoLogin(adminAccount);
        return;
    }

    if (email === demoUserAccount.email && password === demoUserAccount.password) {
        completeEcoLogin(demoUserAccount);
        return;
    }

    // Buscar una cuenta creada desde el formulario de registro.
    const registeredUser = getEcoUsers().find(user => user.email === email);

    if (!registeredUser) {
        showAuthMessage(message, 'El correo o la contraseña son incorrectos.', 'error');
        return;
    }

    try {
        const passwordHash = await hashPassword(password);

        if (passwordHash !== registeredUser.passwordHash) {
            showAuthMessage(message, 'El correo o la contraseña son incorrectos.', 'error');
            return;
        }

        completeEcoLogin(registeredUser);
    } catch (error) {
        showAuthMessage(message, error.message, 'error');
    }
}

/**
 * Crear una cuenta nueva y comenzar su sesion.
 * @param {Event} event - Evento de envio del formulario.
 */
async function handleRegister(event) {
    event.preventDefault();

    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim().toLowerCase();
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const message = document.getElementById('registerMessage');

    if (name.length < 3) {
        showAuthMessage(message, 'Escribe un nombre de al menos 3 caracteres.', 'error');
        return;
    }

    if (email === adminAccount.email || email === demoUserAccount.email || getEcoUsers().some(user => user.email === email)) {
        showAuthMessage(message, 'Ya existe una cuenta registrada con ese correo.', 'error');
        return;
    }

    if (password.length < 6) {
        showAuthMessage(message, 'La contraseña debe tener al menos 6 caracteres.', 'error');
        return;
    }

    if (password !== confirmPassword) {
        showAuthMessage(message, 'Las contraseñas no coinciden.', 'error');
        return;
    }

    try {
        const users = getEcoUsers();
        const newUser = {
            name,
            email,
            role: 'user',
            points: 0,
            passwordHash: await hashPassword(password),
            createdAt: new Date().toISOString()
        };

        users.push(newUser);

        if (!saveEcoUsers(users)) {
            showAuthMessage(message, 'No se pudo guardar la cuenta en este navegador.', 'error');
            return;
        }

        // Volver al acceso para que el usuario ingrese con sus credenciales y reciba el bono inicial.
        window.location.href = 'login.html?registered=1';
    } catch (error) {
        showAuthMessage(message, error.message, 'error');
    }
}

/**
 * Mostrar mensajes de validacion en los formularios.
 * @param {HTMLElement} element - Elemento que muestra el mensaje.
 * @param {string} text - Texto que se mostrara.
 * @param {string} type - Tipo de mensaje: error o success.
 */
function showAuthMessage(element, text, type) {
    if (!element) return;
    element.textContent = text;
    element.className = `login-message ${type}`;
}

/**
 * Impedir el acceso al panel principal si no existe una sesion activa.
 */
function requireEcoSession() {
    const session = getEcoSession();

    if (!session) {
        window.location.replace('login.html');
        return;
    }

    // Mostrar un saludo personalizado en la seccion de inicio.
    const currentUser = getCurrentEcoUser();
    const welcomeName = document.getElementById('ecoWelcomeName');
    if (welcomeName && currentUser) welcomeName.textContent = `¡Hola, ${currentUser.name}!`;

    renderEcoProfile();
}

/**
 * Cerrar la sesion y volver a la pantalla de inicio de sesion.
 */
function logout() {
    sessionStorage.removeItem('ecoSession');
    window.location.replace('login.html');
}

// Preparar los eventos de autenticacion cuando el documento este listo.
window.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const profileForm = document.getElementById('profileForm');

    if (loginForm) {
        if (getEcoSession()) {
            window.location.replace('index.html');
            return;
        }

        loginForm.addEventListener('submit', handleLogin);

        const params = new URLSearchParams(window.location.search);
        if (params.get('registered') === '1') {
            showAuthMessage(
                document.getElementById('loginMessage'),
                'Tu cuenta fue creada correctamente. Ya puedes iniciar sesión.',
                'success'
            );
        }
    }

    if (registerForm) {
        if (getEcoSession()) {
            window.location.replace('index.html');
            return;
        }

        registerForm.addEventListener('submit', handleRegister);
    }

    if (profileForm) {
        profileForm.addEventListener('submit', handleProfileUpdate);
    }

    if (document.body.dataset.requiresAuth === 'true') {
        requireEcoSession();
    }

    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.addEventListener('click', logout);
    }
});
