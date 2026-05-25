// --- КОНСТАНТИ ТА СТАН ДОДАТКУ ---
const API_URL = 'https://randomuser.me/api/?results=120&inc=name,gender,email,dob,phone,location,picture,registered';
const ITEMS_PER_PAGE = 30;

let state = {
    users: [],
    favorites: JSON.parse(localStorage.getItem('favorites')) || [],
    currentPage: 1,
    scrollLimit: ITEMS_PER_PAGE
};

// --- ЕЛЕМЕНТИ DOM ---
const dom = {
    authScreen: document.getElementById('auth-screen'),
    authForm: document.getElementById('auth-form'),
    mainApp: document.getElementById('main-app'),
    currentUserName: document.getElementById('current-user-name'),
    logoutBtn: document.getElementById('logout-btn'),
    usersGrid: document.getElementById('users-grid'),
    searchInput: document.getElementById('search-input'),
    sortSelect: document.getElementById('sort-select'),
    filterAge: document.getElementById('filter-age'),
    filterLocation: document.getElementById('filter-location'),
    resetBtn: document.getElementById('reset-filters'),
    pagination: document.getElementById('pagination'),
    statusMsg: document.getElementById('status-message'),
    loader: document.getElementById('infinite-loader')
};

// --- СТАРТ ТА АВТОРИЗАЦІЯ ---
document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('fakeUser')) {
        runApp();
    } else {
        dom.authForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const login = document.getElementById('username').value;
            localStorage.setItem('fakeUser', JSON.stringify({ name: login }));
            runApp();
        });
    }
});

function runApp() {
    dom.authScreen.classList.add('hidden');
    dom.mainApp.classList.remove('hidden');

    const user = JSON.parse(localStorage.getItem('fakeUser'));
    dom.currentUserName.textContent = `Привіт, ${user.name}`;

    // Вихід з облікового запису
    dom.logoutBtn.onclick = () => {
        localStorage.removeItem('fakeUser');
        location.reload();
    };

    fetchUsers();
    bindEvents();
}

// --- ОТРИМАННЯ ДАНИХ (Асинхронний запит з обробкою помилок) ---
async function fetchUsers() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('Не вдалося завантажити дані з сервера Random User API.');
        const data = await response.json();

        state.users = data.results;

        readParamsFromURL();
        render();
    } catch (err) {
        showGlobalError(err.message);
    }
}

// --- ЧИСТІ ФУНКЦІЇ ДЛЯ ОБРОБКИ МАСИВІВ (Pure Functions) ---
const getFilteredUsers = (users, filters) => {
    return users.filter(user => {
        const nameStr = `${user.name.first} ${user.name.last}`.toLowerCase();
        const locStr = `${user.location.city} ${user.location.country}`.toLowerCase();

        const matchesSearch = nameStr.includes(filters.search.toLowerCase());
        const matchesGender = filters.gender === 'all' || user.gender === filters.gender;
        const matchesAge = !filters.maxAge || user.dob.age <= parseInt(filters.maxAge);
        const matchesLoc = !filters.location || locStr.includes(filters.location.toLowerCase());

        return matchesSearch && matchesGender && matchesAge && matchesLoc;
    });
};

const getSortedUsers = (users, type) => {
    const copy = [...users];
    if (type === 'name-asc') return copy.sort((a, b) => a.name.first.localeCompare(b.name.first));
    if (type === 'name-desc') return copy.sort((a, b) => b.name.first.localeCompare(a.name.first));
    if (type === 'age-asc') return copy.sort((a, b) => a.dob.age - b.dob.age);
    if (type === 'age-desc') return copy.sort((a, b) => b.dob.age - a.dob.age);
    if (type === 'reg-asc') return copy.sort((a, b) => new Date(a.registered.date) - new Date(b.registered.date));
    if (type === 'reg-desc') return copy.sort((a, b) => new Date(b.registered.date) - new Date(a.registered.date));
    return copy;
};

// --- ОПТИМІЗАЦІЯ: ЧИСТИЙ DEBOUNCE ЧЕРЕЗ ЗАМИКАННЯ ---
function debounce(callee, delayMs) {
    let timerId = null;
    return function perform(...args) {
        const context = this;
        if (timerId !== null) {
            clearTimeout(timerId);
        }
        timerId = setTimeout(() => {
            callee.apply(context, args);
        }, delayMs);
    };
}

// --- HISTORY API (Синхронізація стану з URL) ---
function syncURL(filters, sort, page) {
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.gender !== 'all') params.set('gender', filters.gender);
    if (filters.maxAge) params.set('maxAge', filters.maxAge);
    if (filters.location) params.set('loc', filters.location);
    if (sort !== 'none') params.set('sort', sort);
    if (page > 1) params.set('page', page);

    const currentQuery = params.toString() ? `?${params.toString()}` : window.location.pathname;
    window.history.pushState({}, '', currentQuery);
}

function readParamsFromURL() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('search')) dom.searchInput.value = params.get('search');
    if (params.has('gender')) {
        const radio = document.querySelector(`input[name="gender"][value="${params.get('gender')}"]`);
        if (radio) radio.checked = true;
    }
    if (params.has('maxAge')) dom.filterAge.value = params.get('maxAge');
    if (params.has('loc')) dom.filterLocation.value = params.get('loc');
    if (params.has('sort')) dom.sortSelect.value = params.get('sort');
    if (params.has('page')) state.currentPage = parseInt(params.get('page')) || 1;
}

