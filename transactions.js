// 🌐 Global Variables
let currentUser = null;
let currentPage = 'adminTransactions';
let currentEditTransaction = null;
let currentUserEdit = null;
let deleteTarget = null;

// Cache for better performance
let dataCache = {
    users: null,
    transactions: null,
    union: null,
    lastUpdated: null
};

// =============================
// 📊 Google Sheets Integration
// =============================
class GoogleSheetsAPI {
    constructor() {
        this.apiUrl = "https://script.google.com/macros/s/AKfycbyq2c7sEnYHIS0C09Es-AKltBOGRBWUlgLRe_NkNXGvr6vJsZlkNLss3tGR503lDnJD/exec";
        this.cache = new Map();
        this.localCache = this.initLocalCache();
        this.cacheTimeout = 30 * 1000;
    }

    initLocalCache() {
        try {
            const cached = localStorage.getItem('transaction_cache');
            return cached ? JSON.parse(cached) : {};
        } catch {
            return {};
        }
    }

    saveLocalCache() {
        try {
            localStorage.setItem('transaction_cache', JSON.stringify(this.localCache));
        } catch (e) {
            console.warn('Failed to save cache:', e);
        }
    }

    async getSheet(sheetName, useCache = true) {
        const cacheKey = sheetName;
        const now = Date.now();

        if (useCache && this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (now - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }
        }

        if (useCache && this.localCache[cacheKey]) {
            const cached = this.localCache[cacheKey];
            if (now - cached.timestamp < 5 * 60 * 1000) {
                this.cache.set(cacheKey, cached);
                return cached.data;
            }
        }

        try {
            const url = `${this.apiUrl}?sheet=${encodeURIComponent(sheetName)}&t=${now}`;

            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();

            const cacheData = { data, timestamp: now };
            if (useCache) {
                this.cache.set(cacheKey, cacheData);
                this.localCache[cacheKey] = cacheData;
                this.saveLocalCache();
            }

            return data;
        } catch (error) {
            console.error(`Error fetching ${sheetName}:`, error);
            return { error: error.message };
        }
    }

    async getBatchSheets(sheetNames) {
        const promises = sheetNames.map(name => this.getSheet(name));
        const results = await Promise.all(promises);
        const batchResult = {};
        sheetNames.forEach((name, index) => {
            batchResult[name] = results[index];
        });
        return batchResult;
    }

    clearCache() {
        this.cache.clear();
        this.localCache = {};
        localStorage.removeItem('transaction_cache');
    }

