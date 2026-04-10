/* ============================================
   ShopBase — Application Logic (v2)
   Receipt, WhatsApp Share & Shop Settings
   ============================================ */

(function () {
    'use strict';

    // ===== DATA LAYER =====
    const STORAGE_KEY = 'shopbase_data';
    const SETTINGS_KEY = 'shopbase_settings';

    function getData() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return { customers: [], version: 1 };
            return JSON.parse(raw);
        } catch {
            return { customers: [], version: 1 };
        }
    }

    function saveData(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    function getSettings() {
        try {
            const raw = localStorage.getItem(SETTINGS_KEY);
            if (!raw) return { shopName: 'My Shop', shopPhone: '', shopAddress: '', gst: '', tagline: '' };
            return JSON.parse(raw);
        } catch {
            return { shopName: 'My Shop', shopPhone: '', shopAddress: '', gst: '', tagline: '' };
        }
    }

    function saveSettings(settings) {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
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

    // ===== DOM REFS =====
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const splash = $('#splash-screen');
    const app = $('#app');
    const viewHome = $('#view-home');
    const viewProfile = $('#view-profile');

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
    const formCustomer = $('#form-customer');
    const formTransaction = $('#form-transaction');
    const formSettings = $('#form-settings');

    // Toast
    const toastEl = $('#toast');
    const toastMessage = $('#toast-message');

    // ===== SPLASH =====
    function initApp() {
        setTimeout(() => {
            splash.classList.add('hidden');
            app.classList.remove('hidden');
            renderCustomerList();

            // First-time setup: prompt to configure shop
            const settings = getSettings();
            if (settings.shopName === 'My Shop') {
                setTimeout(() => {
                    showToast('👋 Welcome! Set up your shop first');
                    setTimeout(() => openSettingsModal(), 1200);
                }, 600);
            }
        }, 2200);
    }

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

    // ===== RENDER CUSTOMER LIST =====
    function renderCustomerList(filter = '') {
        const data = getData();
        let customers = data.customers || [];

        // Sort: most recent first
        customers.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        // Filter
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

        if (filter) {
            listTitle.textContent = 'Search Results';
        } else {
            listTitle.textContent = 'All Customers';
        }

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
            item.style.animationDelay = `${index * 0.05}s`;
            item.setAttribute('role', 'button');
            item.setAttribute('tabindex', '0');
            item.innerHTML = `
                <div class="customer-avatar ${index % 2 === 1 ? 'alt' : ''}">${initials}</div>
                <div class="customer-info">
                    <div class="customer-name">${escapeHtml(customer.name)}</div>
                    <div class="customer-phone">${formatPhone(customer.phone)}</div>
                </div>
                <div class="customer-meta">
                    <div class="customer-txn-count">${txns.length} transaction${txns.length !== 1 ? 's' : ''}</div>
                    <div class="customer-last-visit">${lastVisit}</div>
                    ${totalPending > 0 ? `<div class="customer-pending-badge">₹${formatAmount(totalPending)} due</div>` : ''}
                </div>
            `;

            item.addEventListener('click', () => goToProfile(customer.id));
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') goToProfile(customer.id);
            });

            customerListEl.appendChild(item);
        });

        updateStats();
    }

    // ===== RENDER PROFILE =====
    function renderProfile() {
        const data = getData();
        const customer = data.customers.find(c => c.id === currentCustomerId);
        if (!customer) {
            goHome();
            return;
        }

        const initials = getInitials(customer.name);
        profileAvatar.textContent = initials;
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

    // ===== RENDER TRANSACTIONS =====
    function renderTransactions(transactions, customer) {
        transactionListEl.innerHTML = '';

        if (transactions.length === 0) {
            emptyTransactions.classList.remove('hidden');
            return;
        }

        emptyTransactions.classList.add('hidden');

        // Sort by date descending
        const sorted = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

        sorted.forEach((txn, index) => {
            const item = document.createElement('div');
            item.className = 'transaction-item';
            item.style.animationDelay = `${index * 0.05}s`;

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
                    <button class="txn-action-btn receipt" data-txn-id="${txn.id}" title="View Receipt">
                        🧾 Receipt
                    </button>
                    <button class="txn-action-btn whatsapp" data-txn-id="${txn.id}" title="Share on WhatsApp">
                        📱 WhatsApp
                    </button>
                    <button class="txn-action-btn delete" data-txn-id="${txn.id}" title="Delete">
                        🗑️ Delete
                    </button>
                </div>
            `;

            transactionListEl.appendChild(item);
        });

        // Attach action handlers
        transactionListEl.querySelectorAll('.txn-action-btn.delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteTransaction(btn.dataset.txnId);
            });
        });

        transactionListEl.querySelectorAll('.txn-action-btn.receipt').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                showReceipt(btn.dataset.txnId, customer);
            });
        });

        transactionListEl.querySelectorAll('.txn-action-btn.whatsapp').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                shareOnWhatsApp(btn.dataset.txnId, customer);
            });
        });
    }

    // ===== RECEIPT =====
    function showReceipt(txnId, customer) {
        const txn = (customer.transactions || []).find(t => t.id === txnId);
        if (!txn) return;

        const settings = getSettings();
        const receiptNum = generateReceiptNumber();

        // Store current receipt data for sharing
        currentReceiptData = { txn, customer, settings, receiptNum };

        // Fill receipt
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

        // Items
        const itemsEl = $('#receipt-items');
        itemsEl.innerHTML = `
            <tr>
                <td>${escapeHtml(txn.item)}</td>
                <td>₹${formatAmount(txn.amount)}</td>
            </tr>
        `;

        // Total
        $('#receipt-total').textContent = `₹${formatAmount(txn.amount)}`;

        // Status line
        const statusLine = $('#receipt-status-line');
        statusLine.className = 'receipt-status-line ' + txn.status;
        if (txn.status === 'paid') {
            statusLine.textContent = '✅ PAID IN FULL';
        } else if (txn.status === 'pending') {
            statusLine.textContent = `⏳ PAYMENT PENDING — ₹${formatAmount(txn.amount)}`;
        } else if (txn.status === 'partial') {
            const paid = txn.paidAmount || 0;
            const remaining = txn.amount - paid;
            statusLine.textContent = `🔄 PARTIAL — Paid ₹${formatAmount(paid)}, Due ₹${formatAmount(remaining)}`;
        }

        openModal(modalReceipt);
    }

    function generateReceiptText(data) {
        const { txn, customer, settings, receiptNum } = data;
        const divider = '━━━━━━━━━━━━━━━━━━━━━━';

        let text = '';
        text += `🧾 *${settings.shopName || 'My Shop'}*\n`;
        if (settings.shopAddress) text += `📍 ${settings.shopAddress}\n`;
        if (settings.shopPhone) text += `📞 ${formatPhone(settings.shopPhone)}\n`;
        text += `${divider}\n`;
        text += `*Receipt #${receiptNum}*\n`;
        text += `📅 Date: ${formatDateFull(new Date(txn.date).getTime())}\n`;
        text += `${divider}\n`;
        text += `*Bill To:*\n`;
        text += `👤 ${customer.name}\n`;
        text += `📞 ${formatPhone(customer.phone)}\n`;
        text += `${divider}\n`;
        text += `*Item:* ${txn.item}\n`;
        text += `*Amount:* ₹${formatAmount(txn.amount)}\n`;
        text += `${divider}\n`;
        text += `*TOTAL: ₹${formatAmount(txn.amount)}*\n`;

        if (txn.status === 'paid') {
            text += `✅ *PAID IN FULL*\n`;
        } else if (txn.status === 'pending') {
            text += `⏳ *PAYMENT PENDING*\n`;
            text += `💰 Due: ₹${formatAmount(txn.amount)}\n`;
        } else if (txn.status === 'partial') {
            const paid = txn.paidAmount || 0;
            const remaining = txn.amount - paid;
            text += `🔄 *PARTIAL PAYMENT*\n`;
            text += `💰 Paid: ₹${formatAmount(paid)} | Due: ₹${formatAmount(remaining)}\n`;
        }

        if (txn.notes) {
            text += `\n📝 _${txn.notes}_\n`;
        }

        text += `${divider}\n`;
        text += `Thank you for your purchase! 🙏\n`;
        text += `_Powered by ShopBase_`;

        return text;
    }

    // ===== WHATSAPP SHARE =====
    function shareOnWhatsApp(txnId, customer) {
        const txn = (customer.transactions || []).find(t => t.id === txnId);
        if (!txn) return;

        const settings = getSettings();
        const receiptNum = generateReceiptNumber();
        const data = { txn, customer, settings, receiptNum };
        const text = generateReceiptText(data);

        // Clean phone number — remove non-digits, add country code if needed
        let phone = customer.phone.replace(/\D/g, '');
        if (phone.length === 10) {
            phone = '91' + phone; // Add India country code
        }

        const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
        showToast('Opening WhatsApp... 📱');
    }

    function shareCurrentReceiptOnWhatsApp() {
        if (!currentReceiptData) return;
        const text = generateReceiptText(currentReceiptData);

        let phone = currentReceiptData.customer.phone.replace(/\D/g, '');
        if (phone.length === 10) {
            phone = '91' + phone;
        }

        const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
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
            name: name.trim(),
            phone: phone.trim(),
            email: email.trim(),
            address: address.trim(),
            notes: notes.trim(),
            transactions: [],
            createdAt: Date.now()
        };
        data.customers.push(customer);
        saveData(data);
        return customer;
    }

    function updateCustomer(id, name, phone, email, address, notes) {
        const data = getData();
        const customer = data.customers.find(c => c.id === id);
        if (customer) {
            customer.name = name.trim();
            customer.phone = phone.trim();
            customer.email = email.trim();
            customer.address = address.trim();
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
            item: item.trim(),
            amount: parseFloat(amount) || 0,
            date,
            status,
            paidAmount: status === 'partial' ? (parseFloat(paidAmount) || 0) : undefined,
            notes: notes.trim(),
            createdAt: Date.now()
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

    // ===== MODALS =====
    function openModal(modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    function closeModal(modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }

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
        const today = new Date().toISOString().split('T')[0];
        $('#input-date').value = today;
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
        if (status === 'partial') {
            group.classList.remove('hidden');
        } else {
            group.classList.add('hidden');
        }
    }

    // ===== HELPERS =====
    function getInitials(name) {
        if (!name) return '?';
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return parts[0].slice(0, 2).toUpperCase();
    }

    function formatPhone(phone) {
        if (!phone) return '';
        const digits = phone.replace(/\D/g, '');
        if (digits.length === 10) {
            return `${digits.slice(0, 5)} ${digits.slice(5)}`;
        }
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
        const diffTime = now - d;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays}d ago`;

        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    }

    function formatDateFull(timestamp) {
        if (!timestamp) return '--';
        return new Date(timestamp).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
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

    // Settings
    $('#btn-settings').addEventListener('click', openSettingsModal);

    // FAB
    $('#fab-add').addEventListener('click', () => openCustomerModal());

    // Back button
    $('#btn-back').addEventListener('click', goHome);

    // Edit customer
    $('#btn-edit-customer').addEventListener('click', () => {
        openCustomerModal(currentCustomerId);
    });

    // Delete customer
    $('#btn-delete-customer').addEventListener('click', () => {
        openModal(modalDelete);
    });

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
    [modalCustomer, modalTransaction, modalDelete, modalReceipt, modalSettings].forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(modal);
        });
    });

    // Partial amount toggle
    $('#input-status').addEventListener('change', togglePartialField);

    // Receipt actions
    $('#btn-share-whatsapp').addEventListener('click', shareCurrentReceiptOnWhatsApp);

    $('#btn-print-receipt').addEventListener('click', () => {
        window.print();
    });

    // Customer form submit
    formCustomer.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = $('#input-name').value;
        const phone = $('#input-phone').value;
        const email = $('#input-email').value;
        const address = $('#input-address').value;
        const notes = $('#input-customer-notes').value;

        if (!name || !phone) {
            showToast('Name and phone are required');
            return;
        }

        if (editingCustomerId) {
            updateCustomer(editingCustomerId, name, phone, email, address, notes);
            closeModal(modalCustomer);
            showToast('Customer updated ✓');
            if (currentCustomerId === editingCustomerId) {
                renderProfile();
            }
        } else {
            const customer = addCustomer(name, phone, email, address, notes);
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

        if (!item || !amount || !date) {
            showToast('Please fill all required fields');
            return;
        }

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
            tagline: $('#input-shop-tagline').value.trim()
        };

        if (!settings.shopName) {
            showToast('Shop name is required');
            return;
        }

        saveSettings(settings);
        closeModal(modalSettings);
        showToast('Shop settings saved ✓');
    });

    // Keyboard: Escape to close modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!modalCustomer.classList.contains('hidden')) closeModal(modalCustomer);
            if (!modalTransaction.classList.contains('hidden')) closeModal(modalTransaction);
            if (!modalDelete.classList.contains('hidden')) closeModal(modalDelete);
            if (!modalReceipt.classList.contains('hidden')) closeModal(modalReceipt);
            if (!modalSettings.classList.contains('hidden')) closeModal(modalSettings);
        }
    });

    // Handle back navigation with browser back button
    window.addEventListener('popstate', () => {
        if (viewProfile.classList.contains('active')) {
            goHome();
        }
    });

    // ===== INIT =====
    initApp();

})();