// --- СЛУХАЧІ ПОДІЙ ТА СИНХРОНІЗАЦІЯ З СКРОЛОМ ---
function bindEvents() {
    const triggerRender = () => { state.currentPage = 1; render(); };
    const debouncedRender = debounce(triggerRender, 300);

    dom.searchInput.addEventListener('input', debouncedRender);
    dom.filterAge.addEventListener('input', triggerRender);
    dom.filterLocation.addEventListener('input', debounce(triggerRender, 300));
    dom.sortSelect.addEventListener('change', render);

    document.querySelectorAll('input[name="gender"]').forEach(radio => {
        radio.addEventListener('change', triggerRender);
    });

    // Скидання фільтрів
    dom.resetBtn.onclick = () => {
        dom.searchInput.value = '';
        dom.sortSelect.value = 'none';
        dom.filterAge.value = '';
        dom.filterLocation.value = '';
        document.querySelector('input[name="gender"][value="all"]').checked = true;
        state.currentPage = 1;
        state.scrollLimit = ITEMS_PER_PAGE;
        render();
    };

    // Довантаження вмісту (Нескінченний скрол в рамках поточної сторінки пагінації)
    window.addEventListener('scroll', () => {
        if ((window.innerHeight + window.scrollY) >= document.documentElement.scrollHeight - 100) {
            if (state.scrollLimit < ITEMS_PER_PAGE * 2) {
                dom.loader.classList.remove('hidden');
                setTimeout(() => {
                    state.scrollLimit += 10;
                    dom.loader.classList.add('hidden');
                    render();
                }, 300);
            }
        }
    });
}

// --- ГОЛОВНИЙ РЕНДЕРІНГ ІНТЕРФЕЙСУ ---
function render() {
    const filters = {
        search: dom.searchInput.value,
        gender: document.querySelector('input[name="gender"]:checked').value,
        maxAge: dom.filterAge.value,
        location: dom.filterLocation.value
    };
    const sort = dom.sortSelect.value;

    // Використовуємо функціональний стиль обробки масивів
    let result = getFilteredUsers(state.users, filters);
    result = getSortedUsers(result, sort);

    const totalCount = result.length;
    const startIndex = (state.currentPage - 1) * ITEMS_PER_PAGE;

    // Отримуємо частину для відображення
    const slicedResult = result.slice(startIndex, startIndex + state.scrollLimit);

    renderCards(slicedResult);
    renderPaginationList(totalCount, state.currentPage);
    syncURL(filters, sort, state.currentPage);
}

function renderCards(usersList) {
    dom.usersGrid.innerHTML = '';

    if (usersList.length === 0) {
        dom.usersGrid.innerHTML = '<p class="loader">Нікого не знайдено за заданими критеріями.</p>';
        return;
    }

    usersList.forEach(user => {
        const isFavorite = state.favorites.includes(user.email);
        const card = document.createElement('div');
        card.className = 'user-card';
        card.innerHTML = `
            <div class="card-header-gradient"></div>
            <div class="avatar-container">
                <img src="${user.picture.large}" alt="avatar">
                <button class="fav-btn ${isFavorite ? 'active' : ''}" data-email="${user.email}">
                    ${isFavorite ? '❤️' : '🖤'}
                </button>
            </div>
            <div class="card-body">
                <div class="user-name">${user.name.first} ${user.name.last}</div>
                <div class="user-sub">${user.gender === 'male' ? 'Чоловік' : 'Жінка'} • ${user.dob.age} років</div>
                <div class="user-info-blocks">
                    <p>📱 <strong>Тел:</strong> ${user.phone}</p>
                    <p>✉️ <strong>Email:</strong> ${user.email}</p>
                    <p>📍 <strong>Місто:</strong> ${user.location.city}, ${user.location.country}</p>
                    <p>📅 <strong>Реєстрація:</strong> ${new Date(user.registered.date).toLocaleDateString()}</p>
                </div>
            </div>
        `;
        dom.usersGrid.appendChild(card);
    });

    // Навішування подій на клік "Обрані" (LocalStorage)
    document.querySelectorAll('.fav-btn').forEach(btn => {
        btn.onclick = (e) => {
            const email = e.currentTarget.dataset.email;
            toggleFavorite(email);
        };
    });
}

function renderPaginationList(totalItems, activePage) {
    dom.pagination.innerHTML = '';
    const pagesCount = Math.ceil(totalItems / ITEMS_PER_PAGE);

    if (pagesCount <= 1) return;

    for (let i = 1; i <= pagesCount; i++) {
        const li = document.createElement('li');
        if (i === activePage) li.className = 'active';

        const btn = document.createElement('button');
        btn.textContent = i;
        btn.onclick = () => {
            state.currentPage = i;
            state.scrollLimit = ITEMS_PER_PAGE; // Скидаємо ліміт скролу для нової сторінки
            window.scrollTo({ top: 0, behavior: 'smooth' });
            render();
        };

        li.appendChild(btn);
        dom.pagination.appendChild(li);
    }
}

// --- ДОДАВАННЯ В ОБРАНІ ---
function toggleFavorite(email) {
    if (state.favorites.includes(email)) {
        state.favorites = state.favorites.filter(item => item !== email);
    } else {
        state.favorites.push(email);
    }
    localStorage.setItem('favorites', JSON.stringify(state.favorites));
    render();
}

// --- ОБРОБКА ПОМИЛОК ІНТЕРФЕЙСУ ---
function showGlobalError(message) {
    dom.statusMsg.textContent = message;
    dom.statusMsg.classList.remove('hidden');
    dom.statusMsg.className = 'status-message error';
}