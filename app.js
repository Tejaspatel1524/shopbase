/* ============================================
   ShopBase — Application Logic (v3)
   Auth, Profile, Receipt & Customer Management
   ============================================ */

(function () {
    'use strict';

    // ===== STORAGE KEYS =====
    const STORAGE_KEY = 'shopbase_data';
    const SETTINGS_KEY = 'shopbase_settings';
    const AUTH_KEY = 'shopbase_auth';

    // ===== DATA LAYER =====
    function getData() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return { customers: [], version: 1 };
            return JSON.parse(raw);
        } catch { return { customers: [], version: 1 }; }
    }

    function saveData(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    function getSettings() {
        try {
            const raw = localStorage.getItem(SETTINGS_KEY);
            if (!raw) return { shopName: '', shopPhone: '', shopAddress: '', gst: '', tagline: '', category: 'general' };
            return JSON.parse(raw);
        } catch { return { shopName: '', shopPhone: '', shopAddress: '', gst: '', tagline: '', category: 'general' }; }
    }

    function saveSettings(settings) {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }

    function getAuth() {
        try {
            const raw = localStorage.getItem(AUTH_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch { return null; }
    }

    function saveAuth(auth) {
        localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    }

    function clearAuth() {
        localStorage.removeItem(AUTH_KEY);
    }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    function generateReceiptNumber() {
        const count = parseInt(localStorage.getItem('shopbase_receipt_count') || '0') + 1;
        localStorage.setItem('shopbase_receipt_count', count.toString());
        return `SB-${count.toString().padStart(4, '0')}`;
    }

    // ===== STATE =====
    let currentCustomerId = null;
    let editingCustomerId = null;
    let statsVisible = false;
    let currentReceiptData = null;
    let authMode = 'login'; // 'login' or 'signup'
    let pendingAuthData = {};

    // ===== DOM REFS =====
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const splash = $('#splash-screen');
    const authContainer = $('#auth-container');
    const app = $('#app');

    const viewHome = $('#view-home');
    const viewProfile = $('#view-profile');
    const viewOwner = $('#view-owner');

    const searchInput = $('#search-input');
    const searchClear = $('#search-clear');
    const customerListEl = $('#customer-list');
    const emptyState = $('#empty-state');
    const noResults = $('#no-results');
    const listTitle = $('#list-title');
    const listCount = $('#list-count');

    const statsPanel = $('#stats-panel');
    const btnStats = $('#btn-stats');

    // Profile
    const profileAvatar = $('#profile-avatar');
    const profileName = $('#profile-name');
    const profilePhone = $('#profile-phone');
    const profileAddress = $('#profile-address');
    const profileNotes = $('#profile-notes');
    const profileDate = $('#profile-date');
    const summaryTotal = $('#summary-total');
    const summaryPending = $('#summary-pending');
    const summaryVisits = $('#summary-visits');
    const transactionListEl = $('#transaction-list');
    const emptyTransactions = $('#empty-transactions');

    // Modals
    const modalCustomer = $('#modal-customer');
    const modalTransaction = $('#modal-transaction');
    const modalDelete = $('#modal-delete');
    const modalReceipt = $('#modal-receipt');
    const modalSettings = $('#modal-settings');
    const modalLogout = $('#modal-logout');
    const formCustomer = $('#form-customer');
    const formTransaction = $('#form-transaction');
    const formSettings = $('#form-settings');

    // Toast
    const toastEl = $('#toast');
    const toastMessage = $('#toast-message');

    // ===== INIT =====
    function initApp() {
        setTimeout(() => {
            splash.classList.add('hidden');

            const auth = getAuth();
            if (auth && auth.isLoggedIn) {
                showMainApp();
            } else {
                showAuth();
            }
        }, 2200);
    }

    function showAuth() {
        authContainer.classList.remove('hidden');
        app.classList.add('hidden');
        showAuthStep('auth-welcome');
    }

    function showMainApp() {
        authContainer.classList.add('hidden');
        app.classList.remove('hidden');
        updateHeaderFromAuth();
        renderCustomerList();
    }

    function updateHeaderFromAuth() {
        const auth = getAuth();
        const settings = getSettings();

        // Update header shop name
        const headerShopName = $('#header-shop-name');
        if (settings.shopName) {
            headerShopName.textContent = settings.shopName;
        } else {
            headerShopName.textContent = 'Your Customers, Your Data';
        }

        // Update owner avatar
        const avatarBtn = $('#owner-avatar-initial');
        if (auth && auth.user && auth.user.name) {
            avatarBtn.textContent = getInitials(auth.user.name);
        } else {
            avatarBtn.textContent = 'U';
        }
    }

    // ===== AUTH FLOW =====
    function showAuthStep(stepId) {
        $$('.auth-step').forEach(s => s.classList.remove('active'));
        const step = $(`#${stepId}`);
        if (step) step.classList.add('active');
    }

    // Look up user by phone number
    function findUserByPhone(phone) {
        const cleanPhone = phone.replace(/\D/g, '');
        try {
            const users = JSON.parse(localStorage.getItem('shopbase_users') || '[]');
            return users.find(u => u.phone.replace(/\D/g, '') === cleanPhone);
        } catch { return null; }
    }

    // Look up user by email
    function findUserByEmail(email) {
        try {
            const users = JSON.parse(localStorage.getItem('shopbase_users') || '[]');
            return users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
        } catch { return null; }
    }

    // Save user to users list
    function saveUser(userData) {
        try {
            const users = JSON.parse(localStorage.getItem('shopbase_users') || '[]');
            const existing = users.findIndex(u => u.id === userData.id);
            if (existing >= 0) {
                users[existing] = userData;
            } else {
                users.push(userData);
            }
            localStorage.setItem('shopbase_users', JSON.stringify(users));
        } catch { /* ignore */ }
    }

    // Complete login
    function completeLogin(user) {
        saveAuth({ isLoggedIn: true, user });
        showMainApp();
        showToast(`Welcome back, ${user.name.split(' ')[0]}! 👋`);
    }

    // Complete signup (go to profile setup)
    function goToSetup() {
        showAuthStep('auth-setup');
    }

    function completeSetup(name, shopName, category, address) {
        const userId = generateId();
        const user = {
            id: userId,
            name,
            phone: pendingAuthData.phone || '',
            email: pendingAuthData.email || '',
            authMethod: pendingAuthData.method || 'phone',
            pin: pendingAuthData.pin || '',
            createdAt: Date.now()
        };

        // Save user
        saveUser(user);

        // Save auth
        saveAuth({ isLoggedIn: true, user });

        // Save settings
        const settings = getSettings();
        settings.shopName = shopName;
        settings.shopPhone = user.phone;
        settings.category = category;
        settings.shopAddress = address;
        saveSettings(settings);

        showMainApp();
        showToast(`Welcome to ShopBase, ${name.split(' ')[0]}! 🎉`);
    }

    // ===== AUTH EVENT LISTENERS =====

    // Welcome → Phone
    $('#btn-auth-phone').addEventListener('click', () => {
        pendingAuthData = { method: 'phone' };
        showAuthStep('auth-phone');
        setTimeout(() => $('#auth-phone-input').focus(), 200);
    });

    // Welcome → Google
    $('#btn-auth-google').addEventListener('click', () => {
        pendingAuthData = { method: 'google' };
        showAuthStep('auth-google-step');
        setTimeout(() => $('#auth-google-email').focus(), 200);
    });

    // Back buttons
    $('#btn-phone-back').addEventListener('click', () => showAuthStep('auth-welcome'));
    $('#btn-pin-back').addEventListener('click', () => {
        if (pendingAuthData.method === 'phone') {
            showAuthStep('auth-phone');
        } else {
            showAuthStep('auth-welcome');
        }
    });
    $('#btn-google-back').addEventListener('click', () => showAuthStep('auth-welcome'));

    // Phone form submit
    $('#form-phone').addEventListener('submit', (e) => {
        e.preventDefault();
        const phone = $('#auth-phone-input').value.replace(/\s/g, '');
        if (phone.length < 10) {
            showToast('Please enter a valid phone number');
            return;
        }

        pendingAuthData.phone = phone;
        const existingUser = findUserByPhone(phone);

        if (existingUser) {
            // Login flow
            authMode = 'login';
            pendingAuthData.existingUser = existingUser;
            $('#pin-title').textContent = 'Enter your PIN';
            $('#pin-desc').textContent = 'Enter your 4-digit PIN to login';
            $('#btn-pin-submit').textContent = 'Login';
        } else {
            // Signup flow
            authMode = 'signup';
            $('#pin-title').textContent = 'Create a PIN';
            $('#pin-desc').textContent = 'Set a 4-digit PIN to secure your account';
            $('#btn-pin-submit').textContent = 'Continue';
        }

        $('#pin-error').classList.add('hidden');
        clearPinBoxes();
        showAuthStep('auth-pin');
        setTimeout(() => $$('.pin-box')[0].focus(), 200);
    });

    // PIN boxes behavior
    $$('.pin-box').forEach((box, index) => {
        box.addEventListener('input', (e) => {
            const val = e.target.value.replace(/\D/g, '');
            e.target.value = val;

            if (val && index < 3) {
                $$('.pin-box')[index + 1].focus();
            }

            // Update filled state
            e.target.classList.toggle('filled', val.length > 0);
        });

        box.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !e.target.value && index > 0) {
                const prev = $$('.pin-box')[index - 1];
                prev.focus();
                prev.value = '';
                prev.classList.remove('filled');
            }
        });

        box.addEventListener('focus', (e) => {
            e.target.select();
        });
    });

    function getPinValue() {
        return Array.from($$('.pin-box')).map(b => b.value).join('');
    }

    function clearPinBoxes() {
        $$('.pin-box').forEach(b => { b.value = ''; b.classList.remove('filled'); });
    }

    // PIN form submit
    $('#form-pin').addEventListener('submit', (e) => {
        e.preventDefault();
        const pin = getPinValue();

        if (pin.length !== 4) {
            showToast('Please enter a 4-digit PIN');
            return;
        }

        if (authMode === 'login') {
            // Verify PIN
            if (pendingAuthData.existingUser && pendingAuthData.existingUser.pin === pin) {
                completeLogin(pendingAuthData.existingUser);
            } else {
                $('#pin-error').classList.remove('hidden');
                clearPinBoxes();
                setTimeout(() => $$('.pin-box')[0].focus(), 100);
            }
        } else {
            // Signup: store PIN and go to setup
            pendingAuthData.pin = pin;
            goToSetup();
        }
    });

    // Google form submit
    $('#form-google').addEventListener('submit', (e) => {
        e.preventDefault();
        const email = $('#auth-google-email').value.trim();

        if (!email) {
            showToast('Please enter your email');
            return;
        }

        pendingAuthData.email = email;
        const existingUser = findUserByEmail(email);

        if (existingUser) {
            completeLogin(existingUser);
        } else {
            goToSetup();
        }
    });

    // Setup form submit
    $('#form-setup').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = $('#setup-name').value.trim();
        const shopName = $('#setup-shop').value.trim();
        const category = $('#setup-category').value;
        const address = $('#setup-address').value.trim();

        if (!name || !shopName) {
            showToast('Name and shop name are required');
            return;
        }

        completeSetup(name, shopName, category, address);
    });

    // ===== TOAST =====
    let toastTimer;
    function showToast(message) {
        clearTimeout(toastTimer);
        toastMessage.textContent = message;
        toastEl.classList.remove('hidden');
        toastEl.style.animation = 'toastIn 0.3s cubic-bezier(0.16,1,0.3,1) forwards';
        toastTimer = setTimeout(() => {
            toastEl.style.animation = 'toastOut 0.3s ease forwards';
            setTimeout(() => toastEl.classList.add('hidden'), 300);
        }, 2500);
    }

    // ===== NAVIGATION =====
    function showView(viewId) {
        $$('.view').forEach(v => v.classList.remove('active'));
        $(viewId).classList.add('active');
    }

    function goHome() {
        currentCustomerId = null;
        showView('#view-home');
        renderCustomerList();
    }

    function goToProfile(customerId) {
        currentCustomerId = customerId;
        showView('#view-profile');
        renderProfile();
    }

    function goToOwnerProfile() {
        showView('#view-owner');
        renderOwnerProfile();
    }

    // ===== RENDER CUSTOMER LIST =====
    function renderCustomerList(filter = '') {
        const data = getData();
        let customers = data.customers || [];

        customers.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        if (filter) {
            const q = filter.toLowerCase().trim();
            customers = customers.filter(c =>
                c.name.toLowerCase().includes(q) ||
                c.phone.includes(q)
            );
        }

        customerListEl.innerHTML = '';

        if (data.customers.length === 0) {
            emptyState.classList.remove('hidden');
            noResults.classList.add('hidden');
            listCount.textContent = '0';
            return;
        }

        emptyState.classList.add('hidden');

        if (customers.length === 0) {
            noResults.classList.remove('hidden');
            listCount.textContent = '0';
            return;
        }

        noResults.classList.add('hidden');
        listCount.textContent = customers.length;
        listTitle.textContent = filter ? 'Search Results' : 'All Customers';

        customers.forEach((customer, index) => {
            const initials = getInitials(customer.name);
            const txns = customer.transactions || [];
            const totalPending = txns.reduce((sum, t) => {
                if (t.status === 'pending') return sum + (t.amount || 0);
                if (t.status === 'partial') return sum + ((t.amount || 0) - (t.paidAmount || 0));
                return sum;
            }, 0);
            const lastVisit = txns.length > 0
                ? formatDateShort(Math.max(...txns.map(t => new Date(t.date).getTime())))
                : 'No visits';

            const item = document.createElement('div');
            item.className = 'customer-item';
            item.style.animationDelay = `${index * 0.04}s`;
            item.setAttribute('role', 'button');
            item.setAttribute('tabindex', '0');
            item.innerHTML = `
                <div class="customer-avatar ${index % 2 === 1 ? 'alt' : ''}">${initials}</div>
                <div class="customer-info">
                    <div class="customer-name">${escapeHtml(customer.name)}</div>
                    <div class="customer-phone">${formatPhone(customer.phone)}</div>
                </div>
                <div class="customer-meta">
                    <div class="customer-txn-count">${txns.length} txn${txns.length !== 1 ? 's' : ''}</div>
                    <div class="customer-last-visit">${lastVisit}</div>
                    ${totalPending > 0 ? `<div class="customer-pending-badge">₹${formatAmount(totalPending)} due</div>` : ''}
                </div>
            `;

            item.addEventListener('click', () => goToProfile(customer.id));
            item.addEventListener('keydown', (e) => { if (e.key === 'Enter') goToProfile(customer.id); });
            customerListEl.appendChild(item);
        });

        updateStats();
    }

    // ===== RENDER PROFILE =====
    function renderProfile() {
        const data = getData();
        const customer = data.customers.find(c => c.id === currentCustomerId);
        if (!customer) { goHome(); return; }

        profileAvatar.textContent = getInitials(customer.name);
        profileName.textContent = customer.name;
        profilePhone.textContent = `📞 ${formatPhone(customer.phone)}`;
        profilePhone.href = `tel:${customer.phone}`;

        if (customer.address) {
            profileAddress.textContent = `📍 ${customer.address}`;
            profileAddress.classList.remove('hidden');
        } else {
            profileAddress.classList.add('hidden');
        }

        if (customer.notes) {
            profileNotes.textContent = `"${customer.notes}"`;
            profileNotes.classList.remove('hidden');
        } else {
            profileNotes.classList.add('hidden');
        }

        profileDate.textContent = `Customer since ${formatDateFull(customer.createdAt)}`;

        const txns = customer.transactions || [];
        const totalSpent = txns.reduce((sum, t) => sum + (t.amount || 0), 0);
        const totalPending = txns.reduce((sum, t) => {
            if (t.status === 'pending') return sum + (t.amount || 0);
            if (t.status === 'partial') return sum + ((t.amount || 0) - (t.paidAmount || 0));
            return sum;
        }, 0);

        summaryTotal.textContent = `₹${formatAmount(totalSpent)}`;
        summaryPending.textContent = `₹${formatAmount(totalPending)}`;
        summaryVisits.textContent = txns.length;

        renderTransactions(txns, customer);
    }

    // ===== RENDER OWNER PROFILE =====
    function renderOwnerProfile() {
        const auth = getAuth();
        const settings = getSettings();

        if (auth && auth.user) {
            $('#owner-profile-avatar').textContent = getInitials(auth.user.name);
            $('#owner-profile-name').textContent = auth.user.name;

            const contact = auth.user.email || (auth.user.phone ? formatPhone(auth.user.phone) : '');
            $('#owner-profile-contact').textContent = contact;

            const method = auth.user.authMethod === 'google' ? 'Google Account' : 'Phone Login';
            $('#owner-profile-method').textContent = method;
        }

        const categoryLabels = {
            general: 'General Store', electronics: 'Electronics', clothing: 'Clothing & Fashion',
            grocery: 'Grocery', pharmacy: 'Pharmacy', hardware: 'Hardware',
            mobile: 'Mobile & Accessories', jewellery: 'Jewellery', other: 'Other'
        };

        $('#owner-shop-name').textContent = settings.shopName || '--';
        $('#owner-shop-category').textContent = categoryLabels[settings.category] || settings.category || '--';
        $('#owner-shop-phone').textContent = settings.shopPhone ? formatPhone(settings.shopPhone) : '--';
        $('#owner-shop-address').textContent = settings.shopAddress || '--';
        $('#owner-shop-gst').textContent = settings.gst || '--';
    }

    // ===== RENDER TRANSACTIONS =====
    function renderTransactions(transactions, customer) {
        transactionListEl.innerHTML = '';

        if (transactions.length === 0) {
            emptyTransactions.classList.remove('hidden');
            return;
        }

        emptyTransactions.classList.add('hidden');
        const sorted = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

        sorted.forEach((txn, index) => {
            const item = document.createElement('div');
            item.className = 'transaction-item';
            item.style.animationDelay = `${index * 0.04}s`;

            let amountClass = '';
            if (txn.status === 'pending') amountClass = 'pending';
            if (txn.status === 'partial') amountClass = 'partial';

            let partialInfo = '';
            if (txn.status === 'partial' && txn.paidAmount !== undefined) {
                partialInfo = `<div class="txn-partial-info">Paid: ₹${formatAmount(txn.paidAmount)} / ₹${formatAmount(txn.amount)} — Remaining: ₹${formatAmount(txn.amount - txn.paidAmount)}</div>`;
            }

            item.innerHTML = `
                <div class="txn-top">
                    <span class="txn-item-name">${escapeHtml(txn.item)}</span>
                    <span class="txn-amount ${amountClass}">₹${formatAmount(txn.amount)}</span>
                </div>
                <div class="txn-bottom">
                    <span class="txn-date">${formatDateFull(new Date(txn.date).getTime())}</span>
                    <span class="txn-status ${txn.status}">${txn.status}</span>
                </div>
                ${partialInfo}
                ${txn.notes ? `<div class="txn-notes">${escapeHtml(txn.notes)}</div>` : ''}
                <div class="txn-actions">
                    <button class="txn-action-btn receipt" data-txn-id="${txn.id}" title="View Receipt">🧾 Receipt</button>
                    <button class="txn-action-btn whatsapp" data-txn-id="${txn.id}" title="Share on WhatsApp">📱 WhatsApp</button>
                    <button class="txn-action-btn delete" data-txn-id="${txn.id}" title="Delete">🗑️ Delete</button>
                </div>
            `;

            transactionListEl.appendChild(item);
        });

        // Attach handlers
        transactionListEl.querySelectorAll('.txn-action-btn.delete').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); deleteTransaction(btn.dataset.txnId); });
        });
        transactionListEl.querySelectorAll('.txn-action-btn.receipt').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); showReceipt(btn.dataset.txnId, customer); });
        });
        transactionListEl.querySelectorAll('.txn-action-btn.whatsapp').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); shareOnWhatsApp(btn.dataset.txnId, customer); });
        });
    }

    // ===== RECEIPT =====
    function showReceipt(txnId, customer) {
        const txn = (customer.transactions || []).find(t => t.id === txnId);
        if (!txn) return;

        const settings = getSettings();
        const receiptNum = generateReceiptNumber();
        currentReceiptData = { txn, customer, settings, receiptNum };

        $('#receipt-shop-name').textContent = settings.shopName || 'My Shop';
        $('#receipt-shop-address').textContent = settings.shopAddress || '';
        $('#receipt-shop-phone').textContent = settings.shopPhone ? `📞 ${formatPhone(settings.shopPhone)}` : '';
        if (settings.gst) {
            $('#receipt-shop-phone').textContent += ` | GST: ${settings.gst}`;
        }

        $('#receipt-number').textContent = receiptNum;
        $('#receipt-date').textContent = `Date: ${formatDateFull(new Date(txn.date).getTime())}`;
        $('#receipt-customer-name').textContent = customer.name;
        $('#receipt-customer-phone').textContent = `📞 ${formatPhone(customer.phone)}`;

        $('#receipt-items').innerHTML = `<tr><td>${escapeHtml(txn.item)}</td><td>₹${formatAmount(txn.amount)}</td></tr>`;
        $('#receipt-total').textContent = `₹${formatAmount(txn.amount)}`;

        const statusLine = $('#receipt-status-line');
        statusLine.className = 'receipt-status-line ' + txn.status;
        if (txn.status === 'paid') statusLine.textContent = '✅ PAID IN FULL';
        else if (txn.status === 'pending') statusLine.textContent = `⏳ PAYMENT PENDING — ₹${formatAmount(txn.amount)}`;
        else if (txn.status === 'partial') {
            const paid = txn.paidAmount || 0;
            statusLine.textContent = `🔄 PARTIAL — Paid ₹${formatAmount(paid)}, Due ₹${formatAmount(txn.amount - paid)}`;
        }

        openModal(modalReceipt);
    }

    function generateReceiptText(data) {
        const { txn, customer, settings, receiptNum } = data;
        const divider = '━━━━━━━━━━━━━━━━━━━━━━';

        let text = `🧾 *${settings.shopName || 'My Shop'}*\n`;
        if (settings.shopAddress) text += `📍 ${settings.shopAddress}\n`;
        if (settings.shopPhone) text += `📞 ${formatPhone(settings.shopPhone)}\n`;
        text += `${divider}\n*Receipt #${receiptNum}*\n`;
        text += `📅 Date: ${formatDateFull(new Date(txn.date).getTime())}\n${divider}\n`;
        text += `*Bill To:*\n👤 ${customer.name}\n📞 ${formatPhone(customer.phone)}\n${divider}\n`;
        text += `*Item:* ${txn.item}\n*Amount:* ₹${formatAmount(txn.amount)}\n${divider}\n`;
        text += `*TOTAL: ₹${formatAmount(txn.amount)}*\n`;

        if (txn.status === 'paid') text += `✅ *PAID IN FULL*\n`;
        else if (txn.status === 'pending') text += `⏳ *PAYMENT PENDING*\n💰 Due: ₹${formatAmount(txn.amount)}\n`;
        else if (txn.status === 'partial') {
            const paid = txn.paidAmount || 0;
            text += `🔄 *PARTIAL PAYMENT*\n💰 Paid: ₹${formatAmount(paid)} | Due: ₹${formatAmount(txn.amount - paid)}\n`;
        }

        if (txn.notes) text += `\n📝 _${txn.notes}_\n`;
        text += `${divider}\nThank you for your purchase! 🙏\n_Powered by ShopBase_`;
        return text;
    }

    // ===== WHATSAPP =====
    function shareOnWhatsApp(txnId, customer) {
        const txn = (customer.transactions || []).find(t => t.id === txnId);
        if (!txn) return;

        const settings = getSettings();
        const receiptNum = generateReceiptNumber();
        const text = generateReceiptText({ txn, customer, settings, receiptNum });

        let phone = customer.phone.replace(/\D/g, '');
        if (phone.length === 10) phone = '91' + phone;

        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
        showToast('Opening WhatsApp... 📱');
    }

    function shareCurrentReceiptOnWhatsApp() {
        if (!currentReceiptData) return;
        const text = generateReceiptText(currentReceiptData);
        let phone = currentReceiptData.customer.phone.replace(/\D/g, '');
        if (phone.length === 10) phone = '91' + phone;
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
        showToast('Opening WhatsApp... 📱');
    }

    // ===== STATS =====
    function updateStats() {
        const data = getData();
        const customers = data.customers || [];
        const allTxns = customers.flatMap(c => c.transactions || []);

        const totalRevenue = allTxns.reduce((sum, t) => sum + (t.amount || 0), 0);
        const totalPending = allTxns.reduce((sum, t) => {
            if (t.status === 'pending') return sum + (t.amount || 0);
            if (t.status === 'partial') return sum + ((t.amount || 0) - (t.paidAmount || 0));
            return sum;
        }, 0);

        $('#stat-customers').textContent = customers.length;
        $('#stat-transactions').textContent = allTxns.length;
        $('#stat-revenue').textContent = `₹${formatAmount(totalRevenue)}`;
        $('#stat-pending').textContent = `₹${formatAmount(totalPending)}`;
    }

    // ===== CUSTOMER CRUD =====
    function addCustomer(name, phone, email, address, notes) {
        const data = getData();
        const customer = {
            id: generateId(),
            name: name.trim(), phone: phone.trim(), email: email.trim(),
            address: address.trim(), notes: notes.trim(),
            transactions: [], createdAt: Date.now()
        };
        data.customers.push(customer);
        saveData(data);
        return customer;
    }

    function updateCustomer(id, name, phone, email, address, notes) {
        const data = getData();
        const customer = data.customers.find(c => c.id === id);
        if (customer) {
            customer.name = name.trim(); customer.phone = phone.trim();
            customer.email = email.trim(); customer.address = address.trim();
            customer.notes = notes.trim();
            saveData(data);
        }
        return customer;
    }

    function deleteCustomer(id) {
        const data = getData();
        data.customers = data.customers.filter(c => c.id !== id);
        saveData(data);
    }

    // ===== TRANSACTION CRUD =====
    function addTransaction(customerId, item, amount, date, status, paidAmount, notes) {
        const data = getData();
        const customer = data.customers.find(c => c.id === customerId);
        if (!customer) return;
        if (!customer.transactions) customer.transactions = [];

        const txn = {
            id: generateId(),
            item: item.trim(), amount: parseFloat(amount) || 0,
            date, status,
            paidAmount: status === 'partial' ? (parseFloat(paidAmount) || 0) : undefined,
            notes: notes.trim(), createdAt: Date.now()
        };

        customer.transactions.push(txn);
        saveData(data);
        return txn;
    }

    function deleteTransaction(txnId) {
        const data = getData();
        const customer = data.customers.find(c => c.id === currentCustomerId);
        if (!customer) return;
        customer.transactions = (customer.transactions || []).filter(t => t.id !== txnId);
        saveData(data);
        renderProfile();
        showToast('Transaction deleted');
    }

    // ===== EXPORT DATA =====
    function exportData() {
        const data = getData();
        const settings = getSettings();
        const auth = getAuth();

        const exportObj = {
            exportDate: new Date().toISOString(),
            shopName: settings.shopName,
            owner: auth ? auth.user : null,
            settings,
            customers: data.customers
        };

        const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `shopbase-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Data exported successfully ✓');
    }

    // ===== MODALS =====
    function openModal(modal) { modal.classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
    function closeModal(modal) { modal.classList.add('hidden'); document.body.style.overflow = ''; }

    function openCustomerModal(editId = null) {
        editingCustomerId = editId;
        if (editId) {
            const data = getData();
            const customer = data.customers.find(c => c.id === editId);
            if (customer) {
                $('#modal-customer-title').textContent = 'Edit Customer';
                $('#input-name').value = customer.name;
                $('#input-phone').value = customer.phone;
                $('#input-email').value = customer.email || '';
                $('#input-address').value = customer.address || '';
                $('#input-customer-notes').value = customer.notes || '';
                $('#btn-save-customer').textContent = 'Update Customer';
            }
        } else {
            $('#modal-customer-title').textContent = 'Add Customer';
            formCustomer.reset();
            $('#btn-save-customer').textContent = 'Save Customer';
        }
        openModal(modalCustomer);
        setTimeout(() => $('#input-name').focus(), 100);
    }

    function openTransactionModal() {
        formTransaction.reset();
        $('#input-date').value = new Date().toISOString().split('T')[0];
        $('#input-status').value = 'paid';
        togglePartialField();
        openModal(modalTransaction);
        setTimeout(() => $('#input-item').focus(), 100);
    }

    function openSettingsModal() {
        const settings = getSettings();
        $('#input-shop-name').value = settings.shopName || '';
        $('#input-shop-phone').value = settings.shopPhone || '';
        $('#input-shop-address').value = settings.shopAddress || '';
        $('#input-shop-gst').value = settings.gst || '';
        $('#input-shop-tagline').value = settings.tagline || '';
        openModal(modalSettings);
        setTimeout(() => $('#input-shop-name').focus(), 100);
    }

    function togglePartialField() {
        const status = $('#input-status').value;
        const group = $('#partial-amount-group');
        if (status === 'partial') group.classList.remove('hidden');
        else group.classList.add('hidden');
    }

    // ===== HELPERS =====
    function getInitials(name) {
        if (!name) return '?';
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return parts[0].slice(0, 2).toUpperCase();
    }

    function formatPhone(phone) {
        if (!phone) return '';
        const digits = phone.replace(/\D/g, '');
        if (digits.length === 10) return `${digits.slice(0, 5)} ${digits.slice(5)}`;
        return phone;
    }

    function formatAmount(num) {
        if (num === undefined || num === null) return '0';
        return num.toLocaleString('en-IN');
    }

    function formatDateShort(timestamp) {
        if (!timestamp) return '--';
        const d = new Date(timestamp);
        const now = new Date();
        const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays}d ago`;
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    }

    function formatDateFull(timestamp) {
        if (!timestamp) return '--';
        return new Date(timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ===== EVENT LISTENERS =====

    // Search
    searchInput.addEventListener('input', () => {
        const val = searchInput.value;
        searchClear.classList.toggle('hidden', val.length === 0);
        renderCustomerList(val);
    });
    searchClear.addEventListener('click', () => {
        searchInput.value = '';
        searchClear.classList.add('hidden');
        renderCustomerList();
        searchInput.focus();
    });

    // Stats toggle
    btnStats.addEventListener('click', () => {
        statsVisible = !statsVisible;
        statsPanel.classList.toggle('hidden', !statsVisible);
        if (statsVisible) updateStats();
    });

    // Owner profile
    $('#btn-owner-profile').addEventListener('click', goToOwnerProfile);
    $('#btn-owner-back').addEventListener('click', goHome);

    // Edit shop from owner profile
    $('#btn-edit-shop').addEventListener('click', openSettingsModal);

    // Export data
    $('#btn-export-data').addEventListener('click', exportData);

    // Logout
    $('#btn-logout').addEventListener('click', () => openModal(modalLogout));
    $('#btn-cancel-logout').addEventListener('click', () => closeModal(modalLogout));
    $('#modal-logout-close').addEventListener('click', () => closeModal(modalLogout));
    $('#btn-confirm-logout').addEventListener('click', () => {
        clearAuth();
        closeModal(modalLogout);
        app.classList.add('hidden');
        showAuth();
        showToast('Logged out successfully');
    });

    // FAB
    $('#fab-add').addEventListener('click', () => openCustomerModal());

    // Back button
    $('#btn-back').addEventListener('click', goHome);

    // Edit customer
    $('#btn-edit-customer').addEventListener('click', () => openCustomerModal(currentCustomerId));

    // Delete customer
    $('#btn-delete-customer').addEventListener('click', () => openModal(modalDelete));
    $('#btn-cancel-delete').addEventListener('click', () => closeModal(modalDelete));
    $('#modal-delete-close').addEventListener('click', () => closeModal(modalDelete));
    $('#btn-confirm-delete').addEventListener('click', () => {
        if (currentCustomerId) {
            deleteCustomer(currentCustomerId);
            closeModal(modalDelete);
            goHome();
            showToast('Customer deleted');
        }
    });

    // Add transaction button
    $('#btn-add-transaction').addEventListener('click', openTransactionModal);

    // Modal close buttons
    $('#modal-customer-close').addEventListener('click', () => closeModal(modalCustomer));
    $('#modal-transaction-close').addEventListener('click', () => closeModal(modalTransaction));
    $('#modal-receipt-close').addEventListener('click', () => closeModal(modalReceipt));
    $('#modal-settings-close').addEventListener('click', () => closeModal(modalSettings));

    // Close modals on overlay click
    [modalCustomer, modalTransaction, modalDelete, modalReceipt, modalSettings, modalLogout].forEach(modal => {
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(modal); });
    });

    // Partial amount toggle
    $('#input-status').addEventListener('change', togglePartialField);

    // Receipt actions
    $('#btn-share-whatsapp').addEventListener('click', shareCurrentReceiptOnWhatsApp);
    $('#btn-print-receipt').addEventListener('click', () => window.print());

    // Customer form submit
    formCustomer.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = $('#input-name').value;
        const phone = $('#input-phone').value;
        const email = $('#input-email').value;
        const address = $('#input-address').value;
        const notes = $('#input-customer-notes').value;

        if (!name || !phone) { showToast('Name and phone are required'); return; }

        if (editingCustomerId) {
            updateCustomer(editingCustomerId, name, phone, email, address, notes);
            closeModal(modalCustomer);
            showToast('Customer updated ✓');
            if (currentCustomerId === editingCustomerId) renderProfile();
        } else {
            addCustomer(name, phone, email, address, notes);
            closeModal(modalCustomer);
            showToast('Customer added ✓');
            renderCustomerList();
        }
        editingCustomerId = null;
    });

    // Transaction form submit
    formTransaction.addEventListener('submit', (e) => {
        e.preventDefault();
        const item = $('#input-item').value;
        const amount = $('#input-amount').value;
        const date = $('#input-date').value;
        const status = $('#input-status').value;
        const paidAmount = $('#input-paid-amount').value;
        const notes = $('#input-txn-notes').value;

        if (!item || !amount || !date) { showToast('Please fill all required fields'); return; }

        addTransaction(currentCustomerId, item, amount, date, status, paidAmount, notes);
        closeModal(modalTransaction);
        renderProfile();
        showToast('Transaction added ✓');
    });

    // Settings form submit
    formSettings.addEventListener('submit', (e) => {
        e.preventDefault();
        const settings = {
            shopName: $('#input-shop-name').value.trim(),
            shopPhone: $('#input-shop-phone').value.trim(),
            shopAddress: $('#input-shop-address').value.trim(),
            gst: $('#input-shop-gst').value.trim(),
            tagline: $('#input-shop-tagline').value.trim(),
            category: getSettings().category || 'general'
        };

        if (!settings.shopName) { showToast('Shop name is required'); return; }

        saveSettings(settings);
        closeModal(modalSettings);
        updateHeaderFromAuth();

        // If on owner profile, refresh it
        if (viewOwner.classList.contains('active')) renderOwnerProfile();

        showToast('Shop settings saved ✓');
    });

    // Keyboard: Escape to close modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            [modalCustomer, modalTransaction, modalDelete, modalReceipt, modalSettings, modalLogout].forEach(m => {
                if (!m.classList.contains('hidden')) closeModal(m);
            });
        }
    });

    // Handle back navigation
    window.addEventListener('popstate', () => {
        if (viewProfile.classList.contains('active') || viewOwner.classList.contains('active')) goHome();
    });

    // ===== START =====
    initApp();

})();