    async addRow(sheetName, row) {
        try {
            const response = await fetch(this.apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    sheet: sheetName,
                    data: JSON.stringify(row)
                })
            });

            const result = await response.json();

            this.cache.delete(sheetName);
            delete this.localCache[sheetName];
            this.saveLocalCache();

            return result;
        } catch (error) {
            return { error: error.message };
        }
    }

    async updatePassword(username, newPassword) {
        try {
            const response = await fetch(this.apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    sheet: "password_updates",
                    data: JSON.stringify([username, newPassword])
                })
            });

            const result = await response.json();

            this.cache.delete("user_credentials");
            delete this.localCache["user_credentials"];
            this.saveLocalCache();

            return result;
        } catch (error) {
            return { error: error.message };
        }
    }

    async uploadFile(username, transactionId, file) {
        try {
            const base64Data = await this.fileToBase64(file);

            const payload = {
                sheet: 'uploads',
                action: 'uploadFile',
                username: username,
                transactionId: transactionId,
                fileName: file.name,
                fileType: file.type,
                fileData: base64Data
            };

            const response = await fetch(this.apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    data: JSON.stringify(payload)
                })
            });

            const result = await response.json();

            this.cache.delete('uploads');
            delete this.localCache['uploads'];
            this.saveLocalCache();

            return result;
        } catch (error) {
            return { error: error.message };
        }
    }

    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = (error) => reject(error);
        });
    }

    async updateTransaction(transactionId, title, mode, amount, billUrl, date) {
        try {
            const payload = {
                action: 'updateTransaction',
                transactionId: transactionId,
                title: title,
                mode: mode,
                amount: amount,
                billUrl: billUrl,
                date: date
            };

            const response = await fetch(this.apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    data: JSON.stringify(payload)
                })
            });

            const result = await response.json();

            this.cache.delete('transaction_master');
            delete this.localCache['transaction_master'];
            this.saveLocalCache();

            return result;
        } catch (error) {
            return { error: error.message };
        }
    }

    async updateUserTransaction(username, transactionId, mode, status, amount, date) {
        try {
            const payload = {
                action: 'updateUserTransaction',
                username: username,
                transactionId: transactionId,
                mode: mode,
                status: status,
                amount: amount,
                date: date
            };

            const response = await fetch(this.apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    data: JSON.stringify(payload)
                })
            });

            const result = await response.json();

            const cacheKey = `${username}_transactions`;
            this.cache.delete(cacheKey);
            delete this.localCache[cacheKey];
            this.saveLocalCache();

            return result;
        } catch (error) {
            return { error: error.message };
        }
    }

    async getUserTransactions(username) {
        try {
            const cacheKey = `${username}_transactions`;
            
            if (this.cache.has(cacheKey)) {
                const cached = this.cache.get(cacheKey);
                if (Date.now() - cached.timestamp < this.cacheTimeout) {
                    return cached.data;
                }
            }

            const response = await fetch(`${this.apiUrl}?sheet=${username}_transactions&t=${Date.now()}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            
            const cacheData = { data, timestamp: Date.now() };
            this.cache.set(cacheKey, cacheData);
            this.localCache[cacheKey] = cacheData;
            this.saveLocalCache();

            return data;
        } catch (error) {
            console.error(`Error fetching user transactions:`, error);
            return { error: error.message };
        }
    }

    async addUser(username, password, fullName, role) {
        try {
            const payload = {
                action: 'addUser',
                username: username,
                password: password,
                fullName: fullName,
                role: role || 'user'
            };

            const response = await fetch(this.apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    data: JSON.stringify(payload)
                })
            });

            const result = await response.json();

            this.cache.delete('user_credentials');
            delete this.localCache['user_credentials'];
            this.saveLocalCache();

            return result;
        } catch (error) {
            return { error: error.message };
        }
    }

    async updateUser(username, fullName, role, newPassword) {
        try {
            const payload = {
                action: 'updateUser',
                username: username,
                fullName: fullName,
                role: role,
                newPassword: newPassword || ''
            };

            const response = await fetch(this.apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    data: JSON.stringify(payload)
                })
            });

            const result = await response.json();

            this.cache.delete('user_credentials');
            delete this.localCache['user_credentials'];
            this.saveLocalCache();

            return result;
        } catch (error) {
            return { error: error.message };
        }
    }

    async addTransactionToAllUsers(transactionId, title, mode, amount, billUrl, date) {
        try {
            const payload = {
                action: 'addTransactionToAllUsers',
                transactionId: transactionId,
                title: title,
                mode: mode,
                amount: amount,
                billUrl: billUrl,
                date: date
            };

            const response = await fetch(this.apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    data: JSON.stringify(payload)
                })
            });

            const result = await response.json();

            this.cache.clear();
            this.localCache = {};
            this.saveLocalCache();

            return result;
        } catch (error) {
            return { error: error.message };
        }
    }

    // =============================
    // 🆕 Union Sheet Operations
    // =============================

    async addUnionTransaction(transactionId, title, type, amount, billUrl, status, date) {
        try {
            const payload = {
                action: 'addUnionTransaction',
                transactionId: transactionId,
                title: title,
                type: type,
                amount: amount,
                billUrl: billUrl,
                status: status,
                date: date
            };

            const response = await fetch(this.apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    data: JSON.stringify(payload)
                })
            });

            const result = await response.json();

            this.cache.delete('union');
            delete this.localCache['union'];
            this.saveLocalCache();

            return result;
        } catch (error) {
            return { error: error.message };
        }
    }

    async updateUnionTransaction(transactionId, title, type, amount, billUrl, status, date) {
        try {
            const payload = {
                action: 'updateUnionTransaction',
                transactionId: transactionId,
                title: title,
                type: type,
                amount: amount,
                billUrl: billUrl,
                status: status,
                date: date
            };

            const response = await fetch(this.apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    data: JSON.stringify(payload)
                })
            });

            const result = await response.json();

            this.cache.delete('union');
            delete this.localCache['union'];
            this.saveLocalCache();

            return result;
        } catch (error) {
            return { error: error.message };
        }
    }

    async deleteUnionTransaction(transactionId) {
        try {
            const payload = {
                action: 'deleteUnionTransaction',
                transactionId: transactionId
            };

            const response = await fetch(this.apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    data: JSON.stringify(payload)
                })
            });

            const result = await response.json();

            this.cache.delete('union');
            delete this.localCache['union'];
            this.saveLocalCache();

            return result;
        } catch (error) {
            return { error: error.message };
        }
    }

    async deleteTransaction(transactionId) {
        try {
            const payload = {
                action: 'deleteTransaction',
                transactionId: transactionId
            };

            const response = await fetch(this.apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    data: JSON.stringify(payload)
                })
            });

            const result = await response.json();

            this.cache.delete('transaction_master');
            delete this.localCache['transaction_master'];
            this.saveLocalCache();

            return result;
        } catch (error) {
            return { error: error.message };
        }
    }

    async deleteUserTransaction(username, transactionId) {
        try {
            const payload = {
                action: 'deleteUserTransaction',
                username: username,
                transactionId: transactionId
            };

            const response = await fetch(this.apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    data: JSON.stringify(payload)
                })
            });

            const result = await response.json();

            const cacheKey = `${username}_transactions`;
            this.cache.delete(cacheKey);
            delete this.localCache[cacheKey];
            this.saveLocalCache();

            return result;
        } catch (error) {
            return { error: error.message };
        }
    }

    // =============================
    // 📊 Get User Summary
    // =============================

    async getUserSummary() {
        try {
            const users = await this.getSheet('user_credentials');
            if (!users || users.error || !Array.isArray(users)) {
                return { givePending: 0, giveCompleted: 0, getPending: 0, getCompleted: 0 };
            }

            let givePending = 0;
            let giveCompleted = 0;
            let getPending = 0;
            let getCompleted = 0;

            // Get all transaction masters
            const transactions = await this.getSheet('transaction_master');
            const transactionMap = {};
            if (transactions && Array.isArray(transactions)) {
                transactions.forEach(t => {
                    transactionMap[t.transaction_id || t.id] = t;
                });
            }

            // Process each user's transactions
            for (const user of users) {
                const username = user.username;
                if (!username) continue;

                const userTransactions = await this.getUserTransactions(username);
                if (!userTransactions || !Array.isArray(userTransactions)) continue;

                for (const ut of userTransactions) {
                    const master = transactionMap[ut.transaction_id];
                    if (!master) continue;

                    const mode = master.mode || ut.mode || '';
                    const status = ut.status || 'pending';
                    const amount = parseFloat(ut.amount) || 0;

                    if (mode === 'to give') {
                        if (status === 'pending') {
                            givePending += amount;
                        } else if (status === 'completed') {
                            giveCompleted += amount;
                        }
                    } else if (mode === 'to get') {
                        if (status === 'pending') {
                            getPending += amount;
                        } else if (status === 'completed') {
                            getCompleted += amount;
                        }
                    }
                }
            }

            return { givePending, giveCompleted, getPending, getCompleted };
        } catch (error) {
            console.error('Error getting user summary:', error);
            return { givePending: 0, giveCompleted: 0, getPending: 0, getCompleted: 0 };
        }
    }
}

const api = new GoogleSheetsAPI();

// =============================
// 🔑 Authentication
// =============================
async function login() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!username || !password) {
        showError('Please enter both username and password');
        return;
    }

    const loginBtn = document.querySelector('#loginForm button[type="submit"]');
    const originalText = loginBtn.innerHTML;
    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Signing In...';
    loginBtn.disabled = true;

    try {
        const users = await api.getSheet("user_credentials", false);

        if (!users || users.error || !Array.isArray(users)) {
            showError('Failed to fetch user data');
            return;
        }

        const user = users.find(u => u.username === username && u.password === password);

        if (user) {
            currentUser = {
                username: user.username,
                name: user.full_name || user.username,
                role: user.role || 'user',
                userId: user.username
            };

            sessionStorage.setItem('transaction_session', JSON.stringify({
                user: currentUser,
                timestamp: Date.now()
            }));

            document.getElementById('loginPage').classList.add('hidden');
            document.getElementById('dashboardContainer').classList.remove('hidden');
            document.getElementById('welcomeUser').textContent = `Welcome, ${currentUser.name}`;
            loadUserProfile(username);

            if (currentUser.role === 'admin') {
                document.getElementById('userNav').classList.add('hidden');
                document.getElementById('adminNav').classList.remove('hidden');
                await loadAdminData();
                showPage('adminTransactions');
            } else {
                document.getElementById('adminNav').classList.add('hidden');
                document.getElementById('userNav').classList.remove('hidden');
                await loadUserTransactions();
                showPage('userTransactions');
            }
            setTimeout(() => preloadCriticalData(), 100);
            hideError();
            history.pushState(null, '', window.location.href);
        } else {
            showError('Invalid username or password');
        }
    } catch (error) {
        showError('Network error: ' + error.message);
    } finally {
        loginBtn.innerHTML = originalText;
        loginBtn.disabled = false;
    }
}

function logout() {
    sessionStorage.removeItem('transaction_session');
    currentUser = null;
    api.clearCache();
    
    document.getElementById('loginPage').classList.remove('hidden');
    document.getElementById('dashboardContainer').classList.add('hidden');
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    hideError();
    showLogin();
    history.pushState(null, '', window.location.href);
}

// =============================
// 📍 Navigation
// =============================
async function showPage(page) {
    document.querySelectorAll('.page-content').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active-admin', 'active-user');
    });

    document.getElementById(page + 'Page').classList.remove('hidden');

    const clickedBtn = Array.from(document.querySelectorAll('.nav-btn')).find(btn => {
        const btnText = btn.textContent.toLowerCase();
        return btnText.includes(page.replace('admin', '').replace('user', '').toLowerCase());
    });

    if (clickedBtn) {
        if (currentUser && currentUser.role === 'admin') {
            clickedBtn.classList.add('active-admin');
        } else {
            clickedBtn.classList.add('active-user');
        }
    }

    currentPage = page;

    if (page === 'adminTransactions') {
        await loadAdminTransactions();
    } else if (page === 'adminUsers') {
        await loadAdminUsers();
    } else if (page === 'adminUnion') {
        await loadUnionData();
    } else if (page === 'userTransactions') {
        await loadUserTransactions();
    } else if (page === 'userUnion') {
        await loadUserUnionTransactions();
    }
}

// =============================
// 👨‍💼 Admin Functions
// =============================
async function loadAdminData() {
    try {
        await loadAdminTransactions();
    } catch (error) {
        console.error('Error loading admin data:', error);
    }
}

async function loadAdminTransactions() {
    const container = document.getElementById('adminTransactionsList');
    container.innerHTML = `
        <div class="text-center py-12">
            <i class="fas fa-spinner fa-spin text-3xl text-indigo-500"></i>
            <p class="mt-3 text-gray-500">Loading transactions...</p>
        </div>
    `;

    try {
        const transactions = await api.getSheet('transaction_master');

        if (!transactions || transactions.error || !Array.isArray(transactions) || transactions.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exchange-alt"></i>
                    <h3>No Transactions</h3>
                    <p>Click "Add Transaction" to create your first transaction.</p>
                </div>
            `;
            return;
        }

        const sortedTransactions = transactions.sort((a, b) => {
            const dateA = new Date(a.date || a.transaction_date || 0);
            const dateB = new Date(b.date || b.transaction_date || 0);
            return dateB - dateA;
        });

        const html = sortedTransactions.map(transaction => {
            const mode = transaction.mode || 'to get';
            const modeClass = mode === 'to get' ? 'mode-get' : 'mode-give';
            const modeIcon = mode === 'to get' ? 'fa-arrow-down' : 'fa-arrow-up';
            const amount = transaction.amount || '0';
            
            const dateStr = transaction.date || transaction.transaction_date || 'N/A';
            const formattedDate = dateStr !== 'N/A' ? new Date(dateStr).toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }) : 'N/A';

            const billLink = transaction.bill_url ? 
                `<a href="${transaction.bill_url}" target="_blank" class="bill-link"><i class="fas fa-file-image mr-1"></i>View Bill</a>` : 
                '<span class="text-gray-400 text-sm">No bill uploaded</span>';

            return `
                <div class="transaction-card">
                    <div class="transaction-header" onclick="toggleTransactionDetails('${transaction.transaction_id || transaction.id}')">
                        <div class="flex items-center min-w-0 flex-1">
                            <div class="transaction-icon">
                                <i class="fas ${modeIcon}"></i>
                            </div>
                            <div class="transaction-info min-w-0 flex-1">
                                <h3>${transaction.title || 'Untitled'}</h3>
                                <p>${formattedDate}</p>
                            </div>
                        </div>
                        <div class="flex items-center space-x-3 flex-shrink-0">
                            <span class="mode-badge ${modeClass}">${mode}</span>
                            <span class="font-bold text-gray-700">₹${amount}</span>
                            <i class="fas fa-chevron-down expand-arrow" id="arrow-${transaction.transaction_id || transaction.id}"></i>
                        </div>
                    </div>
                    
                    <div class="details-container" id="details-${transaction.transaction_id || transaction.id}">
                        <div class="detail-item">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <div class="detail-label">Transaction ID</div>
                                    <div class="detail-value">${transaction.transaction_id || transaction.id || 'N/A'}</div>
                                </div>
                                <div>
                                    <div class="detail-label">Mode</div>
                                    <div class="detail-value"><span class="mode-badge ${modeClass}">${mode}</span></div>
                                </div>
                                <div>
                                    <div class="detail-label">Amount</div>
                                    <div class="detail-value font-bold">₹${amount}</div>
                                </div>
                                <div>
                                    <div class="detail-label">Date & Time</div>
                                    <div class="detail-value">${formattedDate}</div>
                                </div>
                                <div class="md:col-span-2">
                                    <div class="detail-label">Bill</div>
                                    <div class="detail-value">${billLink}</div>
                                </div>
                            </div>
                            <div class="mt-4 flex gap-2 flex-wrap">
                                <button onclick="event.stopPropagation(); openEditTransactionModal('${transaction.transaction_id || transaction.id}')" class="edit-btn">
                                    <i class="fas fa-edit mr-1"></i>Edit
                                </button>
                                <button onclick="event.stopPropagation(); confirmDeleteTransaction('${transaction.transaction_id || transaction.id}', '${transaction.title || 'Untitled'}', 'transaction_master')" class="delete-btn">
                                    <i class="fas fa-trash mr-1"></i>Delete
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;

    } catch (error) {
        console.error('Error loading admin transactions:', error);
        container.innerHTML = `
            <div class="text-center py-8 text-red-500">
                <i class="fas fa-exclamation-circle text-2xl mb-2"></i>
                <p>Error loading transactions. Please try again.</p>
            </div>
        `;
    }
}

function toggleTransactionDetails(id) {
    const container = document.getElementById(`details-${id}`);
    const arrow = document.getElementById(`arrow-${id}`);

    if (container && arrow) {
        if (!container.classList.contains('expanded')) {
            document.querySelectorAll('.details-container.expanded').forEach(el => {
                el.classList.remove('expanded');
            });
            document.querySelectorAll('.expand-arrow.expanded').forEach(el => {
                el.classList.remove('expanded');
            });

            container.classList.add('expanded');
            arrow.classList.add('expanded');
        } else {
            container.classList.remove('expanded');
            arrow.classList.remove('expanded');
        }
    }
}

async function loadAdminUsers() {
    const container = document.getElementById('adminUsersList');
    const summaryContainer = document.getElementById('userSummaryContainer');
    
    container.innerHTML = `
        <div class="text-center py-12 col-span-full">
            <i class="fas fa-spinner fa-spin text-3xl text-purple-500"></i>
            <p class="mt-3 text-gray-500">Loading users...</p>
        </div>
    `;
    
    // Show loading in summary
    summaryContainer.innerHTML = `
        <div class="text-center py-4 col-span-full">
            <i class="fas fa-spinner fa-spin text-2xl text-purple-500"></i>
        </div>
    `;

    try {
        // Load summary first (faster)
        const summary = await api.getUserSummary();
        summaryContainer.innerHTML = `
            <div class="user-summary-card give-pending">
                <div class="label">To Give (Pending)</div>
                <div class="value">₹${summary.givePending.toFixed(2)}</div>
            </div>
            <div class="user-summary-card give-completed">
                <div class="label">To Give (Completed)</div>
                <div class="value">₹${summary.giveCompleted.toFixed(2)}</div>
            </div>
            <div class="user-summary-card get-pending">
                <div class="label">To Get (Pending)</div>
                <div class="value">₹${summary.getPending.toFixed(2)}</div>
            </div>
            <div class="user-summary-card get-completed">
                <div class="label">To Get (Completed)</div>
                <div class="value">₹${summary.getCompleted.toFixed(2)}</div>
            </div>
        `;

        const users = await api.getSheet('user_credentials');

        if (!users || users.error || !Array.isArray(users) || users.length === 0) {
            container.innerHTML = `
                <div class="empty-state col-span-full">
                    <i class="fas fa-users"></i>
                    <h3>No Users</h3>
                    <p>Click "Add User" to create your first user.</p>
                </div>
            `;
            return;
        }

        const allTransactions = await api.getSheet('transaction_master');
        const transactionMap = {};
        if (allTransactions && Array.isArray(allTransactions)) {
            allTransactions.forEach(t => {
                transactionMap[t.transaction_id || t.id] = t;
            });
        }

        const userPromises = users.map(async (user) => {
            const userTransactions = await api.getUserTransactions(user.username);
            return {
                ...user,
                transactions: userTransactions && Array.isArray(userTransactions) ? userTransactions : []
            };
        });

        const usersWithTransactions = await Promise.all(userPromises);

        const html = usersWithTransactions.map(user => {
            const initials = user.full_name ? 
                user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : 
                user.username.substring(0, 2).toUpperCase();

            const transactionItems = user.transactions.map(t => {
                const transaction = transactionMap[t.transaction_id];
                const title = transaction ? transaction.title : 'Unknown';
                const status = t.status || 'pending';
                const statusClass = status === 'completed' ? 'status-completed' : 
                                   status === 'cancelled' ? 'status-cancelled' : 'status-pending';
                const mode = t.mode || transaction?.mode || 'to get';
                const modeClass = mode === 'to get' ? 'mode-get' : 'mode-give';
                const amount = t.amount || 0;
                const amountClass = mode === 'to get' ? 'get' : 'give';

                return `
                    <div class="user-transaction-item">
                        <div class="flex justify-between items-center">
                            <div class="flex-1 min-w-0">
                                <div class="font-medium text-gray-800">${title}</div>
                                <div class="flex items-center gap-2 mt-1 flex-wrap">
                                    <span class="mode-badge ${modeClass} text-xs">${mode}</span>
                                    <span class="status-badge ${statusClass}">${status}</span>
                                    <span class="text-sm text-gray-500">${t.date || 'N/A'}</span>
                                </div>
                            </div>
                            <div class="text-right flex-shrink-0 ml-2">
                                ${amount > 0 ? `<div class="transaction-amount ${amountClass}">₹${amount}</div>` : ''}
                            </div>
                        </div>
                        <div class="mt-2 flex gap-2 flex-wrap">
                            <button onclick="event.stopPropagation(); openUserTransactionEditModal('${user.username}', '${t.transaction_id}')" class="edit-btn text-xs">
                                <i class="fas fa-edit mr-1"></i>Edit
                            </button>
                            <button onclick="event.stopPropagation(); confirmDeleteUserTransaction('${user.username}', '${t.transaction_id}', '${title}')" class="delete-btn text-xs">
                                <i class="fas fa-trash mr-1"></i>Delete
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

            return `
                <div class="user-card" id="user-card-${user.username}" onclick="toggleUserExpand('${user.username}')">
                    <div class="user-card-inner">
                        <div class="user-avatar">${initials}</div>
                        <div class="user-name">${user.full_name || user.username}</div>
                        <div class="user-username">@${user.username}</div>
                        <div class="text-xs text-gray-500 mt-2">
                            ${user.role === 'admin' ? '👑 Admin' : '👤 User'} · ${user.transactions.length} transactions
                        </div>
                        <div class="mt-3 flex justify-center gap-2">
                            <button onclick="event.stopPropagation(); openEditUserModal('${user.username}')" class="edit-btn text-xs">
                                <i class="fas fa-edit mr-1"></i>Edit
                            </button>
                        </div>
                        <div class="mt-2">
                            <i class="fas fa-chevron-down expand-toggle-icon" id="expand-icon-${user.username}"></i>
                        </div>
                    </div>
                    <div class="user-expand-content" id="expand-content-${user.username}">
                        ${transactionItems || '<div class="text-center text-gray-500 py-4">No transactions for this user</div>'}
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;

    } catch (error) {
        console.error('Error loading admin users:', error);
        container.innerHTML = `
            <div class="text-center py-8 text-red-500 col-span-full">
                <i class="fas fa-exclamation-circle text-2xl mb-2"></i>
                <p>Error loading users. Please try again.</p>
            </div>
        `;
    }
}

function toggleUserExpand(username) {
    const content = document.getElementById(`expand-content-${username}`);
    const card = document.getElementById(`user-card-${username}`);
    const icon = document.getElementById(`expand-icon-${username}`);

    if (!content) return;

    if (content.classList.contains('open')) {
        content.classList.remove('open');
        card.classList.remove('expanded');
        if (icon) icon.classList.remove('rotated');
        return;
    }

    document.querySelectorAll('.user-expand-content.open').forEach(el => {
        el.classList.remove('open');
        const parentCard = el.closest('.user-card');
        if (parentCard) parentCard.classList.remove('expanded');
        const iconId = el.id.replace('expand-content-', 'expand-icon-');
        const otherIcon = document.getElementById(iconId);
        if (otherIcon) otherIcon.classList.remove('rotated');
    });

    content.classList.add('open');
    card.classList.add('expanded');
    if (icon) icon.classList.add('rotated');
}

// =============================
// 📊 Union Functions
// =============================

async function loadUnionData() {
    await loadUnionTransactions();
    await loadUnionSummary();
}

function shouldIncludeInSummary(transaction) {
    const type = transaction.type || '';
    const status = transaction.status || 'pending';
    
    // For hard and soft: include only if status is 'completed'
    if (type === 'hard' || type === 'soft') {
        return status === 'completed';
    }
    
    // For 'to get' and 'to give': include only if status is 'pending'
    if (type === 'to get' || type === 'to give') {
        return status === 'pending';
    }
    
    return false;
}

async function loadUnionSummary() {
    const container = document.getElementById('unionSummary');
    
    try {
        const transactions = await api.getSheet('union');
        
        if (!transactions || transactions.error || !Array.isArray(transactions)) {
            container.innerHTML = `
                <div class="summary-card"><div class="label">Hard Money</div><div class="value">₹0</div></div>
                <div class="summary-card"><div class="label">Soft Money</div><div class="value">₹0</div></div>
                <div class="summary-card"><div class="label">Balance</div><div class="value">₹0</div></div>
                <div class="summary-card"><div class="label">To Get</div><div class="value">₹0</div></div>
                <div class="summary-card"><div class="label">To Give</div><div class="value">₹0</div></div>
                <div class="summary-card"><div class="label">Difference</div><div class="value">₹0</div></div>
            `;
            return;
        }

        let hardTotal = 0;
        let softTotal = 0;
        let toGetTotal = 0;
        let toGiveTotal = 0;

        // First pass: calculate hard and soft totals from completed transactions
        transactions.forEach(t => {
            const amount = parseFloat(t.amount) || 0;
            const type = t.type || '';
            const status = t.status || '';
            
            if (type === 'hard' && status === 'completed') {
                hardTotal += amount;
            } else if (type === 'soft' && status === 'completed') {
                softTotal += amount;
            }
        });

        // Second pass: calculate to get and to give from pending transactions
        // AND apply the logic: when 'to get' is completed, add to soft
        // when 'to give' is completed, subtract from soft
        transactions.forEach(t => {
            const amount = parseFloat(t.amount) || 0;
            const type = t.type || '';
            const status = t.status || '';
            
            if (type === 'to get') {
                if (status === 'pending') {
                    toGetTotal += amount;
                } else if (status === 'completed') {
                    // When 'to get' is completed, add to soft
                    softTotal += amount;
                }
            } else if (type === 'to give') {
                if (status === 'pending') {
                    toGiveTotal += amount;
                } else if (status === 'completed') {
                    // When 'to give' is completed, subtract from soft
                    softTotal -= amount;
                }
            }
        });

        const balance = hardTotal + softTotal;
        const difference = toGetTotal - toGiveTotal;

        container.innerHTML = `
            <div class="summary-card hard">
                <div class="label">Hard Money</div>
                <div class="value">₹${hardTotal.toFixed(2)}</div>
            </div>
            <div class="summary-card soft">
                <div class="label">Soft Money</div>
                <div class="value">₹${softTotal.toFixed(2)}</div>
            </div>
            <div class="summary-card balance">
                <div class="label">Balance</div>
                <div class="value">₹${balance.toFixed(2)}</div>
            </div>
            <div class="summary-card toget">
                <div class="label">To Get</div>
                <div class="value">₹${toGetTotal.toFixed(2)}</div>
            </div>
            <div class="summary-card togive">
                <div class="label">To Give</div>
                <div class="value">₹${toGiveTotal.toFixed(2)}</div>
            </div>
            <div class="summary-card difference">
                <div class="label">Difference</div>
                <div class="value">₹${difference.toFixed(2)}</div>
            </div>
        `;

    } catch (error) {
        console.error('Error loading union summary:', error);
        container.innerHTML = `
            <div class="text-center text-red-500 col-span-full">Error loading summary</div>
        `;
    }
}

async function loadUnionTransactions() {
    const container = document.getElementById('unionTransactionsList');
    container.innerHTML = `
        <div class="text-center py-12">
            <i class="fas fa-spinner fa-spin text-3xl text-emerald-500"></i>
            <p class="mt-3 text-gray-500">Loading union transactions...</p>
        </div>
    `;

    try {
        const transactions = await api.getSheet('union');

        if (!transactions || transactions.error || !Array.isArray(transactions) || transactions.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-layer-group"></i>
                    <h3>No Union Transactions</h3>
                    <p>Click "Add Union Transaction" to create your first transaction.</p>
                </div>
            `;
            return;
        }

        const sortedTransactions = transactions.sort((a, b) => {
            const dateA = new Date(a.date || 0);
            const dateB = new Date(b.date || 0);
            return dateB - dateA;
        });

        const html = sortedTransactions.map(transaction => {
            const type = transaction.type || 'to get';
            let modeClass = 'mode-get';
            let modeIcon = 'fa-arrow-down';
            
            if (type === 'hard') { modeClass = 'mode-hard'; modeIcon = 'fa-coins'; }
            else if (type === 'soft') { modeClass = 'mode-soft'; modeIcon = 'fa-hand-holding-heart'; }
            else if (type === 'to give') { modeClass = 'mode-give'; modeIcon = 'fa-arrow-up'; }
            
            const amount = transaction.amount || '0';
            const status = transaction.status || 'pending';
            const statusClass = status === 'completed' ? 'status-completed' : 'status-pending';
            
            const dateStr = transaction.date || 'N/A';
            const formattedDate = dateStr !== 'N/A' ? new Date(dateStr).toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }) : 'N/A';

            const billLink = transaction.bill_url ? 
                `<a href="${transaction.bill_url}" target="_blank" class="bill-link"><i class="fas fa-file-image mr-1"></i>View Bill</a>` : 
                '<span class="text-gray-400 text-sm">No bill uploaded</span>';

            return `
                <div class="transaction-card">
                    <div class="transaction-header" onclick="toggleUnionDetails('${transaction.transaction_id || transaction.id}')">
                        <div class="flex items-center min-w-0 flex-1">
                            <div class="transaction-icon" style="background: linear-gradient(135deg, #059669, #10b981);">
                                <i class="fas ${modeIcon}"></i>
                            </div>
                            <div class="transaction-info min-w-0 flex-1">
                                <h3>${transaction.title || 'Untitled'}</h3>
                                <p>${formattedDate}</p>
                            </div>
                        </div>
                        <div class="flex items-center space-x-3 flex-shrink-0">
                            <span class="mode-badge ${modeClass}">${type}</span>
                            <span class="status-badge ${statusClass}">${status}</span>
                            <span class="font-bold text-gray-700">₹${amount}</span>
                            <i class="fas fa-chevron-down expand-arrow" id="union-arrow-${transaction.transaction_id || transaction.id}"></i>
                        </div>
                    </div>
                    
                    <div class="details-container" id="union-details-${transaction.transaction_id || transaction.id}">
                        <div class="detail-item">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <div class="detail-label">Transaction ID</div>
                                    <div class="detail-value">${transaction.transaction_id || transaction.id || 'N/A'}</div>
                                </div>
                                <div>
                                    <div class="detail-label">Type</div>
                                    <div class="detail-value"><span class="mode-badge ${modeClass}">${type}</span></div>
                                </div>
                                <div>
                                    <div class="detail-label">Amount</div>
                                    <div class="detail-value font-bold">₹${amount}</div>
                                </div>
                                <div>
                                    <div class="detail-label">Status</div>
                                    <div class="detail-value"><span class="status-badge ${statusClass}">${status}</span></div>
                                </div>
                                <div>
                                    <div class="detail-label">Date & Time</div>
                                    <div class="detail-value">${formattedDate}</div>
                                </div>
                                <div>
                                    <div class="detail-label">Updated At</div>
                                    <div class="detail-value">${transaction.updated_at || 'N/A'}</div>
                                </div>
                                <div class="md:col-span-2">
                                    <div class="detail-label">Bill</div>
                                    <div class="detail-value">${billLink}</div>
                                </div>
                            </div>
                            <div class="mt-4 flex gap-2 flex-wrap">
                                <button onclick="event.stopPropagation(); openEditUnionModal('${transaction.transaction_id || transaction.id}')" class="edit-btn">
                                    <i class="fas fa-edit mr-1"></i>Edit
                                </button>
                                <button onclick="event.stopPropagation(); confirmDeleteTransaction('${transaction.transaction_id || transaction.id}', '${transaction.title || 'Untitled'}', 'union')" class="delete-btn">
                                    <i class="fas fa-trash mr-1"></i>Delete
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;

    } catch (error) {
        console.error('Error loading union transactions:', error);
        container.innerHTML = `
            <div class="text-center py-8 text-red-500">
                <i class="fas fa-exclamation-circle text-2xl mb-2"></i>
                <p>Error loading union transactions. Please try again.</p>
            </div>
        `;
    }
}

function toggleUnionDetails(id) {
    const container = document.getElementById(`union-details-${id}`);
    const arrow = document.getElementById(`union-arrow-${id}`);

    if (container && arrow) {
        if (!container.classList.contains('expanded')) {
            document.querySelectorAll('#unionTransactionsList .details-container.expanded').forEach(el => {
                el.classList.remove('expanded');
            });
            document.querySelectorAll('#unionTransactionsList .expand-arrow.expanded').forEach(el => {
                el.classList.remove('expanded');
            });

            container.classList.add('expanded');
            arrow.classList.add('expanded');
        } else {
            container.classList.remove('expanded');
            arrow.classList.remove('expanded');
        }
    }
}

// =============================
// 👤 User Union Functions (View Only)
// =============================

async function loadUserUnionTransactions() {
    const container = document.getElementById('userUnionTransactionsList');
    container.innerHTML = `
        <div class="text-center py-12">
            <i class="fas fa-spinner fa-spin text-3xl text-emerald-500"></i>
            <p class="mt-3 text-gray-500">Loading union transactions...</p>
        </div>
    `;

    try {
        const transactions = await api.getSheet('union');

        if (!transactions || transactions.error || !Array.isArray(transactions) || transactions.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-layer-group"></i>
                    <h3>No Union Transactions</h3>
                    <p>No union transactions available.</p>
                </div>
            `;
            return;
        }

        const sortedTransactions = transactions.sort((a, b) => {
            const dateA = new Date(a.date || 0);
            const dateB = new Date(b.date || 0);
            return dateB - dateA;
        });

        const html = sortedTransactions.map(transaction => {
            const type = transaction.type || 'to get';
            let modeClass = 'mode-get';
            let modeIcon = 'fa-arrow-down';
            
            if (type === 'hard') { modeClass = 'mode-hard'; modeIcon = 'fa-coins'; }
            else if (type === 'soft') { modeClass = 'mode-soft'; modeIcon = 'fa-hand-holding-heart'; }
            else if (type === 'to give') { modeClass = 'mode-give'; modeIcon = 'fa-arrow-up'; }
            
            const amount = transaction.amount || '0';
            const status = transaction.status || 'pending';
            const statusClass = status === 'completed' ? 'status-completed' : 'status-pending';
            
            const dateStr = transaction.date || 'N/A';
            const formattedDate = dateStr !== 'N/A' ? new Date(dateStr).toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }) : 'N/A';

            const billLink = transaction.bill_url ? 
                `<a href="${transaction.bill_url}" target="_blank" class="bill-link"><i class="fas fa-file-image mr-1"></i>View Bill</a>` : 
                '<span class="text-gray-400 text-sm">No bill uploaded</span>';

            return `
                <div class="transaction-card" onclick="toggleUserUnionDetails('${transaction.transaction_id || transaction.id}')">
                    <div class="transaction-header">
                        <div class="flex items-center min-w-0 flex-1">
                            <div class="transaction-icon" style="background: linear-gradient(135deg, #059669, #10b981);">
                                <i class="fas ${modeIcon}"></i>
                            </div>
                            <div class="transaction-info min-w-0 flex-1">
                                <h3>${transaction.title || 'Untitled'}</h3>
                                <p>${formattedDate}</p>
                            </div>
                        </div>
                        <div class="flex items-center space-x-3 flex-shrink-0">
                            <span class="mode-badge ${modeClass}">${type}</span>
                            <span class="status-badge ${statusClass}">${status}</span>
                            <span class="font-bold text-gray-700">₹${amount}</span>
                            <i class="fas fa-chevron-down expand-arrow" id="user-union-arrow-${transaction.transaction_id || transaction.id}"></i>
                        </div>
                    </div>
                    
                    <div class="details-container" id="user-union-details-${transaction.transaction_id || transaction.id}">
                        <div class="detail-item">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <div class="detail-label">Transaction ID</div>
                                    <div class="detail-value">${transaction.transaction_id || transaction.id || 'N/A'}</div>
                                </div>
                                <div>
                                    <div class="detail-label">Type</div>
                                    <div class="detail-value"><span class="mode-badge ${modeClass}">${type}</span></div>
                                </div>
                                <div>
                                    <div class="detail-label">Amount</div>
                                    <div class="detail-value font-bold">₹${amount}</div>
                                </div>
                                <div>
                                    <div class="detail-label">Status</div>
                                    <div class="detail-value"><span class="status-badge ${statusClass}">${status}</span></div>
                                </div>
                                <div>
                                    <div class="detail-label">Date & Time</div>
                                    <div class="detail-value">${formattedDate}</div>
                                </div>
                                <div>
                                    <div class="detail-label">Updated At</div>
                                    <div class="detail-value">${transaction.updated_at || 'N/A'}</div>
                                </div>
                                <div class="md:col-span-2">
                                    <div class="detail-label">Bill</div>
                                    <div class="detail-value">${billLink}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;

    } catch (error) {
        console.error('Error loading user union transactions:', error);
        container.innerHTML = `
            <div class="text-center py-8 text-red-500">
                <i class="fas fa-exclamation-circle text-2xl mb-2"></i>
                <p>Error loading union transactions. Please try again.</p>
            </div>
        `;
    }
}

function toggleUserUnionDetails(id) {
    const container = document.getElementById(`user-union-details-${id}`);
    const arrow = document.getElementById(`user-union-arrow-${id}`);

    if (container && arrow) {
        if (!container.classList.contains('expanded')) {
            document.querySelectorAll('#userUnionTransactionsList .details-container.expanded').forEach(el => {
                el.classList.remove('expanded');
            });
            document.querySelectorAll('#userUnionTransactionsList .expand-arrow.expanded').forEach(el => {
                el.classList.remove('expanded');
            });

            container.classList.add('expanded');
            arrow.classList.add('expanded');
        } else {
            container.classList.remove('expanded');
            arrow.classList.remove('expanded');
        }
    }
}

// =============================
// ➕ Add Transaction Functions
// =============================
async function openAddTransactionModal() {
    const modal = document.getElementById('addTransactionModal');
    const form = document.getElementById('addTransactionForm');
    form.reset();
    document.getElementById('addTransactionError').classList.add('hidden');
    document.getElementById('addTransactionSuccess').classList.add('hidden');

    const nextId = await getNextTransactionId();
    document.getElementById('autoTransactionId').value = nextId;

    const now = new Date();
    const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    document.getElementById('transactionDate').value = localDateTime.toISOString().slice(0, 16);

    modal.classList.remove('hidden');
}

function closeAddTransactionModal() {
    document.getElementById('addTransactionModal').classList.add('hidden');
}

async function getNextTransactionId() {
    try {
        const transactions = await api.getSheet('transaction_master');

        if (!transactions || transactions.error || !Array.isArray(transactions) || transactions.length === 0) {
            return 'TRN001';
        }

        const ids = transactions
            .map(t => t.transaction_id || t.id)
            .filter(id => id && id.startsWith('TRN'))
            .map(id => {
                const num = parseInt(id.substring(3));
                return isNaN(num) ? 0 : num;
            });

        if (ids.length === 0) return 'TRN001';

        const nextNum = Math.max(...ids) + 1;
        return `TRN${String(nextNum).padStart(3, '0')}`;
    } catch (error) {
        console.error('Error generating transaction ID:', error);
        return 'TRN001';
    }
}

async function submitAddTransaction(event) {
    event.preventDefault();

    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;

    try {
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Adding...';
        submitBtn.disabled = true;

        const transactionId = document.getElementById('autoTransactionId').value;
        const title = document.getElementById('transactionTitle').value.trim();
        const mode = document.getElementById('transactionMode').value;
        const amount = document.getElementById('transactionAmount').value;
        const date = document.getElementById('transactionDate').value;
        const fileInput = document.getElementById('billUpload');

        if (!title || !mode || !amount || !date) {
            showAddTransactionError('Please fill in all required fields');
            return;
        }

        let billUrl = '';

        if (fileInput.files && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            if (file.size > 5 * 1024 * 1024) {
                showAddTransactionError('File size must be less than 5MB');
                return;
            }

            const uploadResult = await api.uploadFile('admin', transactionId, file);

            if (uploadResult && uploadResult.success) {
                billUrl = uploadResult.fileUrl || '';
            } else {
                showAddTransactionError('Failed to upload bill: ' + (uploadResult?.error || 'Unknown error'));
                return;
            }
        }

        const rowData = [
            transactionId,
            title,
            mode,
            amount,
            billUrl,
            date
        ];

        const result = await api.addRow('transaction_master', rowData);

        if (result && (result.success || result.message?.includes('Success'))) {
            await api.addTransactionToAllUsers(transactionId, title, mode, amount, billUrl, date);
            
            showAddTransactionSuccess('Transaction added successfully to all users!');
            setTimeout(() => {
                closeAddTransactionModal();
                loadAdminTransactions();
            }, 1500);
        } else {
            throw new Error(result?.error || 'Failed to add transaction');
        }

    } catch (error) {
        console.error('Error adding transaction:', error);
        showAddTransactionError('Error: ' + error.message);
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

function showAddTransactionError(message) {
    const errorDiv = document.getElementById('addTransactionError');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
    document.getElementById('addTransactionSuccess').classList.add('hidden');
}

function showAddTransactionSuccess(message) {
    const successDiv = document.getElementById('addTransactionSuccess');
    successDiv.textContent = message;
    successDiv.classList.remove('hidden');
    document.getElementById('addTransactionError').classList.add('hidden');
}

// =============================
// ✏️ Edit Transaction Functions
// =============================
async function openEditTransactionModal(transactionId) {
    const modal = document.getElementById('editTransactionModal');
    const form = document.getElementById('editTransactionForm');
    form.reset();
    document.getElementById('editTransactionError').classList.add('hidden');
    document.getElementById('editTransactionSuccess').classList.add('hidden');

    try {
        const transactions = await api.getSheet('transaction_master');
        const transaction = transactions.find(t => (t.transaction_id || t.id) === transactionId);

        if (!transaction) {
            alert('Transaction not found!');
            return;
        }

        currentEditTransaction = transaction;

        document.getElementById('editTransactionId').value = transaction.transaction_id || transaction.id;
        document.getElementById('editTransactionTitle').value = transaction.title || '';
        document.getElementById('editTransactionMode').value = transaction.mode || 'to get';
        document.getElementById('editTransactionAmount').value = transaction.amount || '';

        const dateStr = transaction.date || transaction.transaction_date || '';
        if (dateStr) {
            const date = new Date(dateStr);
            const localDateTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
            document.getElementById('editTransactionDate').value = localDateTime.toISOString().slice(0, 16);
        }

        const currentBillDiv = document.getElementById('editCurrentBill');
        if (transaction.bill_url) {
            currentBillDiv.innerHTML = `
                <p class="text-sm text-gray-600">
                    <i class="fas fa-file-image mr-1 text-blue-500"></i>
                    Current bill: <a href="${transaction.bill_url}" target="_blank" class="bill-link">View Bill</a>
                </p>
            `;
        } else {
            currentBillDiv.innerHTML = '<p class="text-sm text-gray-400">No bill currently uploaded</p>';
        }

        modal.classList.remove('hidden');
    } catch (error) {
        console.error('Error opening edit transaction:', error);
        alert('Error loading transaction details. Please try again.');
    }
}

function closeEditTransactionModal() {
    document.getElementById('editTransactionModal').classList.add('hidden');
    currentEditTransaction = null;
}

async function submitEditTransaction(event) {
    event.preventDefault();

    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;

    try {
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Updating...';
        submitBtn.disabled = true;

        const transactionId = document.getElementById('editTransactionId').value;
        const title = document.getElementById('editTransactionTitle').value.trim();
        const mode = document.getElementById('editTransactionMode').value;
        const amount = document.getElementById('editTransactionAmount').value;
        const date = document.getElementById('editTransactionDate').value;
        const fileInput = document.getElementById('editBillUpload');

        if (!title || !mode || !amount || !date) {
            showEditTransactionError('Please fill in all required fields');
            return;
        }

        let billUrl = currentEditTransaction?.bill_url || '';

        if (fileInput.files && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            if (file.size > 5 * 1024 * 1024) {
                showEditTransactionError('File size must be less than 5MB');
                return;
            }

            const uploadResult = await api.uploadFile('admin', transactionId, file);

            if (uploadResult && uploadResult.success) {
                billUrl = uploadResult.fileUrl || '';
            } else {
                showEditTransactionError('Failed to upload bill: ' + (uploadResult?.error || 'Unknown error'));
                return;
            }
        }

        const result = await api.updateTransaction(transactionId, title, mode, amount, billUrl, date);

        if (result && result.success) {
            showEditTransactionSuccess('Transaction updated successfully!');
            setTimeout(() => {
                closeEditTransactionModal();
                loadAdminTransactions();
            }, 1500);
        } else {
            throw new Error(result?.error || 'Failed to update transaction');
        }

    } catch (error) {
        console.error('Error updating transaction:', error);
        showEditTransactionError('Error: ' + error.message);
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

function showEditTransactionError(message) {
    const errorDiv = document.getElementById('editTransactionError');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
    document.getElementById('editTransactionSuccess').classList.add('hidden');
}

function showEditTransactionSuccess(message) {
    const successDiv = document.getElementById('editTransactionSuccess');
    successDiv.textContent = message;
    successDiv.classList.remove('hidden');
    document.getElementById('editTransactionError').classList.add('hidden');
}

// =============================
// 🆕 Union Modal Functions
// =============================

async function openUnionModal() {
    const modal = document.getElementById('unionModal');
    const form = document.getElementById('unionForm');
    form.reset();
    document.getElementById('unionError').classList.add('hidden');
    document.getElementById('unionSuccess').classList.add('hidden');

    const nextId = await getNextUnionId();
    document.getElementById('unionTransactionId').value = nextId;

    const now = new Date();
    const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    document.getElementById('unionDate').value = localDateTime.toISOString().slice(0, 16);

    modal.classList.remove('hidden');
}

function closeUnionModal() {
    document.getElementById('unionModal').classList.add('hidden');
}

async function getNextUnionId() {
    try {
        const transactions = await api.getSheet('union');

        if (!transactions || transactions.error || !Array.isArray(transactions) || transactions.length === 0) {
            return 'UNION_001';
        }

        const ids = transactions
            .map(t => t.transaction_id || t.id)
            .filter(id => id && id.startsWith('UNION_'))
            .map(id => {
                const num = parseInt(id.substring(6));
                return isNaN(num) ? 0 : num;
            });

        if (ids.length === 0) return 'UNION_001';

        const nextNum = Math.max(...ids) + 1;
        return `UNION_${String(nextNum).padStart(3, '0')}`;
    } catch (error) {
        console.error('Error generating union ID:', error);
        return 'UNION_001';
    }
}

async function submitUnionTransaction(event) {
    event.preventDefault();

    const form = document.getElementById('unionForm');
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    const editId = form.dataset.editId;

    try {
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>' + (editId ? 'Updating...' : 'Adding...');
        submitBtn.disabled = true;

        const transactionId = document.getElementById('unionTransactionId').value;
        const title = document.getElementById('unionTitle').value.trim();
        const type = document.getElementById('unionType').value;
        const amount = document.getElementById('unionAmount').value;
        const status = document.getElementById('unionStatus').value;
        const date = document.getElementById('unionDate').value;
        const fileInput = document.getElementById('unionBillUpload');

        if (!title || !type || !amount || !status || !date) {
            showUnionError('Please fill in all required fields');
            return;
        }

        let billUrl = '';

        if (fileInput.files && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            if (file.size > 5 * 1024 * 1024) {
                showUnionError('File size must be less than 5MB');
                return;
            }

            const uploadResult = await api.uploadFile('admin', transactionId, file);

            if (uploadResult && uploadResult.success) {
                billUrl = uploadResult.fileUrl || '';
            } else {
                showUnionError('Failed to upload bill: ' + (uploadResult?.error || 'Unknown error'));
                return;
            }
        }

        let result;
        if (editId) {
            // Update existing transaction
            const existing = await api.getSheet('union');
            const transaction = existing.find(t => (t.transaction_id || t.id) === editId);
            if (transaction && transaction.bill_url && !billUrl) {
                billUrl = transaction.bill_url;
            }
            result = await api.updateUnionTransaction(transactionId, title, type, amount, billUrl, status, date);
        } else {
            // Add new transaction
            result = await api.addUnionTransaction(transactionId, title, type, amount, billUrl, status, date);
        }

        if (result && result.success) {
            showUnionSuccess((editId ? 'Union transaction updated' : 'Union transaction added') + ' successfully!');
            setTimeout(() => {
                closeUnionModal();
                delete form.dataset.editId;
                // Reset submit button text
                const btn = document.querySelector('#unionForm button[type="submit"]');
                btn.innerHTML = '<i class="fas fa-plus mr-2"></i>Add Transaction';
                loadUnionData();
            }, 1500);
        } else {
            throw new Error(result?.error || 'Failed to process union transaction');
        }

    } catch (error) {
        console.error('Error processing union transaction:', error);
        showUnionError('Error: ' + error.message);
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

function showUnionError(message) {
    const errorDiv = document.getElementById('unionError');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
    document.getElementById('unionSuccess').classList.add('hidden');
}

function showUnionSuccess(message) {
    const successDiv = document.getElementById('unionSuccess');
    successDiv.textContent = message;
    successDiv.classList.remove('hidden');
    document.getElementById('unionError').classList.add('hidden');
}

// =============================
// ✏️ Edit Union Functions
// =============================

async function openEditUnionModal(transactionId) {
    const modal = document.getElementById('unionModal');
    const form = document.getElementById('unionForm');
    form.reset();
    document.getElementById('unionError').classList.add('hidden');
    document.getElementById('unionSuccess').classList.add('hidden');

    try {
        const transactions = await api.getSheet('union');
        const transaction = transactions.find(t => (t.transaction_id || t.id) === transactionId);

        if (!transaction) {
            alert('Transaction not found!');
            return;
        }

        document.getElementById('unionTransactionId').value = transaction.transaction_id || transaction.id;
        document.getElementById('unionTitle').value = transaction.title || '';
        document.getElementById('unionType').value = transaction.type || '';
        document.getElementById('unionAmount').value = transaction.amount || '';
        document.getElementById('unionStatus').value = transaction.status || 'pending';

        const dateStr = transaction.date || '';
        if (dateStr) {
            const date = new Date(dateStr);
            const localDateTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
            document.getElementById('unionDate').value = localDateTime.toISOString().slice(0, 16);
        }

        // Change the submit button text to "Update"
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Update Transaction';

        modal.classList.remove('hidden');

        // Store the transaction ID for update
        form.dataset.editId = transactionId;

    } catch (error) {
        console.error('Error opening edit union:', error);
        alert('Error loading transaction details. Please try again.');
    }
}

// =============================
// 🗑️ Delete Functions with Confirmation
// =============================

function confirmDeleteTransaction(transactionId, title, sheet) {
    deleteTarget = { transactionId, title, sheet };
    document.getElementById('deleteConfirmMessage').textContent = `Are you sure you want to delete "${title}"? This action cannot be undone.`;
    document.getElementById('deleteConfirmDialog').classList.remove('hidden');
    document.getElementById('confirmDeleteBtn').onclick = executeDelete;
}

function confirmDeleteUserTransaction(username, transactionId, title) {
    deleteTarget = { username, transactionId, title, sheet: 'user_transaction' };
    document.getElementById('deleteConfirmMessage').textContent = `Are you sure you want to delete "${title}" for user ${username}? This action cannot be undone.`;
    document.getElementById('deleteConfirmDialog').classList.remove('hidden');
    document.getElementById('confirmDeleteBtn').onclick = executeDelete;
}

function closeDeleteConfirm() {
    document.getElementById('deleteConfirmDialog').classList.add('hidden');
    deleteTarget = null;
}

async function executeDelete() {
    if (!deleteTarget) return;

    const btn = document.getElementById('confirmDeleteBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Deleting...';

    try {
        let result;
        if (deleteTarget.sheet === 'union') {
            result = await api.deleteUnionTransaction(deleteTarget.transactionId);
            if (result && result.success) {
                showNotification('Union transaction deleted successfully!', 'success');
                await loadUnionData();
            } else {
                throw new Error(result?.error || 'Failed to delete union transaction');
            }
        } else if (deleteTarget.sheet === 'transaction_master') {
            result = await api.deleteTransaction(deleteTarget.transactionId);
            if (result && result.success) {
                showNotification('Transaction deleted successfully!', 'success');
                await loadAdminTransactions();
            } else {
                throw new Error(result?.error || 'Failed to delete transaction');
            }
        } else if (deleteTarget.sheet === 'user_transaction') {
            result = await api.deleteUserTransaction(deleteTarget.username, deleteTarget.transactionId);
            if (result && result.success) {
                showNotification('User transaction deleted successfully!', 'success');
                await loadAdminUsers();
            } else {
                throw new Error(result?.error || 'Failed to delete user transaction');
            }
        }

    } catch (error) {
        console.error('Delete error:', error);
        showNotification('Error: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Delete';
        closeDeleteConfirm();
    }
}

// =============================
// 👤 User Functions
// =============================
async function loadUserTransactions() {
    const container = document.getElementById('userTransactionsList');
    container.innerHTML = `
        <div class="text-center py-12">
            <i class="fas fa-spinner fa-spin text-3xl text-cyan-500"></i>
            <p class="mt-3 text-gray-500">Loading transactions...</p>
        </div>
    `;

    try {
        const transactions = await api.getSheet('transaction_master');

        if (!transactions || transactions.error || !Array.isArray(transactions) || transactions.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exchange-alt"></i>
                    <h3>No Transactions</h3>
                    <p>There are no transactions available yet.</p>
                </div>
            `;
            return;
        }

        const userTransactions = await api.getUserTransactions(currentUser.username);
        const userTransactionMap = {};
        if (userTransactions && Array.isArray(userTransactions)) {
            userTransactions.forEach(t => {
                userTransactionMap[t.transaction_id] = t;
            });
        }

        const sortedTransactions = transactions.sort((a, b) => {
            const dateA = new Date(a.date || a.transaction_date || 0);
            const dateB = new Date(b.date || b.transaction_date || 0);
            return dateB - dateA;
        });

        const html = sortedTransactions.map(transaction => {
            const tid = transaction.transaction_id || transaction.id;
            const userTxn = userTransactionMap[tid];
            const status = userTxn?.status || 'pending';
            const amount = userTxn?.amount || transaction.amount || '0';
            
            const mode = userTxn?.mode || transaction.mode || 'to get';
            const modeClass = mode === 'to get' ? 'mode-get' : 'mode-give';
            const modeIcon = mode === 'to get' ? 'fa-arrow-down' : 'fa-arrow-up';
            
            const statusClass = status === 'completed' ? 'status-completed' : 
                               status === 'cancelled' ? 'status-cancelled' : 'status-pending';
            
            const dateStr = transaction.date || transaction.transaction_date || 'N/A';
            const formattedDate = dateStr !== 'N/A' ? new Date(dateStr).toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }) : 'N/A';

            const billLink = transaction.bill_url ? 
                `<a href="${transaction.bill_url}" target="_blank" class="bill-link"><i class="fas fa-file-image mr-1"></i>View Bill</a>` : 
                '<span class="text-gray-400 text-sm">No bill uploaded</span>';

            return `
                <div class="transaction-card" onclick="toggleUserTransactionDetails('${tid}')">
                    <div class="transaction-header">
                        <div class="flex items-center min-w-0 flex-1">
                            <div class="transaction-icon">
                                <i class="fas ${modeIcon}"></i>
                            </div>
                            <div class="transaction-info min-w-0 flex-1">
                                <h3>${transaction.title || 'Untitled'}</h3>
                                <p>${formattedDate}</p>
                            </div>
                        </div>
                        <div class="flex items-center space-x-3 flex-shrink-0">
                            ${status !== 'pending' ? `<span class="status-badge ${statusClass}">${status}</span>` : ''}
                            ${amount > 0 ? `<span class="transaction-amount ${mode === 'to get' ? 'get' : 'give'}">₹${amount}</span>` : ''}
                            <i class="fas fa-chevron-down expand-arrow" id="user-arrow-${tid}"></i>
                        </div>
                    </div>
                    
                    <div class="details-container" id="user-details-${tid}">
                        <div class="detail-item">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <div class="detail-label">Transaction ID</div>
                                    <div class="detail-value">${tid}</div>
                                </div>
                                <div>
                                    <div class="detail-label">Mode</div>
                                    <div class="detail-value"><span class="mode-badge ${modeClass}">${mode}</span></div>
                                </div>
                                <div>
                                    <div class="detail-label">Amount</div>
                                    <div class="detail-value font-bold">₹${amount}</div>
                                </div>
                                <div>
                                    <div class="detail-label">Date & Time</div>
                                    <div class="detail-value">${formattedDate}</div>
                                </div>
                                ${status !== 'pending' ? `
                                    <div>
                                        <div class="detail-label">Status</div>
                                        <div class="detail-value"><span class="status-badge ${statusClass}">${status}</span></div>
                                    </div>
                                    <div>
                                        <div class="detail-label">Updated</div>
                                        <div class="detail-value">${userTxn?.date || 'N/A'}</div>
                                    </div>
                                ` : ''}
                                <div class="md:col-span-2">
                                    <div class="detail-label">Bill</div>
                                    <div class="detail-value">${billLink}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;

    } catch (error) {
        console.error('Error loading user transactions:', error);
        container.innerHTML = `
            <div class="text-center py-8 text-red-500">
                <i class="fas fa-exclamation-circle text-2xl mb-2"></i>
                <p>Error loading transactions. Please try again.</p>
            </div>
        `;
    }
}

function toggleUserTransactionDetails(id) {
    const container = document.getElementById(`user-details-${id}`);
    const arrow = document.getElementById(`user-arrow-${id}`);

    if (container && arrow) {
        if (!container.classList.contains('expanded')) {
            document.querySelectorAll('.details-container.expanded').forEach(el => {
                el.classList.remove('expanded');
            });
            document.querySelectorAll('.expand-arrow.expanded').forEach(el => {
                el.classList.remove('expanded');
            });

            container.classList.add('expanded');
            arrow.classList.add('expanded');
        } else {
            container.classList.remove('expanded');
            arrow.classList.remove('expanded');
        }
    }
}

// =============================
// ✏️ User Transaction Edit (Admin)
// =============================
async function openUserTransactionEditModal(username, transactionId) {
    const modal = document.getElementById('userTransactionEditModal');
    const form = document.getElementById('userTransactionEditForm');
    form.reset();
    document.getElementById('userEditError').classList.add('hidden');
    document.getElementById('userEditSuccess').classList.add('hidden');

    try {
        const userTransactions = await api.getUserTransactions(username);
        const userTxn = userTransactions.find(t => t.transaction_id === transactionId);

        if (!userTxn) {
            alert('User transaction not found!');
            return;
        }

        const transactions = await api.getSheet('transaction_master');
        const masterTxn = transactions.find(t => (t.transaction_id || t.id) === transactionId);

        document.getElementById('userEditUsername').value = username;
        document.getElementById('userEditTransactionTitle').value = masterTxn?.title || 'Unknown';
        document.getElementById('userEditTransactionId').value = transactionId;
        document.getElementById('userEditMode').value = userTxn.mode || 'to get';
        document.getElementById('userEditStatus').value = userTxn.status || 'pending';
        document.getElementById('userEditAmount').value = userTxn.amount || '';

        const dateStr = userTxn.date || '';
        if (dateStr) {
            const date = new Date(dateStr);
            const localDateTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
            document.getElementById('userEditDate').value = localDateTime.toISOString().slice(0, 16);
        } else {
            const now = new Date();
            const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
            document.getElementById('userEditDate').value = localDateTime.toISOString().slice(0, 16);
        }

        modal.classList.remove('hidden');
    } catch (error) {
        console.error('Error opening user transaction edit:', error);
        alert('Error loading transaction details. Please try again.');
    }
}

function closeUserTransactionEditModal() {
    document.getElementById('userTransactionEditModal').classList.add('hidden');
}

async function submitUserTransactionEdit(event) {
    event.preventDefault();

    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;

    try {
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Updating...';
        submitBtn.disabled = true;

        const username = document.getElementById('userEditUsername').value;
        const transactionId = document.getElementById('userEditTransactionId').value;
        const mode = document.getElementById('userEditMode').value;
        const status = document.getElementById('userEditStatus').value;
        const amount = document.getElementById('userEditAmount').value;
        const date = document.getElementById('userEditDate').value;

        if (!mode || !status || !amount || !date) {
            showUserEditError('Please fill in all required fields');
            return;
        }

        const result = await api.updateUserTransaction(username, transactionId, mode, status, amount, date);

        if (result && result.success) {
            showUserEditSuccess('User transaction updated successfully!');
            setTimeout(() => {
                closeUserTransactionEditModal();
                loadAdminUsers();
            }, 1500);
        } else {
            throw new Error(result?.error || 'Failed to update user transaction');
        }

    } catch (error) {
        console.error('Error updating user transaction:', error);
        showUserEditError('Error: ' + error.message);
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

function showUserEditError(message) {
    const errorDiv = document.getElementById('userEditError');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
    document.getElementById('userEditSuccess').classList.add('hidden');
}

function showUserEditSuccess(message) {
    const successDiv = document.getElementById('userEditSuccess');
    successDiv.textContent = message;
    successDiv.classList.remove('hidden');
    document.getElementById('userEditError').classList.add('hidden');
}

// =============================
// 👤 Add User Functions
// =============================
function openAddUserModal() {
    document.getElementById('addUserModal').classList.remove('hidden');
    document.getElementById('addUserForm').reset();
    document.getElementById('addUserError').classList.add('hidden');
    document.getElementById('addUserSuccess').classList.add('hidden');
}

function closeAddUserModal() {
    document.getElementById('addUserModal').classList.add('hidden');
}

async function submitAddUser(event) {
    event.preventDefault();

    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;

    try {
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Adding...';
        submitBtn.disabled = true;

        const username = document.getElementById('addUserUsername').value.trim();
        const password = document.getElementById('addUserPassword').value.trim();
        const fullName = document.getElementById('addUserFullName').value.trim();
        const role = document.getElementById('addUserRole').value;

        if (!username || !password || !fullName) {
            showAddUserError('Please fill in all required fields');
            return;
        }

        const result = await api.addUser(username, password, fullName, role);

        if (result && result.success) {
            showAddUserSuccess('User added successfully!');
            document.getElementById('addUserForm').reset();
            setTimeout(() => {
                closeAddUserModal();
                loadAdminUsers();
            }, 1500);
        } else {
            throw new Error(result?.error || 'Failed to add user');
        }

    } catch (error) {
        console.error('Error adding user:', error);
        showAddUserError('Error: ' + error.message);
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

function showAddUserError(message) {
    const errorDiv = document.getElementById('addUserError');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
    document.getElementById('addUserSuccess').classList.add('hidden');
}

function showAddUserSuccess(message) {
    const successDiv = document.getElementById('addUserSuccess');
    successDiv.textContent = message;
    successDiv.classList.remove('hidden');
    document.getElementById('addUserError').classList.add('hidden');
}

// =============================
// ✏️ Edit User Functions
// =============================
async function openEditUserModal(username) {
    const modal = document.getElementById('editUserModal');
    const form = document.getElementById('editUserForm');
    form.reset();
    document.getElementById('editUserError').classList.add('hidden');
    document.getElementById('editUserSuccess').classList.add('hidden');

    try {
        const users = await api.getSheet('user_credentials');
        const user = users.find(u => u.username === username);

        if (!user) {
            alert('User not found!');
            return;
        }

        document.getElementById('editUserUsername').value = user.username;
        document.getElementById('editUserFullName').value = user.full_name || '';
        document.getElementById('editUserRole').value = user.role || 'user';

        modal.classList.remove('hidden');
    } catch (error) {
        console.error('Error opening edit user:', error);
        alert('Error loading user details. Please try again.');
    }
}

function closeEditUserModal() {
    document.getElementById('editUserModal').classList.add('hidden');
}

async function submitEditUser(event) {
    event.preventDefault();

    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;

    try {
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Updating...';
        submitBtn.disabled = true;

        const username = document.getElementById('editUserUsername').value;
        const fullName = document.getElementById('editUserFullName').value.trim();
        const role = document.getElementById('editUserRole').value;
        const newPassword = document.getElementById('editUserPassword').value.trim();

        if (!fullName) {
            showEditUserError('Please fill in all required fields');
            return;
        }

        const result = await api.updateUser(username, fullName, role, newPassword);

        if (result && result.success) {
            showEditUserSuccess('User updated successfully!');
            
            if (username === currentUser.username && newPassword) {
                showNotification('Password changed. Please login again.', 'warning', 3000);
                setTimeout(() => {
                    closeEditUserModal();
                    logout();
                }, 3000);
            } else {
                setTimeout(() => {
                    closeEditUserModal();
                    loadAdminUsers();
                }, 1500);
            }
        } else {
            throw new Error(result?.error || 'Failed to update user');
        }

    } catch (error) {
        console.error('Error updating user:', error);
        showEditUserError('Error: ' + error.message);
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

function showEditUserError(message) {
    const errorDiv = document.getElementById('editUserError');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
    document.getElementById('editUserSuccess').classList.add('hidden');
}

function showEditUserSuccess(message) {
    const successDiv = document.getElementById('editUserSuccess');
    successDiv.textContent = message;
    successDiv.classList.remove('hidden');
    document.getElementById('editUserError').classList.add('hidden');
}

// =============================
// 🔐 Change Password Functions
// =============================
function openChangePasswordModal() {
    document.getElementById('profileMenu').classList.add('hidden');
    document.getElementById('changePasswordModal').classList.remove('hidden');
    document.getElementById('changePasswordForm').reset();
    document.getElementById('changePasswordError').classList.add('hidden');
    document.getElementById('changePasswordSuccess').classList.add('hidden');
}

function closeChangePasswordModal() {
    document.getElementById('changePasswordModal').classList.add('hidden');
}

async function changePassword(event) {
    event.preventDefault();

    const currentPassword = document.getElementById('currentPassword').value.trim();
    const newPassword = document.getElementById('newPassword').value.trim();
    const confirmPassword = document.getElementById('confirmPassword').value.trim();

    const errorDiv = document.getElementById('changePasswordError');
    const successDiv = document.getElementById('changePasswordSuccess');
    const submitBtn = event.target.querySelector('button[type="submit"]');

    errorDiv.classList.add('hidden');
    successDiv.classList.add('hidden');

    if (!currentPassword || !newPassword || !confirmPassword) {
        showChangePasswordError('Please fill in all fields');
        return;
    }

    if (newPassword.length < 6) {
        showChangePasswordError('New password must be at least 6 characters long');
        return;
    }

    if (newPassword !== confirmPassword) {
        showChangePasswordError('New passwords do not match');
        return;
    }

    if (newPassword === currentPassword) {
        showChangePasswordError('New password must be different from current password');
        return;
    }

    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Changing Password...';
    submitBtn.disabled = true;

    try {
        const users = await api.getSheet("user_credentials", false);

        if (!users || users.error || !Array.isArray(users)) {
            throw new Error('Failed to fetch user data');
        }

        const user = users.find(u => {
            if (!u.username || !u.password) return false;
            return String(u.username).toLowerCase().trim() === String(currentUser.username).toLowerCase().trim() &&
                   String(u.password).trim() === String(currentPassword).trim();
        });

        if (!user) {
            throw new Error('Current password is incorrect');
        }

        const updateResult = await api.updatePassword(currentUser.username, newPassword);

        if (updateResult && updateResult.success) {
            showChangePasswordSuccess('Password changed successfully! You will be logged out in 3 seconds.');
            document.getElementById('changePasswordForm').reset();
            setTimeout(() => {
                closeChangePasswordModal();
                logout();
            }, 3000);
        } else {
            throw new Error(updateResult?.error || 'Failed to update password');
        }

    } catch (error) {
        console.error('Error changing password:', error);
        showChangePasswordError(error.message);
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

function showChangePasswordError(message) {
    const errorDiv = document.getElementById('changePasswordError');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
}

function showChangePasswordSuccess(message) {
    const successDiv = document.getElementById('changePasswordSuccess');
    successDiv.textContent = message;
    successDiv.classList.remove('hidden');
}

// =============================
// 🎯 Event Listeners
// =============================
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('signupForm').addEventListener('submit', function(e) {
        e.preventDefault();
        submitSignup();
    });

    document.getElementById('loginForm').addEventListener('submit', function(e) {
        e.preventDefault();
        login();
    });

    document.getElementById('addTransactionForm').addEventListener('submit', submitAddTransaction);
    document.getElementById('editTransactionForm').addEventListener('submit', submitEditTransaction);
    document.getElementById('userTransactionEditForm').addEventListener('submit', submitUserTransactionEdit);
    document.getElementById('addUserForm').addEventListener('submit', submitAddUser);
    document.getElementById('editUserForm').addEventListener('submit', submitEditUser);
    document.getElementById('changePasswordForm').addEventListener('submit', changePassword);
    document.getElementById('unionForm').addEventListener('submit', submitUnionTransaction);

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                this.classList.add('hidden');
            }
        });
    });

    // Close confirm dialog on overlay click
    document.getElementById('deleteConfirmDialog').addEventListener('click', function(e) {
        if (e.target === this) {
            closeDeleteConfirm();
        }
    });
});

// Restore session on load (fallback)
(function() {
    const saved = sessionStorage.getItem('transaction_session');
    if (saved && !currentUser) {
        try {
            const data = JSON.parse(saved);
            if (data.user && data.timestamp && (Date.now() - data.timestamp < 24 * 60 * 60 * 1000)) {
                currentUser = data.user;
                document.getElementById('loginPage').classList.add('hidden');
                document.getElementById('dashboardContainer').classList.remove('hidden');
                document.getElementById('welcomeUser').textContent = `Welcome, ${currentUser.name}`;
                loadUserProfile(currentUser.username);
                if (currentUser.role === 'admin') {
                    document.getElementById('userNav').classList.add('hidden');
                    document.getElementById('adminNav').classList.remove('hidden');
                    loadAdminData().then(() => showPage('adminTransactions'));
                } else {
                    document.getElementById('adminNav').classList.add('hidden');
                    document.getElementById('userNav').classList.remove('hidden');
                    loadUserTransactions().then(() => showPage('userTransactions'));
                }
                setTimeout(() => preloadCriticalData(), 100);
            }
        } catch (e) {}
    }
})();

console.log('%c📊 Transaction Manager Loaded Successfully! 📊', 'color: #4f46e5; font-size: 16px; font-weight: bold;');
