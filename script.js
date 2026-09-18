


let STORE_NAME = "OKTSHOP17";
let paymentMethodsCache = { qris: true, shopee: true }; 


const ADMIN_WA_NUMBER = "62895345452412"; 



let products = [];
let categories = ['Makanan', 'Minuman', 'Keripik'];

let cart = [];
let selectedPayment = '';
let lastOrder = null;
let currentCategory = categories[0] || '';
let orderHistory = []; 


let firestoreHasPendingWrites = false;
let firestoreListenersReady = false;



let attendanceSettingsLoaded = false;
let attendanceLogLoaded = false;




let resetAbsenLastDateByEmployee = {};






const _loadedScriptPromises = {};
function loadScriptOnce(src) {
    if (_loadedScriptPromises[src]) return _loadedScriptPromises[src];
    _loadedScriptPromises[src] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => { delete _loadedScriptPromises[src]; reject(new Error('Gagal memuat: ' + src)); };
        document.head.appendChild(s);
    });
    return _loadedScriptPromises[src];
}

async function ensureJsPDF() {
    if (window.jspdf) return;
    showToast('Menyiapkan modul cetak PDF...', 'info');
    await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.23/jspdf.plugin.autotable.min.js');
}

async function ensureQRCode() {
    if (window.QRCode) return;
    await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js');
}

async function ensureJsQR() {
    if (window.jsQR) return;
    await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/jsqr/1.4.0/jsQR.js');
}


let productSearchTerm = '';
let _productSearchDebounce = null;
function handleProductSearchInput(value) {
    clearTimeout(_productSearchDebounce);
    _productSearchDebounce = setTimeout(() => {
        productSearchTerm = value.trim().toLowerCase();
        renderCatalog();
    }, 250);
}

function init() {
    renderCategoryTabs();
    renderCategorySelects();
    filterCategory(currentCategory);
    updateCartUI();
    startClock();
    updateConnectionUI();
    updateProofBadge();
    renderHomeGreeting();
    registerServiceWorker();
    lucide.createIcons();

    
    
    setDashboardLocked(true);

    
    
    
    
    setInterval(() => {
        try {
            autoCloseForgottenShifts();
            checkMandatoryMasukGate();
            const qrContainer = document.getElementById('qr-absen-container');
            if (qrContainer && adminPanelOpen) {
                renderAttendanceQR();
            }
        } catch (err) {
            console.error('Error saat cek pergantian hari:', err);
        }
    }, 60000);

    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    
    
    
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            checkMandatoryMasukGate();
            autoCloseForgottenShifts();
        }
    });

    
    
    if (window.FB && window.FB.ready) {
        initFirestoreSync();
    } else {
        window.addEventListener('firebase-ready', initFirestoreSync, { once: true });
        
        
        setTimeout(() => {
            if (!firestoreListenersReady) {
                document.getElementById('connecting-gate').innerHTML = `
                    <button onclick="openLoginModal()" class="absolute top-5 left-5 text-white/80 hover:text-white p-2 flex items-center gap-1.5 text-xs font-bold">
                        <i data-lucide="lock" class="w-4 h-4"></i> Admin
                    </button>
                    <div class="text-center text-white px-6">
                        <i data-lucide="wifi-off" class="w-10 h-10 mx-auto mb-4"></i>
                        <p class="font-bold mb-2">Gagal terhubung ke database</p>
                        <p class="text-sm opacity-80">Cek koneksi internet, lalu refresh halaman ini.</p>
                    </div>`;
                lucide.createIcons();
            }
        }, 10000);
    }
}


function initFirestoreSync() {
    if (firestoreListenersReady) return; 
    firestoreListenersReady = true;
    const { db, doc, collection, onSnapshot, query, orderBy } = window.FB;

    
    onSnapshot(doc(db, 'config', 'products'), (snap) => {
        trackPendingWrites(snap);
        if (snap.exists() && Array.isArray(snap.data().items)) {
            products = snap.data().items;
        } else {
            products = [];
        }
        renderCatalog();
        if (adminPanelOpen) {
            renderAdminTools();
        }
    }, (err) => console.error('Sync produk gagal:', err));

    
    onSnapshot(doc(db, 'config', 'categories'), (snap) => {
        trackPendingWrites(snap);
        if (snap.exists() && Array.isArray(snap.data().items) && snap.data().items.length > 0) {
            categories = snap.data().items;
        }
        if (!currentCategory || !categories.includes(currentCategory)) {
            currentCategory = categories[0] || '';
        }
        renderCategoryTabs();
        renderCategorySelects();
        filterCategory(currentCategory);
        if (adminPanelOpen) {
            renderCategoryList();
        }
    }, (err) => console.error('Sync kategori gagal:', err));

    
    const salesQuery = query(collection(db, 'sales'), orderBy('timestamp', 'desc'));
    onSnapshot(salesQuery, (snap) => {
        trackPendingWrites(snap);
        orderHistory = snap.docs.map(d => ({ firestoreId: d.id, ...d.data() }));
        if (adminPanelOpen) {
            renderAdminTools();
        }
        if (document.getElementById('modal-sales-report') && !document.getElementById('modal-sales-report').classList.contains('hidden')) {
            renderSalesReport();
        }
    }, (err) => console.error('Sync riwayat penjualan gagal:', err));

    
    onSnapshot(doc(db, 'config', 'employees'), (snap) => {
        trackPendingWrites(snap);
        employeesCache = (snap.exists() && Array.isArray(snap.data().items)) ? snap.data().items : [];
        try {
            renderEmployeeList();
            renderScheduleTable(); 
            renderRiwayatAbsenEmployeeSelect();
            renderPerbaikanAbsenEmployeeSelect();
            if (adminPanelOpen) renderStockManageEmployeeSelect(); 
            if (adminPanelOpen) renderResetAbsenEmployeeSelect();
            if (!pinLockResolved) { renderPinLockUserList(); tryShowPinLock(); } 
        } catch (err) {
            console.error('Error saat render data karyawan:', err);
        }
    }, (err) => console.error('Sync karyawan gagal:', err));

    
    onSnapshot(doc(db, 'config', 'employeeCatalog'), (snap) => {
        trackPendingWrites(snap);
        employeeCatalogCache = snap.exists() ? snap.data() : {};
        renderCategoryTabs(); 
        if (adminPanelOpen) {
            renderEmployeeCatalogEditor();
            renderStockManageList(); 
            renderTransferStockTable(); 
        }
    }, (err) => console.error('Sync katalog karyawan gagal:', err));

    
    onSnapshot(collection(db, 'schedule'), (snap) => {
        trackPendingWrites(snap);
        scheduleCache = {};
        snap.docs.forEach(d => { scheduleCache[d.id] = d.data(); });
        renderScheduleTable();
        try { checkMandatoryMasukGate(); } catch (err) { console.error('Error re-cek gerbang absen setelah jadwal berubah:', err); } 
    }, (err) => console.error('Sync jadwal karyawan gagal:', err));

    
    
    
    
    

    
    
    
    onSnapshot(doc(db, 'config', 'attendanceSettings'), (snap) => {
        trackPendingWrites(snap);
        attendanceSettingsLoaded = true;
        tryCloseConnectingGate(); 
        
        try {
            refreshAttendanceAdminViews();
            checkMandatoryMasukGate();
            tryShowPinLock();
        } catch (err) {
            console.error('Error saat proses data absen (settings):', err);
        }
    }, (err) => console.error('Sync pengaturan absen gagal:', err));

    
    onSnapshot(doc(db, 'config', 'storeProfile'), (snap) => {
        trackPendingWrites(snap);
        if (snap.exists() && snap.data().name) {
            STORE_NAME = snap.data().name;
            applyStoreName();
        }
    }, (err) => console.error('Sync profile toko gagal:', err));

    
    onSnapshot(doc(db, 'config', 'paymentMethods'), (snap) => {
        trackPendingWrites(snap);
        const data = snap.exists() ? snap.data() : {};
        
        
        paymentMethodsCache = {
            qris: data.qris !== false,
            shopee: data.shopee !== false
        };
        renderPaymentMethodsAdmin();
        updateCheckoutPaymentButtons();
    }, (err) => console.error('Sync metode pembayaran gagal:', err));

    
    
    

    
    onSnapshot(doc(db, 'config', 'resetAbsenLog'), (snap) => {
        trackPendingWrites(snap);
        resetAbsenLastDateByEmployee = snap.exists() ? snap.data() : {};
        renderResetAbsenButton();
    }, (err) => console.error('Sync log reset absen gagal:', err));

    
    onSnapshot(collection(db, 'attendance'), (snap) => {
        trackPendingWrites(snap);
        attendanceLogCache = snap.docs.map(d => d.data());
        attendanceLogLoaded = true;
        tryCloseConnectingGate(); 
        try {
            renderRiwayatAbsen();
            loadPerbaikanAbsenRecord(); 
            checkMandatoryMasukGate();
            renderCategoryTabs(); 
            updateCashRekonLockState(); 
            tryShowPinLock();
            autoCloseForgottenShifts(); 
            if (document.getElementById('modal-absen-popup') && !document.getElementById('modal-absen-popup').classList.contains('hidden')) {
                renderAbsenPopup();
            }
        } catch (err) {
            console.error('Error saat proses data absen (riwayat):', err);
        }
    }, (err) => console.error('Sync absensi gagal:', err));

    updateConnectionUI();
}


let adminOnlyFirestoreSyncReady = false;
function initAdminOnlyFirestoreSync() {
    if (adminOnlyFirestoreSyncReady) return; 
    if (!window.FB || !window.FB.ready) return; 
    adminOnlyFirestoreSyncReady = true;
    const { db, collection, onSnapshot } = window.FB;

    onSnapshot(collection(db, 'cashReconciliation'), (snap) => {
        trackPendingWrites(snap);
        cashReconciliationCache = snap.docs.map(d => d.data());
        try { renderCashReconciliationTable(); } catch (err) { console.error('Error render tabel input sales:', err); }
    }, (err) => console.error('Sync input sales gagal:', err));
}




function tryCloseConnectingGate() {
    if (attendanceSettingsLoaded && attendanceLogLoaded) {
        document.getElementById('connecting-gate').classList.add('hidden');
    }
}


function trackPendingWrites(snap) {
    firestoreHasPendingWrites = snap.metadata.hasPendingWrites;
    updateConnectionUI();
}


function startClock() {
    updateClock();
    setInterval(updateClock, 1000);
}

function updateClock() {
    const now = new Date();
    const time = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const date = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const clockEl = document.getElementById('live-clock');
    const dateEl = document.getElementById('live-date');
    if (clockEl) clockEl.innerText = time;
    if (dateEl) dateEl.innerText = date;

    checkMandatoryMasukGate();
}







function updateConnectionUI() {
    const btn = document.getElementById('btn-transfer');
    const badge = document.getElementById('pending-badge');
    if (!btn) return;

    btn.classList.remove('is-online', 'is-offline', 'is-syncing');
    const icon = btn.querySelector('i');

    if (!navigator.onLine) {
        btn.classList.add('is-offline');
        if (icon) icon.setAttribute('data-lucide', 'cloud-off');
    } else if (firestoreHasPendingWrites) {
        btn.classList.add('is-syncing');
        if (icon) icon.setAttribute('data-lucide', 'refresh-cw');
    } else {
        btn.classList.add('is-online');
        if (icon) icon.setAttribute('data-lucide', 'cloud-check');
    }

    
    if (badge) {
        if (firestoreHasPendingWrites) {
            badge.textContent = '!';
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
    lucide.createIcons();
}



function showOutOfStockToast(productName) {
    showToast(`${productName} - Stock habis!`, 'danger');
}

function showToast(message, type = '') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}




function transferData() {
    if (!navigator.onLine) {
        showToast('Sedang offline. Perubahan tersimpan di HP ini dan akan otomatis sinkron ke server saat online kembali.', 'warn');
    } else if (firestoreHasPendingWrites) {
        showToast('Sedang menyinkronkan data ke server...', '');
    } else {
        showToast('Semua data sudah tersinkron ke server.', 'success');
    }
}

function handleOnline() {
    updateConnectionUI();
    showToast('Koneksi online kembali. Menyinkronkan data...', 'success');

    
    
    
    const pending = getPendingProofs();
    if (pending.length > 0) {
        showToast(`${pending.length} bukti bayar QRIS menunggu dikirim. Tap ikon kamera di pojok kanan atas.`, 'warn');
    }
}

function handleOffline() {
    updateConnectionUI();
    showToast('Koneksi terputus. Aplikasi tetap bisa digunakan (offline), data akan sinkron otomatis nanti.', 'warn');
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {
            
        });
    }
}


function renderCategoryTabs() {
    const container = document.getElementById('tabs-container');
    if (!container) return;
    
    
    const visibleCategories = getVisibleCategoriesForCurrentKasir();
    if (!visibleCategories.includes(currentCategory)) {
        currentCategory = visibleCategories[0] || '';
    }
    container.innerHTML = visibleCategories.map(cat => `
        <button onclick="filterCategory('${cat.replace(/'/g, "\\'")}')" id="tab-${cat}" class="category-tab whitespace-nowrap ${cat === currentCategory ? 'active' : ''}">${cat}</button>
    `).join('');
    renderCatalog();
}

function filterCategory(cat) {
    currentCategory = cat;
    document.querySelectorAll('.category-tab').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeTab = document.getElementById(`tab-${cat}`);
    if (activeTab) activeTab.classList.add('active');
    renderCatalog();
}

function renderCatalog() {
    const grid = document.getElementById('catalog-grid');
    if (!grid) return;

    
    
    
    if (!firestoreListenersReady) {
        grid.innerHTML = Array.from({ length: 6 }).map(() => `
            <div class="skeleton-card p-5 rounded-[1.75rem]">
                <div class="skeleton-line w-3/4 h-4 mb-3 rounded-full"></div>
                <div class="skeleton-line w-1/2 h-4 rounded-full"></div>
            </div>`).join('');
        return;
    }

    
    
    const visibleProducts = getVisibleProductsForCurrentKasir();
    let filtered = visibleProducts.filter(p => p.category === currentCategory);
    if (productSearchTerm) {
        
        
        filtered = visibleProducts.filter(p => p.name.toLowerCase().includes(productSearchTerm));
    }
    grid.innerHTML = filtered.map((p, idx) => {
        const hasVariant = p.variantConfig && p.variantConfig.enabled;
        const effectiveStock = getEffectiveStockForCurrentKasir(p);
        const isOutOfStock = effectiveStock != null && effectiveStock <= 0;
        const clickAction = isOutOfStock ? `showOutOfStockToast('${p.name.replace(/'/g, "\\'")}')` : (hasVariant ? `openVariantModal(${p.id})` : `addToCartWithBump(event, ${p.id})`);
        return `
        <div onclick="${clickAction}" style="animation-delay:${idx * 0.03}s" class="product-card p-5 rounded-[1.75rem] relative ${isOutOfStock ? 'opacity-50 grayscale cursor-not-allowed' : 'cursor-pointer'}">
            ${isOutOfStock ? `<span class="absolute top-3 right-3 bg-red-100 text-red-600 text-[9px] font-bold px-2 py-1 rounded-full">HABIS</span>` : hasVariant ? `<span class="absolute top-3 right-3 bg-blue-100 text-blue-600 text-[9px] font-bold px-2 py-1 rounded-full">PILIH ISI</span>` : ''}
            <h3 class="font-extrabold text-slate-800 text-sm mb-2 leading-tight pr-2">${p.name}</h3>
            <p class="text-blue-600 font-black">Rp ${p.price.toLocaleString()}</p>
            ${(!isOutOfStock && effectiveStock != null) ? `<p class="text-[10px] text-slate-400 font-semibold mt-1">Sisa ${effectiveStock}</p>` : ''}
        </div>`;
    }).join('') || `<div class="col-span-full text-center py-10 text-slate-400 text-sm">${productSearchTerm ? 'Produk tidak ditemukan' : 'Belum ada menu di kategori ini'}</div>`;
}


function toggleVariantFields(prefix) {
    const enabled = document.getElementById(`${prefix}-variant-enabled`).checked;
    document.getElementById(`${prefix}-variant-fields`).classList.toggle('hidden', !enabled);
}

function readVariantConfig(prefix) {
    const enabled = document.getElementById(`${prefix}-variant-enabled`).checked;
    if (!enabled) return { enabled: false };
    const count = parseInt(document.getElementById(`${prefix}-variant-count`).value) || 1;
    const sourceCategory = document.getElementById(`${prefix}-variant-source`).value;
    return { enabled: true, count, sourceCategory };
}

function addProduct() {
    const name = document.getElementById('add-name').value;
    const price = parseInt(document.getElementById('add-price').value);
    const category = document.getElementById('add-category').value;
    const variantConfig = readVariantConfig('add');

    if (!name || isNaN(price) || price < 0) return alert("Harap isi Nama dan Harga (boleh 0 untuk item pilihan rasa)!");
    if (variantConfig.enabled && !variantConfig.sourceCategory) return alert("Pilih kategori sumber untuk pilihan isi/rasa!");

    const newProduct = {
        id: Date.now(), 
        name: name,
        price: price,
        category: category,
        variantConfig: variantConfig
    };

    saveProductsToFirestore([...products, newProduct]);

    
    document.getElementById('add-name').value = '';
    document.getElementById('add-price').value = '';
    document.getElementById('add-variant-enabled').checked = false;
    document.getElementById('add-variant-count').value = '';
    toggleVariantFields('add');
    alert("Produk berhasil ditambahkan!");
}

function loadProductData() {
    const id = parseInt(document.getElementById('edit-select').value);
    const product = products.find(p => p.id === id);
    if (product) {
        document.getElementById('edit-name').value = product.name;
        document.getElementById('edit-price').value = product.price;
        document.getElementById('edit-category').value = product.category;

        const vc = product.variantConfig || { enabled: false };
        document.getElementById('edit-variant-enabled').checked = !!vc.enabled;
        document.getElementById('edit-variant-count').value = vc.count || '';
        toggleVariantFields('edit');
        if (vc.sourceCategory) document.getElementById('edit-variant-source').value = vc.sourceCategory;
    }
}

function updateProduct() {
    const id = parseInt(document.getElementById('edit-select').value);
    const idx = products.findIndex(p => p.id === id);
    const variantConfig = readVariantConfig('edit');
    if (variantConfig.enabled && !variantConfig.sourceCategory) return alert("Pilih kategori sumber untuk pilihan isi/rasa!");
    if (idx !== -1) {
        const updated = [...products];
        updated[idx] = {
            ...updated[idx],
            name: document.getElementById('edit-name').value,
            price: parseInt(document.getElementById('edit-price').value),
            category: document.getElementById('edit-category').value,
            variantConfig: variantConfig
        };
        saveProductsToFirestore(updated);
        alert('Berhasil diperbarui!');
    }
}

function deleteProduct() {
    const id = parseInt(document.getElementById('edit-select').value);
    if (confirm("Hapus menu ini dari katalog?")) {
        saveProductsToFirestore(products.filter(p => p.id !== id));
        alert('Produk dihapus!');
    }
}



function saveProductsToFirestore(newProducts) {
    if (!window.FB || !window.FB.ready) {
        showToast('Belum terhubung ke database. Coba lagi sebentar.', 'warn');
        return;
    }
    const { db, doc, setDoc } = window.FB;
    setDoc(doc(db, 'config', 'products'), { items: newProducts }).catch((err) => {
        console.error('Gagal simpan produk:', err);
        showToast('Gagal menyimpan produk ke server.', 'warn');
    });
}


function renderCategorySelects() {
    const options = categories.map(c => `<option value="${c}">${c}</option>`).join('');
    const addSelect = document.getElementById('add-category');
    const editSelect = document.getElementById('edit-category');
    const addVariantSource = document.getElementById('add-variant-source');
    const editVariantSource = document.getElementById('edit-variant-source');
    if (addSelect) addSelect.innerHTML = options;
    if (editSelect) editSelect.innerHTML = options;
    if (addVariantSource) addVariantSource.innerHTML = options;
    if (editVariantSource) editVariantSource.innerHTML = options;
}

function renderCategoryList() {
    const list = document.getElementById('category-list');
    if (!list) return;
    list.innerHTML = categories.map(cat => {
        const count = products.filter(p => p.category === cat).length;
        return `
        <div class="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl p-3">
            <div>
                <span class="font-bold text-sm text-slate-800">${cat}</span>
                <span class="text-[10px] text-slate-400 ml-2">${count} produk</span>
            </div>
            <button onclick="deleteCategory('${cat.replace(/'/g, "\\'")}')" class="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
        </div>`;
    }).join('') || '<p class="text-xs text-slate-400">Belum ada kategori</p>';
    lucide.createIcons();
}

function saveCategoriesToFirestore(newCategories) {
    if (!window.FB || !window.FB.ready) {
        showToast('Belum terhubung ke database. Coba lagi sebentar.', 'warn');
        return;
    }
    const { db, doc, setDoc } = window.FB;
    setDoc(doc(db, 'config', 'categories'), { items: newCategories }).catch((err) => {
        console.error('Gagal simpan kategori:', err);
        showToast('Gagal menyimpan kategori ke server.', 'warn');
    });
}

function addCategory() {
    const input = document.getElementById('new-category-name');
    const name = input.value.trim();
    if (!name) return alert('Nama kategori tidak boleh kosong!');
    if (categories.some(c => c.toLowerCase() === name.toLowerCase())) {
        return alert('Kategori tersebut sudah ada!');
    }
    saveCategoriesToFirestore([...categories, name]);
    input.value = '';
}

function deleteCategory(cat) {
    const used = products.filter(p => p.category === cat).length;
    if (used > 0) {
        return alert(`Kategori "${cat}" masih dipakai oleh ${used} produk. Pindahkan atau hapus produk tersebut dulu sebelum menghapus kategorinya.`);
    }
    if (!confirm(`Hapus kategori "${cat}"?`)) return;
    saveCategoriesToFirestore(categories.filter(c => c !== cat));
}

function renderAdminTools() {
    applyStoreName(); 
    renderPaymentMethodsAdmin(); 
    const select = document.getElementById('edit-select');
    select.innerHTML = products.map(p => `<option value="${p.id}">${p.name} [${p.category}]</option>`).join('');
    renderCategorySelects();
    renderCategoryList();
    renderStockManageEmployeeSelect();
    renderTransferStockTable();
    renderEmployeeCatalogSelect();
    renderScheduleTable();
    renderRiwayatAbsenEmployeeSelect();
    renderResetAbsenEmployeeSelect();
    renderCashRekonFilterOptions();
    renderCashReconciliationTable();
    loadProductData();

    
    
    renderTotalPenjualanFilterOptions();
    resetTotalPenjualanFilter();

    
    renderProductSalesFilterOptions();
    renderProductSalesTable();
}





function getCashSalesForEmployeeDate(empId, dateStr) {
    return orderHistory
        .filter(o => o.employeeId === empId && o.method === 'Cash' && o.timestamp && getTodayDateStr(new Date(o.timestamp)) === dateStr)
        .reduce((sum, o) => sum + (o.total || 0), 0);
}

function renderCashRekonFilterOptions() {
    const select = document.getElementById('cashrek-employee');
    if (!select) return;
    const prevValue = select.value;
    select.innerHTML = '<option value="">Pilih Karyawan</option>' + employeesCache.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
    if (Array.from(select.options).some(o => o.value === prevValue)) select.value = prevValue;

    const dateInput = document.getElementById('cashrek-date');
    if (dateInput && !dateInput.value) dateInput.value = getTodayDateStr();

    updateCashRekonLockState();
}




function updateCashRekonLockState() {
    const dateInput = document.getElementById('cashrek-date');
    const empSelect = document.getElementById('cashrek-employee');
    const submitBtn = document.getElementById('cashrek-submit-btn');
    const warning = document.getElementById('cashrek-lock-warning');
    if (!dateInput || !empSelect || !submitBtn || !warning) return;

    const dateStr = dateInput.value;
    const empId = empSelect.value;

    
    
    if (!dateStr || !empId) {
        submitBtn.disabled = true;
        warning.classList.add('hidden');
        return;
    }

    const record = attendanceLogCache.find(r => r.date === dateStr && r.employeeId === empId);
    const empName = (employeesCache.find(e => e.id === empId) || {}).name || 'Karyawan ini';

    if (!record || !record.keluarTime) {
        submitBtn.disabled = true;
        warning.textContent = `${empName} belum absen keluar di tanggal ${dateStr}. Input baru bisa diisi setelah shift-nya selesai.`;
        warning.classList.remove('hidden');
    } else {
        submitBtn.disabled = false;
        warning.classList.add('hidden');
    }
}

function submitCashReconciliation() {
    const dateInput = document.getElementById('cashrek-date');
    const empSelect = document.getElementById('cashrek-employee');
    const nominalInput = document.getElementById('cashrek-nominal');

    const dateStr = dateInput ? dateInput.value : '';
    const empId = empSelect ? empSelect.value : '';
    const nominal = nominalInput ? parseInt(nominalInput.value, 10) : NaN;

    if (!dateStr) return alert('Pilih tanggal dulu!');
    if (!empId) return alert('Pilih karyawan dulu!');

    
    
    const record = attendanceLogCache.find(r => r.date === dateStr && r.employeeId === empId);
    if (!record || !record.keluarTime) {
        return alert('Karyawan ini belum absen keluar di tanggal tersebut. Input baru bisa diisi setelah shift-nya selesai.');
    }

    if (isNaN(nominal) || nominal < 0) return alert('Isi nominal uang cash yang benar!');
    if (!window.FB || !window.FB.ready) return showToast('Belum terhubung ke database. Coba lagi sebentar.', 'warn');

    const actualCash = getCashSalesForEmployeeDate(empId, dateStr);
    renderCashReconciliationResult(nominal, actualCash);

    const empName = (employeesCache.find(e => e.id === empId) || {}).name || '';
    const { db, doc, setDoc } = window.FB;
    setDoc(doc(db, 'cashReconciliation', `${dateStr}_${empId}`), {
        date: dateStr,
        employeeId: empId,
        employeeName: empName,
        inputAmount: nominal,
        timestamp: new Date().toISOString()
    }).catch((err) => {
        console.error('Gagal simpan input sales:', err);
        showToast('Gagal menyimpan ke server.', 'warn');
    });
}

function formatSelisih(selisih) {
    if (selisih === 0) return 'Rp 0';
    return selisih > 0 ? `+Rp ${selisih.toLocaleString()}` : `-Rp ${Math.abs(selisih).toLocaleString()}`;
}


function renderCashReconciliationResult(inputAmount, actualCash) {
    const box = document.getElementById('cashrek-result');
    if (!box) return;
    box.classList.remove('hidden');
    const selisih = inputAmount - actualCash;

    if (selisih === 0) {
        box.innerHTML = `
        <div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center">
            <p class="text-2xl font-black text-emerald-700">Rp ${inputAmount.toLocaleString()} <span>&#9989;</span></p>
            <p class="text-xs text-emerald-600 font-semibold mt-1">Sesuai dengan penjualan cash tercatat</p>
        </div>`;
    } else {
        box.innerHTML = `
        <div class="bg-red-50 border border-red-200 rounded-2xl p-5 text-center">
            <p class="text-2xl font-black text-red-600">${formatSelisih(selisih)} <span>&#10060;</span></p>
            <p class="text-xs text-red-500 font-semibold mt-1">Selisih dari penjualan cash tercatat</p>
            <p class="text-xs text-slate-500 font-semibold mt-2">Total seharusnya: <span class="font-bold text-slate-700">Rp ${actualCash.toLocaleString()}</span></p>
        </div>`;
    }
}


function renderCashReconciliationTable() {
    const tbody = document.getElementById('cashrek-history-body');
    if (!tbody) return;

    const rows = cashReconciliationCache.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);

    tbody.innerHTML = rows.map(r => {
        const actualCash = getCashSalesForEmployeeDate(r.employeeId, r.date);
        const selisih = (r.inputAmount || 0) - actualCash;
        const dateObj = new Date(r.date + 'T00:00:00');
        const tglLabel = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
        const selisihClass = selisih === 0 ? 'text-emerald-600' : 'text-red-600';
        return `
        <tr class="border-b border-slate-100">
            <td class="p-3 font-semibold text-slate-700 whitespace-nowrap">${tglLabel}</td>
            <td class="p-3 text-slate-600 whitespace-nowrap">${r.employeeName || '-'}</td>
            <td class="p-3 text-right text-slate-600 whitespace-nowrap">Rp ${actualCash.toLocaleString()}</td>
            <td class="p-3 text-right text-slate-600 whitespace-nowrap">Rp ${(r.inputAmount || 0).toLocaleString()}</td>
            <td class="p-3 text-right font-bold ${selisihClass} whitespace-nowrap">${formatSelisih(selisih)}</td>
        </tr>`;
    }).join('') || `<tr><td colspan="5" class="text-center p-6 text-slate-400 text-xs">Belum ada input sales</td></tr>`;
}

async function downloadCashReconciliationPDF() {
    const dateInput = document.getElementById('cashrek-date');
    const monthVal = (dateInput && dateInput.value) ? dateInput.value.slice(0, 7) : getTodayDateStr().slice(0, 7);
    const rows = cashReconciliationCache.filter(r => r.date.startsWith(monthVal)).sort((a, b) => a.date.localeCompare(b.date));

    if (rows.length === 0) return alert('Tidak ada data input sales di bulan ini.');

    await ensureJsPDF();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const monthLabel = new Date(`${monthVal}-01T00:00:00`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    doc.text(`Input Total Penjualan - ${monthLabel}`, 10, 10);

    const data = rows.map(r => {
        const actualCash = getCashSalesForEmployeeDate(r.employeeId, r.date);
        const selisih = (r.inputAmount || 0) - actualCash;
        const dateObj = new Date(r.date + 'T00:00:00');
        const tglLabel = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
        return [tglLabel, r.employeeName || '-', `Rp ${actualCash.toLocaleString()}`, `Rp ${(r.inputAmount || 0).toLocaleString()}`, formatSelisih(selisih)];
    });

    doc.autoTable({ head: [['Tgl/Bln/Thn', 'User', 'Cash Penjualan', 'Input', 'Selisih']], body: data, startY: 18 });
    doc.save(`Input-Sales-${monthVal}.pdf`);
}


function renderTotalPenjualanFilterOptions() {
    const select = document.getElementById('report-filter-employee');
    if (!select) return;
    const prevValue = select.value;
    select.innerHTML = '<option value="">Semua Karyawan</option>' + employeesCache.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
    if (Array.from(select.options).some(o => o.value === prevValue)) select.value = prevValue;

    const monthInput = document.getElementById('report-filter-month');
    if (monthInput && !monthInput.value) monthInput.value = getTodayDateStr().slice(0, 7);
}

function groupOrdersByDateUser(filtered) {
    const groups = {};
    filtered.forEach(o => {
        const dateStr = getTodayDateStr(new Date(o.timestamp));
        const userName = o.employeeName || 'Tanpa Nama';
        const key = dateStr + '|' + userName;
        if (!groups[key]) groups[key] = { date: dateStr, user: userName, total: 0, qty: 0 };
        groups[key].total += (o.total || 0);
        groups[key].qty += 1;
    });
    return Object.values(groups).sort((a, b) => a.date === b.date ? a.user.localeCompare(b.user) : a.date.localeCompare(b.date));
}

function getSelectedReportEmployeeId() {
    const empSelect = document.getElementById('report-filter-employee');
    return empSelect ? empSelect.value : '';
}

function getRecentSalesRows(days) {
    const empId = getSelectedReportEmployeeId();
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - (days - 1));
    const filtered = orderHistory.filter(o => {
        if (empId && o.employeeId !== empId) return false;
        if (!o.timestamp) return false;
        return new Date(o.timestamp) >= cutoff;
    });
    return groupOrdersByDateUser(filtered);
}

function getMonthlySalesRows() {
    const empId = getSelectedReportEmployeeId();
    const monthInput = document.getElementById('report-filter-month');
    const monthVal = (monthInput && monthInput.value) ? monthInput.value : getTodayDateStr().slice(0, 7);
    const filtered = orderHistory.filter(o => {
        if (empId && o.employeeId !== empId) return false;
        if (!o.timestamp || !getTodayDateStr(new Date(o.timestamp)).startsWith(monthVal)) return false;
        return true;
    });
    return groupOrdersByDateUser(filtered);
}

function renderTotalPenjualanRows(tbodyId, rows, emptyMsg) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center p-6 text-slate-400 text-xs">${emptyMsg}</td></tr>`;
        return;
    }

    const bodyRows = rows.map(r => {
        const dateObj = new Date(r.date + 'T00:00:00');
        const tglLabel = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
        const avg = r.qty > 0 ? Math.round(r.total / r.qty) : 0;
        return `
        <tr class="border-b border-slate-100">
            <td class="p-3 font-semibold text-slate-700 whitespace-nowrap">${tglLabel}</td>
            <td class="p-3 text-slate-600 whitespace-nowrap">${r.user}</td>
            <td class="p-3 text-right font-bold text-emerald-600 whitespace-nowrap">Rp ${r.total.toLocaleString()}</td>
            <td class="p-3 text-right text-slate-500">${r.qty}</td>
            <td class="p-3 text-right text-slate-500 whitespace-nowrap">Rp ${avg.toLocaleString()}</td>
        </tr>`;
    }).join('');

    const totalSales = rows.reduce((sum, r) => sum + r.total, 0);
    const totalQty = rows.reduce((sum, r) => sum + r.qty, 0);
    const totalAvg = totalQty > 0 ? Math.round(totalSales / totalQty) : 0;
    const totalRow = `
    <tr class="bg-emerald-50 border-t-2 border-emerald-200">
        <td class="p-3 font-black text-emerald-800" colspan="2">TOTAL</td>
        <td class="p-3 text-right font-black text-emerald-800 whitespace-nowrap">Rp ${totalSales.toLocaleString()}</td>
        <td class="p-3 text-right font-black text-emerald-800">${totalQty}</td>
        <td class="p-3 text-right font-black text-emerald-800 whitespace-nowrap">Rp ${totalAvg.toLocaleString()}</td>
    </tr>`;

    tbody.innerHTML = bodyRows + totalRow;
}

function previewTotalPenjualan7Hari() {
    const rows = getRecentSalesRows(7);
    renderTotalPenjualanRows('total-penjualan-body', rows, 'Belum ada transaksi 7 hari terakhir');
    document.getElementById('total-penjualan-7hari-wrap').classList.remove('hidden');
    document.getElementById('total-penjualan-bulan-wrap').classList.add('hidden');
}

function previewTotalPenjualanFullBulan() {
    const monthInput = document.getElementById('report-filter-month');
    if (monthInput && !monthInput.value) monthInput.value = getTodayDateStr().slice(0, 7);
    const rows = getMonthlySalesRows();
    renderTotalPenjualanRows('total-penjualan-bulan-body', rows, 'Belum ada transaksi di bulan ini');
    document.getElementById('total-penjualan-bulan-wrap').classList.remove('hidden');
    document.getElementById('total-penjualan-7hari-wrap').classList.add('hidden');
}

function resetTotalPenjualanFilter() {
    const empSelect = document.getElementById('report-filter-employee');
    const monthInput = document.getElementById('report-filter-month');
    if (empSelect) empSelect.value = '';
    if (monthInput) monthInput.value = getTodayDateStr().slice(0, 7);
    const wrap7 = document.getElementById('total-penjualan-7hari-wrap');
    const wrapBulan = document.getElementById('total-penjualan-bulan-wrap');
    if (wrap7) wrap7.classList.add('hidden');
    if (wrapBulan) wrapBulan.classList.add('hidden');
}


function renderProductSalesFilterOptions() {
    const select = document.getElementById('prodsales-employee');
    const dateInput = document.getElementById('prodsales-date');
    if (!select) return;
    const prevValue = select.value;
    select.innerHTML = '<option value="">Semua Karyawan</option>' + employeesCache.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
    if (Array.from(select.options).some(o => o.value === prevValue)) select.value = prevValue;

    
    if (dateInput && !dateInput.value) dateInput.value = getTodayDateStr();
}


function getOrdersForDate(dateStr, empId) {
    return orderHistory.filter(o => {
        if (!o.timestamp) return false;
        if (getTodayDateStr(new Date(o.timestamp)) !== dateStr) return false;
        if (empId && o.employeeId !== empId) return false;
        return true;
    });
}




function getProductSalesForDate(dateStr, empId) {
    const map = {};
    getOrdersForDate(dateStr, empId).forEach(o => {
        (o.items || []).forEach(item => {
            if (!map[item.name]) map[item.name] = { name: item.name, qty: 0, nominal: 0 };
            map[item.name].qty += item.qty;
            map[item.name].nominal += item.price * item.qty;
        });
    });
    return Object.values(map).sort((a, b) => b.qty - a.qty); 
}

function renderProductSalesTable() {
    const dateInput = document.getElementById('prodsales-date');
    const empSelect = document.getElementById('prodsales-employee');
    const tbody = document.getElementById('prodsales-body');
    if (!tbody) return;

    const dateStr = (dateInput && dateInput.value) ? dateInput.value : getTodayDateStr();
    const empId = empSelect ? empSelect.value : '';
    const rows = getProductSalesForDate(dateStr, empId);

    if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-center p-6 text-slate-400 text-xs">Belum ada penjualan di tanggal ini</td></tr>`;
        return;
    }

    const bodyRows = rows.map(r => `
        <tr class="border-b border-slate-100">
            <td class="p-3 font-semibold text-slate-700">${r.name}</td>
            <td class="p-3 text-right text-slate-600">${r.qty}</td>
            <td class="p-3 text-right font-bold text-emerald-600 whitespace-nowrap">Rp ${r.nominal.toLocaleString()}</td>
        </tr>`).join('');

    const totalQty = rows.reduce((sum, r) => sum + r.qty, 0);
    const totalNominal = rows.reduce((sum, r) => sum + r.nominal, 0);
    const totalRow = `
    <tr class="bg-emerald-50 border-t-2 border-emerald-200">
        <td class="p-3 font-black text-emerald-800">TOTAL</td>
        <td class="p-3 text-right font-black text-emerald-800">${totalQty}</td>
        <td class="p-3 text-right font-black text-emerald-800 whitespace-nowrap">Rp ${totalNominal.toLocaleString()}</td>
    </tr>`;

    tbody.innerHTML = bodyRows + totalRow;
}




function renderStockManageEmployeeSelect() {
    const select = document.getElementById('stockmanage-employee-select');
    if (!select) return;
    const prevValue = select.value;
    select.innerHTML = employeesCache.map(e => `<option value="${e.id}">${e.name}</option>`).join('') || '<option value="">Belum ada karyawan</option>';
    if (employeesCache.some(e => e.id === prevValue)) select.value = prevValue;
    renderStockManageList();
}

function renderStockManageList() {
    const list = document.getElementById('stock-manage-list');
    if (!list) return;
    if (employeesCache.length === 0) {
        list.innerHTML = '<p class="text-xs text-slate-400 text-center py-6">Tambahkan karyawan dulu di "Kelola Karyawan" sebelum mengatur stock per kasir.</p>';
        return;
    }
    const select = document.getElementById('stockmanage-employee-select');
    const empId = select ? select.value : '';
    if (!empId) {
        list.innerHTML = '<p class="text-xs text-slate-400 text-center py-6">Pilih kasir dulu.</p>';
        return;
    }
    const assigned = employeeCatalogCache[empId] || [];
    if (assigned.length === 0) {
        list.innerHTML = '<p class="text-xs text-slate-400 text-center py-6">Kasir ini belum punya produk aktif. Aktifkan dulu produknya di menu Produk &gt; Katalog Per Karyawan.</p>';
        return;
    }
    list.innerHTML = assigned.map(a => {
        const p = products.find(pp => pp.id === a.productId);
        if (!p) return '';
        return `
        <div class="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center justify-between gap-3">
            <div class="min-w-0 flex-1">
                <p class="font-bold text-sm text-slate-800 truncate">${p.name}</p>
                <p class="text-[10px] text-slate-400">${p.category}</p>
            </div>
            <input
                type="number"
                min="0"
                value="${a.qty ?? ''}"
                placeholder="∞"
                data-stock-product="${p.id}"
                class="w-24 p-2 text-center border border-slate-200 rounded-lg outline-none text-xs font-bold shrink-0"
            >
        </div>`;
    }).join('') || '<p class="text-xs text-slate-400 text-center py-6">Belum ada produk</p>';
}

function getEmployeeStockQty(empId, productId) {
    const assigned = employeeCatalogCache[empId] || [];
    const entry = assigned.find(a => a.productId === productId);
    return entry ? entry.qty : null;
}

function saveStockManageChanges() {
    if (!window.FB || !window.FB.ready) return showToast('Belum terhubung ke database. Coba lagi sebentar.', 'warn');
    const select = document.getElementById('stockmanage-employee-select');
    const empId = select ? select.value : '';
    if (!empId) return showToast('Pilih kasir dulu.', 'warn');

    const assigned = [...(employeeCatalogCache[empId] || [])];
    document.querySelectorAll('#stock-manage-list input[data-stock-product]').forEach(input => {
        const productId = parseInt(input.getAttribute('data-stock-product'));
        const qty = (input.value === '' || input.value === null) ? null : Math.max(0, parseInt(input.value) || 0);
        const idx = assigned.findIndex(a => a.productId === productId);
        if (idx !== -1) assigned[idx] = { ...assigned[idx], qty };
    });

    const { db, doc, setDoc } = window.FB;
    showToast('Menyimpan stock...', 'info');
    setDoc(doc(db, 'config', 'employeeCatalog'), { [empId]: assigned }, { merge: true }).then(() => {
        showToast('Stock berhasil disimpan!', 'success');
    }).catch((err) => {
        console.error('Gagal simpan stock:', err);
        showToast('Gagal menyimpan stock ke server. Coba lagi.', 'warn');
    });
}





function renderTransferStockTable() {
    const headRow = document.getElementById('transfer-stock-table-head-row');
    const body = document.getElementById('transfer-stock-table-body');
    const productSelect = document.getElementById('transfer-product-select');
    const fromSelect = document.getElementById('transfer-from-select');
    const toSelect = document.getElementById('transfer-to-select');
    if (!headRow || !body || !productSelect || !fromSelect || !toSelect) return;

    if (employeesCache.length < 2) {
        headRow.innerHTML = '<th class="text-left p-2 font-bold sticky left-0 bg-slate-50 z-10">Produk</th>';
        body.innerHTML = '<tr><td class="p-3 text-center text-slate-400">Butuh minimal 2 karyawan terdaftar untuk bisa transfer stock.</td></tr>';
        productSelect.innerHTML = '';
        fromSelect.innerHTML = '';
        toSelect.innerHTML = '';
        return;
    }

    headRow.innerHTML = '<th class="text-left p-2 font-bold sticky left-0 bg-slate-50 z-10">Produk</th>' +
        employeesCache.map(emp => `<th class="text-center p-2 font-bold">${emp.name}</th>`).join('');

    body.innerHTML = products.map(p => `
        <tr class="border-t border-slate-100">
            <td class="p-2 font-semibold text-slate-700 sticky left-0 bg-white">${p.name}</td>
            ${employeesCache.map(emp => {
                const qty = getEmployeeStockQty(emp.id, p.id);
                return `<td class="p-2 text-center ${qty === 0 ? 'text-red-500 font-bold' : 'text-slate-600'}">${qty ?? '∞'}</td>`;
            }).join('')}
        </tr>
    `).join('') || '<tr><td class="p-3 text-center text-slate-400">Belum ada produk</td></tr>';

    const prevProduct = productSelect.value;
    productSelect.innerHTML = products.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    if (products.some(p => String(p.id) === prevProduct)) productSelect.value = prevProduct;

    const prevFrom = fromSelect.value;
    const prevTo = toSelect.value;
    const empOptions = employeesCache.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
    fromSelect.innerHTML = empOptions;
    toSelect.innerHTML = empOptions;
    if (employeesCache.some(e => e.id === prevFrom)) fromSelect.value = prevFrom;
    if (employeesCache.some(e => e.id === prevTo)) toSelect.value = prevTo;
    if (fromSelect.value === toSelect.value) {
        const other = employeesCache.find(e => e.id !== fromSelect.value);
        if (other) toSelect.value = other.id;
    }
}




async function submitStockTransfer() {
    const productId = parseInt(document.getElementById('transfer-product-select').value);
    const fromEmpId = document.getElementById('transfer-from-select').value;
    const toEmpId = document.getElementById('transfer-to-select').value;
    const qtyRaw = document.getElementById('transfer-qty-input').value;
    const qty = parseInt(qtyRaw);

    if (!fromEmpId || !toEmpId) return showToast('Pilih kasir asal & tujuan dulu.', 'danger');
    if (fromEmpId === toEmpId) return showToast('Kasir asal & tujuan tidak boleh sama.', 'danger');
    if (!qtyRaw || isNaN(qty) || qty <= 0) return showToast('Masukkan jumlah transfer yang valid.', 'danger');
    if (!window.FB || !window.FB.ready) return showToast('Belum terhubung ke database. Coba lagi sebentar.', 'warn');

    const { db, doc, runTransaction } = window.FB;
    const catalogRef = doc(db, 'config', 'employeeCatalog');

    try {
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(catalogRef);
            const currentCatalog = snap.exists() ? snap.data() : {};
            const fromAssigned = [...(currentCatalog[fromEmpId] || [])];
            const toAssigned = [...(currentCatalog[toEmpId] || [])];

            const fromIdx = fromAssigned.findIndex(a => a.productId === productId);
            const fromQty = (fromIdx !== -1) ? fromAssigned[fromIdx].qty : null;

            if (fromQty == null) {
                
                throw new Error('STOCK_UNLIMITED');
            }
            if (fromQty < qty) {
                throw new Error('STOCK_KURANG');
            }

            if (fromIdx !== -1) fromAssigned[fromIdx] = { ...fromAssigned[fromIdx], qty: fromQty - qty };

            const toIdx = toAssigned.findIndex(a => a.productId === productId);
            if (toIdx === -1) {
                toAssigned.push({ productId, qty });
            } else {
                const currentToQty = toAssigned[toIdx].qty == null ? 0 : toAssigned[toIdx].qty;
                toAssigned[toIdx] = { ...toAssigned[toIdx], qty: currentToQty + qty };
            }

            transaction.set(catalogRef, { ...currentCatalog, [fromEmpId]: fromAssigned, [toEmpId]: toAssigned }, { merge: true });
        });

        showToast('Transfer Berhasil!', 'success');
        document.getElementById('transfer-qty-input').value = '';
    } catch (err) {
        if (err.message === 'STOCK_KURANG') {
            showToast('Stock tidak cukup untuk transfer sejumlah itu!', 'danger');
        } else if (err.message === 'STOCK_UNLIMITED') {
            showToast('Kasir asal belum punya stock khusus (dianggap tidak terbatas) untuk produk ini, atur dulu stock-nya di "Kelola Stock".', 'danger');
        } else {
            console.error('Gagal transfer stock:', err);
            showToast('Gagal memproses transfer ke server.', 'warn');
        }
    }
}















async function decreaseStockForOrder(items, employeeId) {
    if (!window.FB || !window.FB.ready || !employeeId) return; 
    const { db, doc, runTransaction } = window.FB;
    const catalogRef = doc(db, 'config', 'employeeCatalog');

    try {
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(catalogRef);
            const currentCatalog = snap.exists() ? snap.data() : {};
            const assigned = [...(currentCatalog[employeeId] || [])];

            const decreaseEmployeeStock = (productId, qty) => {
                const idx = assigned.findIndex(a => a.productId === productId);
                if (idx !== -1 && assigned[idx].qty != null) {
                    assigned[idx] = { ...assigned[idx], qty: Math.max(0, assigned[idx].qty - qty) };
                }
            };

            items.forEach(item => {
                if (item.variantSelections && item.variantSelections.length) {
                    
                    item.variantSelections.forEach(sel => {
                        if (sel.id == null) return; 
                        decreaseEmployeeStock(sel.id, sel.qty * item.qty);
                    });
                } else {
                    decreaseEmployeeStock(item.id, item.qty);
                }
            });

            transaction.set(catalogRef, { ...currentCatalog, [employeeId]: assigned }, { merge: true });
        });
    } catch (err) {
        console.error('Gagal mengurangi stock kasir:', err);
    }
}




function openStockKasir() {
    renderStockKasir();
    const subtitle = document.getElementById('stock-kasir-subtitle');
    if (subtitle) {
        subtitle.innerText = currentSessionEmployeeName
            ? `Penjualan per item hari ini & sisa stock · ${currentSessionEmployeeName}`
            : 'Penjualan per item hari ini & sisa stock';
    }
    const modal = document.getElementById('modal-stock-kasir');
    modal.classList.remove('hidden');
    lucide.createIcons();
}

function closeStockKasir() {
    document.getElementById('modal-stock-kasir').classList.add('hidden');
}






function getTodaySalesForProduct(productId) {
    const empId = currentSessionEmployeeId;
    let qty = 0, revenue = 0;
    getTodaysOrders().forEach(order => {
        if (empId && order.employeeId !== empId) return; 
        (order.items || []).forEach(item => {
            const itemProductId = item.productId != null ? item.productId : item.id;
            if (itemProductId === productId) {
                qty += item.qty;
                revenue += item.price * item.qty;
            }
        });
    });
    return { qty, revenue };
}

function renderStockKasir() {
    const body = document.getElementById('stock-kasir-body');
    if (!body) return;
    
    const visibleProducts = getVisibleProductsForCurrentKasir();
    body.innerHTML = visibleProducts.map(p => {
        const effectiveStock = getEffectiveStockForCurrentKasir(p);
        const hasStock = effectiveStock != null;
        const isEmpty = hasStock && effectiveStock <= 0;
        const badgeClass = isEmpty ? 'bg-red-100 text-red-600' : hasStock ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400';
        const stockLabel = hasStock ? effectiveStock : '∞';

        const { qty: soldQty, revenue: soldRevenue } = getTodaySalesForProduct(p.id);
        const salesCell = soldQty > 0
            ? `<span class="font-bold text-slate-700">${soldQty}x</span><br><span class="text-[10px] text-blue-600 font-semibold">Rp ${soldRevenue.toLocaleString()}</span>`
            : `<span class="text-slate-300 font-semibold">0</span>`;

        return `
        <tr class="border-b border-slate-50">
            <td class="p-3 font-semibold text-slate-700">${p.name}</td>
            <td class="p-3 text-right leading-tight">${salesCell}</td>
            <td class="p-3 text-right">
                <span class="${badgeClass} px-2.5 py-1 rounded-full font-bold text-[11px]">${stockLabel}</span>
            </td>
        </tr>`;
    }).join('') || `<tr><td colspan="3" class="text-center p-8 text-slate-400 text-xs">Belum ada produk</td></tr>`;
}


function addToCart(id) {
    const product = products.find(p => p.id === id);
    const existing = cart.find(item => item.id === id);
    if (existing) { existing.qty++; } else { cart.push({ ...product, qty: 1 }); }
    updateCartUI();
}




function addToCartWithBump(evt, id) {
    addToCart(id);
    const card = evt.currentTarget;
    if (card) {
        card.classList.remove('card-bump');
        void card.offsetWidth; 
        card.classList.add('card-bump');
    }
    const cartBtn = document.querySelector('button[onclick="openCheckout()"]');
    if (cartBtn) {
        cartBtn.classList.remove('cart-bump');
        void cartBtn.offsetWidth;
        cartBtn.classList.add('cart-bump');
    }
    if (navigator.vibrate) navigator.vibrate(15); 
}


let variantModalState = { product: null, options: [], selections: {} };

function openVariantModal(productId) {
    const product = products.find(p => p.id === productId);
    if (!product || !product.variantConfig || !product.variantConfig.enabled) return addToCart(productId);

    const sourceCategory = product.variantConfig.sourceCategory;
    
    
    const options = getVisibleProductsForCurrentKasir().filter(p => p.category === sourceCategory);

    if (options.length === 0) {
        return alert(`Belum ada menu di kategori "${sourceCategory}" untuk dipilih. Tambahkan dulu menunya lewat Admin Panel, atau aktifkan produk kategori tersebut untuk karyawan ini di "Katalog Per Karyawan".`);
    }

    variantModalState = { product, options, selections: {} };
    options.forEach(o => variantModalState.selections[o.id] = 0);

    document.getElementById('variant-title').innerText = `Pilih Isi - ${product.name}`;
    renderVariantOptions();
    document.getElementById('modal-variant').classList.remove('hidden');
    lucide.createIcons();
}

function closeVariantModal() {
    document.getElementById('modal-variant').classList.add('hidden');
}

function adjustVariantQty(optionId, delta) {
    const state = variantModalState;
    const required = state.product.variantConfig.count;
    const totalSelected = Object.values(state.selections).reduce((a, b) => a + b, 0);

    if (delta > 0 && totalSelected >= required) return; 
    const next = (state.selections[optionId] || 0) + delta;
    if (next < 0) return;
    state.selections[optionId] = next;
    renderVariantOptions();
}

function renderVariantOptions() {
    const state = variantModalState;
    const required = state.product.variantConfig.count;
    const totalSelected = Object.values(state.selections).reduce((a, b) => a + b, 0);

    document.getElementById('variant-subtitle').innerText = `Dipilih ${totalSelected}/${required}`;
    document.getElementById('variant-options').innerHTML = state.options.map(o => `
        <div class="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-100">
            <span class="font-bold text-sm text-slate-800">${o.name}</span>
            <div class="flex items-center gap-3 bg-slate-50 p-1 rounded-xl font-bold">
                <button onclick="adjustVariantQty(${o.id}, -1)" class="qty-btn w-8 h-8 text-slate-400">-</button>
                <span>${state.selections[o.id] || 0}</span>
                <button onclick="adjustVariantQty(${o.id}, 1)" class="qty-btn w-8 h-8 text-slate-400">+</button>
            </div>
        </div>
    `).join('');

    const confirmBtn = document.getElementById('variant-confirm-btn');
    confirmBtn.disabled = totalSelected !== required;
    lucide.createIcons();
}

function confirmVariantSelection() {
    const state = variantModalState;
    const required = state.product.variantConfig.count;
    const totalSelected = Object.values(state.selections).reduce((a, b) => a + b, 0);
    if (totalSelected !== required) return;

    const chosen = state.options
        .filter(o => state.selections[o.id] > 0)
        .map(o => ({ id: o.id, name: o.name, qty: state.selections[o.id] })); 

    cart.push({
        id: `v_${Date.now()}`,
        productId: state.product.id, 
        name: state.product.name,
        price: state.product.price,
        category: state.product.category,
        qty: 1,
        variantSelections: chosen
    });

    updateCartUI();
    closeVariantModal();
}

function updateQty(id, delta) {
    const item = cart.find(i => i.id == id); 
    if (item) {
        item.qty += delta;
        if (item.qty <= 0) cart = cart.filter(i => i.id != id);
    }
    updateCartUI();
    renderCartItems();
}

function updateCartUI() {
    const count = cart.reduce((sum, item) => sum + item.qty, 0);
    const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    document.getElementById('cart-count').innerText = count;
    document.getElementById('total-price').innerText = `Rp ${total.toLocaleString()}`;
}

function openCheckout() {
    if (cart.length === 0) return alert('Pilih produk dulu!');
    document.getElementById('modal-checkout').classList.remove('hidden');
    renderCartItems();
    updateCheckoutPaymentButtons();
}

function closeCheckout() {
    document.getElementById('modal-checkout').classList.add('hidden');
    selectedPayment = '';
    updatePaymentButtons();
    const cashInput = document.getElementById('cash-received-input');
    if (cashInput) cashInput.value = '';
    const cashBox = document.getElementById('cash-received-box');
    if (cashBox) cashBox.classList.add('hidden');
    const cashDisplay = document.getElementById('cash-change-display');
    if (cashDisplay) cashDisplay.innerHTML = '';
}

function renderCartItems() {
    const container = document.getElementById('cart-items');
    container.innerHTML = cart.map(item => {
        const variantNote = item.variantSelections
            ? `<p class="text-[11px] text-slate-500 mt-1">${item.variantSelections.map(v => `${v.name} x${v.qty}`).join(', ')}</p>`
            : '';
        return `
        <div class="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-100 text-sm">
            <div class="pr-3">
                <p class="font-bold text-slate-800">${item.name}</p>
                ${variantNote}
                <p class="text-blue-600 font-bold mt-1">Rp ${(item.price * item.qty).toLocaleString()}</p>
            </div>
            <div class="flex items-center gap-3 bg-slate-50 p-1 rounded-xl font-bold shrink-0">
                <button onclick="updateQty('${item.id}', -1)" class="qty-btn w-8 h-8 text-slate-400">-</button>
                <span>${item.qty}</span>
                <button onclick="updateQty('${item.id}', 1)" class="qty-btn w-8 h-8 text-slate-400">+</button>
            </div>
        </div>`;
    }).join('');
}

function setPayment(method) {
    selectedPayment = method;
    updatePaymentButtons();
    document.getElementById('confirm-pay').disabled = false;

    
    if (method === 'QRIS') {
        showQrisModal();
    }

    
    
    const cashBox = document.getElementById('cash-received-box');
    if (cashBox) {
        cashBox.classList.toggle('hidden', method !== 'Cash');
        if (method === 'Cash') updateCashChangeDisplay();
    }
}


function updateCashChangeDisplay() {
    const input = document.getElementById('cash-received-input');
    const display = document.getElementById('cash-change-display');
    if (!input || !display) return;
    const received = parseInt(input.value, 10) || 0;
    const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    const change = received - total;
    if (received === 0) {
        display.innerHTML = '';
        return;
    }
    display.innerHTML = change >= 0
        ? `<span class="text-slate-500">Kembalian</span><span class="text-emerald-600">Rp ${change.toLocaleString()}</span>`
        : `<span class="text-slate-500">Kurang</span><span class="text-red-500">Rp ${Math.abs(change).toLocaleString()}</span>`;
}

function updatePaymentButtons() {
    const btns = { 'Cash': 'btn-cash', 'QRIS': 'btn-qr', 'Shopee': 'btn-sf' };
    Object.values(btns).forEach(id => {
        document.getElementById(id).className = "pay-btn border-2 p-4 rounded-2xl text-[11px] font-bold bg-white border-slate-200 relative";
    });
    if (btns[selectedPayment]) {
        document.getElementById(btns[selectedPayment]).className = "pay-btn border-2 p-4 rounded-2xl text-[11px] font-bold bg-blue-50 border-blue-600 text-blue-700 relative";
    }

    
    const qrisEye = document.getElementById('qris-eye');
    if (qrisEye) {
        qrisEye.classList.toggle('hidden', selectedPayment !== 'QRIS');
        qrisEye.classList.toggle('flex', selectedPayment === 'QRIS');
    }
    lucide.createIcons();
}



function togglePaymentMethod(method) {
    if (!window.FB || !window.FB.ready) return showToast('Belum terhubung ke database. Coba lagi sebentar.', 'warn');
    const { db, doc, setDoc } = window.FB;
    const nextValue = !paymentMethodsCache[method];
    setDoc(doc(db, 'config', 'paymentMethods'), { [method]: nextValue }, { merge: true }).catch((err) => {
        console.error('Gagal ubah metode pembayaran:', err);
        showToast('Gagal menyimpan pengaturan ke server.', 'warn');
    });
}

function renderPaymentMethodsAdmin() {
    const qris = document.getElementById('paymethod-switch-qris');
    const shopee = document.getElementById('paymethod-switch-shopee');
    if (qris) qris.classList.toggle('on', !!paymentMethodsCache.qris);
    if (shopee) shopee.classList.toggle('on', !!paymentMethodsCache.shopee);
}



function updateCheckoutPaymentButtons() {
    const wrap = document.getElementById('checkout-payment-methods');
    const btnQr = document.getElementById('btn-qr');
    const btnSf = document.getElementById('btn-sf');
    if (!wrap || !btnQr || !btnSf) return;

    btnQr.classList.toggle('hidden', !paymentMethodsCache.qris);
    btnSf.classList.toggle('hidden', !paymentMethodsCache.shopee);
    const visibleCount = 1 + (paymentMethodsCache.qris ? 1 : 0) + (paymentMethodsCache.shopee ? 1 : 0);
    wrap.style.gridTemplateColumns = `repeat(${visibleCount}, minmax(0, 1fr))`;

    
    
    if ((selectedPayment === 'QRIS' && !paymentMethodsCache.qris) || (selectedPayment === 'Shopee' && !paymentMethodsCache.shopee)) {
        selectedPayment = '';
        updatePaymentButtons();
        document.getElementById('confirm-pay').disabled = true;
    }
}

function showQrisModal() {
    document.getElementById('modal-qris').classList.remove('hidden');
    lucide.createIcons();
}

function closeQrisModal() {
    document.getElementById('modal-qris').classList.add('hidden');
}








function getPendingProofs() {
    return JSON.parse(localStorage.getItem('pos_pending_proofs')) || [];
}

function savePendingProofs(list) {
    localStorage.setItem('pos_pending_proofs', JSON.stringify(list));
    updateProofBadge();
}

function updateProofBadge() {
    const count = getPendingProofs().length;
    const btn = document.getElementById('btn-proof');
    const badge = document.getElementById('proof-badge');
    if (!btn) return;
    btn.classList.toggle('hidden', count === 0);
    if (badge) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.classList.toggle('hidden', count === 0);
    }
}


function compressImage(file, maxWidth = 1000, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const scale = Math.min(1, maxWidth / img.width);
                const canvas = document.createElement('canvas');
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function dataUrlToFile(dataUrl, filename) {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) { u8arr[n] = bstr.charCodeAt(n); }
    return new File([u8arr], filename, { type: mime });
}

let activeProofId = null; 

async function handleQrisPhotoCapture(event) {
    const file = event.target.files[0];
    event.target.value = ''; 
    if (!file) return;

    const label = document.getElementById('qris-capture-label');
    label.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Menyimpan foto...`;
    lucide.createIcons();

    try {
        const dataUrl = await compressImage(file);
        const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
        const proof = {
            id: Date.now(),
            timestamp: new Date().toISOString(),
            dataUrl,
            total
        };

        const list = getPendingProofs();
        list.push(proof);
        savePendingProofs(list);

        closeQrisModal();

        if (navigator.onLine) {
            openProofActionModal(proof.id);
        } else {
            showToast('Offline - foto tersimpan. Nanti diingatkan untuk dikirim/disimpan saat online kembali.', 'warn');
        }
    } catch (err) {
        showToast('Gagal menyimpan foto, coba lagi.', 'warn');
    } finally {
        label.innerHTML = `<i data-lucide="camera" class="w-5 h-5"></i> Ambil Gambar/Foto`;
        lucide.createIcons();
    }
}


function openProofActionModal(proofId) {
    activeProofId = proofId;
    document.getElementById('modal-proof-action').classList.remove('hidden');
    lucide.createIcons();
}

function closeProofActionModal() {
    activeProofId = null;
    document.getElementById('modal-proof-action').classList.add('hidden');
}

function handleActionSend(channel) {
    const proof = getPendingProofs().find(p => p.id === activeProofId);
    closeProofActionModal();
    if (!proof) return;
    if (channel === 'wa') trySendProofWhatsApp(proof);
}


async function trySendProofWhatsApp(proof) {
    const caption = `Bukti Pembayaran QRIS - ${STORE_NAME}\nWaktu: ${new Date(proof.timestamp).toLocaleString('id-ID')}\nNominal: Rp ${proof.total.toLocaleString()}`;
    const file = dataUrlToFile(proof.dataUrl, `bukti-qris-${proof.id}.jpg`);

    
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({
                files: [file],
                title: 'Bukti Pembayaran QRIS',
                text: caption
            });
            removePendingProof(proof.id);
            showToast('Bukti pembayaran terkirim!', 'success');
            return;
        } catch (err) {
            if (err.name === 'AbortError') {
                
                return;
            }
            
        }
    }

    
    
    const waLink = `https://wa.me/${ADMIN_WA_NUMBER}?text=${encodeURIComponent(caption + '\n\n(Mohon lampirkan foto bukti pembayaran yang otomatis terunduh)')}`;
    window.open(waLink, '_blank');

    const downloadLink = document.createElement('a');
    downloadLink.href = proof.dataUrl;
    downloadLink.download = `bukti-qris-${proof.id}.jpg`;
    downloadLink.click();

    removePendingProof(proof.id);
    showToast('WhatsApp Admin dibuka & foto terunduh. Silakan lampirkan fotonya.', 'success');
}

function removePendingProof(id) {
    const list = getPendingProofs().filter(p => p.id !== id);
    savePendingProofs(list);
    if (document.getElementById('modal-proof-list') && !document.getElementById('modal-proof-list').classList.contains('hidden')) {
        renderProofList();
    }
}

function openPendingProofs() {
    renderProofList();
    document.getElementById('modal-proof-list').classList.remove('hidden');
    lucide.createIcons();
}

function closePendingProofs() {
    document.getElementById('modal-proof-list').classList.add('hidden');
}

function proofActionFromList(id, channel) {
    const proof = getPendingProofs().find(p => p.id === id);
    if (!proof) return;
    if (channel === 'wa') trySendProofWhatsApp(proof);
}

function renderProofList() {
    const list = getPendingProofs();
    const body = document.getElementById('proof-list-body');
    body.innerHTML = list.map(p => `
        <div class="border border-slate-100 rounded-2xl overflow-hidden">
            <img src="${p.dataUrl}" class="w-full h-40 object-cover">
            <div class="p-4">
                <p class="text-xs text-slate-500 font-semibold">${new Date(p.timestamp).toLocaleString('id-ID')}</p>
                <p class="text-blue-600 font-black text-sm mt-0.5">Rp ${p.total.toLocaleString()}</p>
                <div class="flex gap-2 mt-3">
                    <button onclick="removePendingProof(${p.id})" class="bg-red-50 text-red-500 p-3 rounded-xl shrink-0"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                    <button onclick="proofActionFromList(${p.id}, 'wa')" class="flex-1 bg-emerald-500 text-white py-3 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1.5">
                        <i data-lucide="message-circle" class="w-4 h-4"></i> WhatsApp
                    </button>
                </div>
            </div>
        </div>
    `).join('') || `<p class="text-center text-slate-400 text-sm py-10">Tidak ada bukti pembayaran yang menunggu dikirim/disimpan</p>`;
    lucide.createIcons();
}



let attendanceLogCache = [];
let employeesCache = [];
let cashReconciliationCache = []; 








let employeeCatalogCache = {};








let currentSessionEmployeeId = null;
let currentSessionEmployeeName = null;
let pinLockResolved = false;
let pinLockPendingEmployee = null; 
let pinLockEnteredDigits = '';



function getCurrentKasirEmployeeId() {
    return currentSessionEmployeeId;
}



function getVisibleProductsForCurrentKasir() {
    const empId = getCurrentKasirEmployeeId();
    if (!empId) return products; 
    const assigned = employeeCatalogCache[empId];
    if (!assigned || assigned.length === 0) return products; 
    const assignedIds = new Set(assigned.map(a => a.productId));
    return products.filter(p => assignedIds.has(p.id));
}



function getVisibleCategoriesForCurrentKasir() {
    const visibleProducts = getVisibleProductsForCurrentKasir();
    if (visibleProducts.length === products.length) return categories; 
    const activeCats = new Set(visibleProducts.map(p => p.category));
    const filtered = categories.filter(c => activeCats.has(c));
    return filtered.length > 0 ? filtered : categories; 
}





function getEffectiveStockForCurrentKasir(product) {
    const empId = getCurrentKasirEmployeeId();
    if (!empId) return null; 
    const assigned = employeeCatalogCache[empId];
    const entry = assigned && assigned.find(a => a.productId === product.id);
    if (!entry || entry.qty == null) return null; 
    return entry.qty;
}


function tryShowPinLock() {
    if (!attendanceSettingsLoaded || !attendanceLogLoaded) return; 
    if (pinLockResolved || adminPanelOpen) return;
    renderPinLockUserList();
    const el = document.getElementById('pin-lock-screen');
    if (!el) return;
    el.classList.remove('hidden');
    el.classList.add('flex');
    lucide.createIcons();
}

function renderPinLockUserList() {
    const list = document.getElementById('pin-lock-user-list');
    if (!list) return;
    list.innerHTML = employeesCache.map(emp => `
        <button onclick="pinLockSelectUser('${emp.id}', '${emp.name.replace(/'/g, "\\'")}')" class="w-full bg-white/15 hover:bg-white/25 border border-white/20 rounded-2xl p-4 text-left font-bold text-white flex items-center justify-between transition">
            ${emp.name}
            <i data-lucide="chevron-right" class="w-4 h-4 text-white/60"></i>
        </button>
    `).join('') || '<p class="text-xs text-white/70">Admin belum menambahkan karyawan. Hubungi Admin.</p>';
    lucide.createIcons();
}

function pinLockSelectUser(id, name) {
    pinLockPendingEmployee = { id, name };
    pinLockEnteredDigits = '';
    document.getElementById('pin-lock-greeting').innerText = `Halo, ${name}!`;
    document.getElementById('pin-lock-error').innerText = '';
    document.getElementById('pin-lock-step-user').classList.add('hidden');
    document.getElementById('pin-lock-step-pin').classList.remove('hidden');
    renderPinLockDots();
    lucide.createIcons();
}

function pinLockBackToUserList() {
    pinLockPendingEmployee = null;
    pinLockEnteredDigits = '';
    document.getElementById('pin-lock-step-pin').classList.add('hidden');
    document.getElementById('pin-lock-step-user').classList.remove('hidden');
}

function renderPinLockDots() {
    const dots = document.querySelectorAll('#pin-lock-dots .pin-dot');
    dots.forEach((dot, idx) => dot.classList.toggle('filled', idx < pinLockEnteredDigits.length));
}

function pinLockInput(digit) {
    if (pinLockEnteredDigits.length >= 4) return;
    pinLockEnteredDigits += digit;
    renderPinLockDots();
    if (pinLockEnteredDigits.length === 4) {
        setTimeout(pinLockVerify, 150); 
    }
}

function pinLockBackspace() {
    pinLockEnteredDigits = pinLockEnteredDigits.slice(0, -1);
    document.getElementById('pin-lock-error').innerText = '';
    renderPinLockDots();
}

function pinLockVerify() {
    const emp = employeesCache.find(e => e.id === pinLockPendingEmployee.id);
    if (emp && emp.pin === pinLockEnteredDigits) {
        currentSessionEmployeeId = emp.id;
        currentSessionEmployeeName = emp.name;
        pinLockResolved = true;
        pinLockPendingEmployee = null;
        pinLockEnteredDigits = '';
        const el = document.getElementById('pin-lock-screen');
        el.classList.add('hidden');
        el.classList.remove('flex');
        showToast(`Selamat bekerja, ${emp.name}!`, 'success');
        renderCategoryTabs(); 
        renderHomeGreeting();
        checkMandatoryMasukGate();
    } else {
        document.getElementById('pin-lock-error').innerText = 'PIN salah, coba lagi.';
        pinLockEnteredDigits = '';
        renderPinLockDots();
    }
}


function renderHomeGreeting() {
    const nameEl = document.getElementById('home-greeting-name');
    if (nameEl) nameEl.innerText = currentSessionEmployeeName || '-';
}


function lockPinSession() {
    if (adminPanelOpen) return; 
    currentSessionEmployeeId = null;
    currentSessionEmployeeName = null;
    pinLockResolved = false;
    pinLockPendingEmployee = null;
    pinLockEnteredDigits = '';
    document.getElementById('pin-lock-step-pin').classList.add('hidden');
    document.getElementById('pin-lock-step-user').classList.remove('hidden');
    renderHomeGreeting();
    tryShowPinLock();
}







function renderEmployeeList() {
    const list = document.getElementById('employee-list');
    if (!list) return;
    list.innerHTML = employeesCache.map(emp => `
        <div class="bg-white border border-slate-100 rounded-xl p-2.5">
            <div class="flex items-center justify-between">
                <span class="font-bold text-sm text-slate-800">${emp.name}</span>
                <div class="flex items-center gap-1">
                    <button onclick="editEmployeeContact('${emp.id}')" class="text-blue-500 hover:bg-blue-50 p-1.5 rounded-lg transition" title="Alamat & No. Telp (buat struk)">
                        <i data-lucide="map-pin" class="w-4 h-4"></i>
                    </button>
                    <button onclick="changeEmployeePin('${emp.id}')" class="text-indigo-500 hover:bg-indigo-50 p-1.5 rounded-lg transition" title="Ubah PIN">
                        <i data-lucide="key-round" class="w-4 h-4"></i>
                    </button>
                    <button onclick="deleteEmployee('${emp.id}')" class="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>
            ${emp.address ? `<p class="text-[10px] text-slate-400 mt-1 leading-snug">${emp.address}${emp.phone ? ` · Hp. ${emp.phone}` : ''}</p>` : ''}
        </div>
    `).join('') || '<p class="text-xs text-slate-400">Belum ada karyawan ditambahkan</p>';
    lucide.createIcons();
    renderEmployeeCatalogSelect(); 
}

function saveEmployeesToFirestore(newList) {
    if (!window.FB || !window.FB.ready) {
        showToast('Belum terhubung ke database. Coba lagi sebentar.', 'warn');
        return;
    }
    const { db, doc, setDoc } = window.FB;
    setDoc(doc(db, 'config', 'employees'), { items: newList }).catch((err) => {
        console.error('Gagal simpan karyawan:', err);
        showToast('Gagal menyimpan ke server.', 'warn');
    });
}




function addEmployee() {
    const nameInput = document.getElementById('new-employee-name');
    const pinInput = document.getElementById('new-employee-pin');
    const name = nameInput.value.trim();
    const pin = pinInput.value.trim();
    if (!name) return alert('Nama karyawan tidak boleh kosong!');
    if (!/^\d{4}$/.test(pin)) return alert('PIN wajib 4 digit angka!');
    if (employeesCache.some(e => e.name.toLowerCase() === name.toLowerCase())) {
        return alert('Nama karyawan tersebut sudah ada!');
    }
    const newEmployee = { id: 'emp_' + Date.now(), name, pin };
    saveEmployeesToFirestore([...employeesCache, newEmployee]);
    nameInput.value = '';
    pinInput.value = '';
}





function applyStoreName() {
    const headerEl = document.getElementById('store-name-header');
    if (headerEl) headerEl.innerText = STORE_NAME;
    document.title = `POS KASIR - ${STORE_NAME}`;
    const nameInput = document.getElementById('store-name-input');
    
    
    if (nameInput && document.activeElement !== nameInput) nameInput.value = STORE_NAME;
}

function saveStoreProfile() {
    const input = document.getElementById('store-name-input');
    const newName = input ? input.value.trim() : '';
    if (!newName) return alert('Nama toko tidak boleh kosong!');
    if (!window.FB || !window.FB.ready) return showToast('Belum terhubung ke database. Coba lagi sebentar.', 'warn');

    const { db, doc, setDoc } = window.FB;
    setDoc(doc(db, 'config', 'storeProfile'), { name: newName }).then(() => {
        showToast('Nama toko berhasil disimpan.', 'success');
    }).catch((err) => {
        console.error('Gagal simpan profile toko:', err);
        showToast('Gagal menyimpan ke server.', 'warn');
    });
}




function editEmployeeContact(id) {
    const emp = employeesCache.find(e => e.id === id);
    if (!emp) return;
    const newAddress = prompt(`Alamat untuk ${emp.name} (tampil di struk):`, emp.address || '');
    if (newAddress === null) return; 
    const newPhone = prompt(`No. Telp untuk ${emp.name} (tampil di struk):`, emp.phone || '');
    if (newPhone === null) return; 
    saveEmployeesToFirestore(employeesCache.map(e => e.id === id ? { ...e, address: newAddress.trim(), phone: newPhone.trim() } : e));
}

function changeEmployeePin(id) {
    const emp = employeesCache.find(e => e.id === id);
    if (!emp) return;
    const newPin = prompt(`PIN baru buat ${emp.name} (4 digit angka):`, '');
    if (newPin === null) return; 
    if (!/^\d{4}$/.test(newPin.trim())) return alert('PIN wajib 4 digit angka!');
    saveEmployeesToFirestore(employeesCache.map(e => e.id === id ? { ...e, pin: newPin.trim() } : e));
}

function deleteEmployee(id) {
    const emp = employeesCache.find(e => e.id === id);
    if (!emp) return;
    if (!confirm(`Hapus karyawan "${emp.name}"?`)) return;
    saveEmployeesToFirestore(employeesCache.filter(e => e.id !== id));
}




function renderEmployeeCatalogSelect() {
    const select = document.getElementById('empcat-employee-select');
    if (!select) return;
    const prevValue = select.value;
    select.innerHTML = employeesCache.map(e => `<option value="${e.id}">${e.name}</option>`).join('') || '<option value="">Belum ada karyawan</option>';
    if (employeesCache.some(e => e.id === prevValue)) select.value = prevValue;
    renderEmployeeCatalogEditor();
}

function renderEmployeeCatalogEditor() {
    const list = document.getElementById('empcat-product-list');
    if (!list) return;
    const select = document.getElementById('empcat-employee-select');
    const empId = select ? select.value : '';

    if (employeesCache.length === 0) {
        list.innerHTML = '<p class="text-xs text-slate-400 text-center py-6">Tambahkan karyawan dulu di "Kelola Karyawan".</p>';
        return;
    }
    if (!empId) {
        list.innerHTML = '<p class="text-xs text-slate-400 text-center py-6">Pilih karyawan dulu.</p>';
        return;
    }

    const assigned = employeeCatalogCache[empId] || [];
    const assignedIds = new Set(assigned.map(a => a.productId));

    list.innerHTML = products.map(p => {
        const isAssigned = assignedIds.has(p.id);
        return `
        <div class="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl p-2.5">
            <input type="checkbox" data-empcat-product="${p.id}" ${isAssigned ? 'checked' : ''} class="empcat-checkbox w-4 h-4 accent-pink-600 shrink-0">
            <div class="min-w-0 flex-1">
                <p class="font-bold text-xs text-slate-800 truncate">${p.name}</p>
                <p class="text-[10px] text-slate-400">${p.category}</p>
            </div>
        </div>`;
    }).join('') || '<p class="text-xs text-slate-400 text-center py-6">Belum ada produk di katalog. Tambahkan produk dulu.</p>';
    lucide.createIcons();
}

function saveEmployeeCatalog() {
    const select = document.getElementById('empcat-employee-select');
    const empId = select ? select.value : '';
    if (!empId) return alert('Pilih karyawan dulu!');
    if (!window.FB || !window.FB.ready) return showToast('Belum terhubung ke database. Coba lagi sebentar.', 'warn');

    const existing = employeeCatalogCache[empId] || [];
    const assigned = [];
    document.querySelectorAll('.empcat-checkbox:checked').forEach(cb => {
        const productId = parseInt(cb.getAttribute('data-empcat-product'));
        const prevEntry = existing.find(a => a.productId === productId);
        assigned.push({ productId, qty: prevEntry ? prevEntry.qty : null });
    });

    const { db, doc, setDoc } = window.FB;
    setDoc(doc(db, 'config', 'employeeCatalog'), { [empId]: assigned }, { merge: true }).then(() => {
        const empName = (employeesCache.find(e => e.id === empId) || {}).name || '';
        showToast(`Katalog untuk ${empName} tersimpan!`, 'success');
    }).catch((err) => {
        console.error('Gagal simpan katalog karyawan:', err);
        showToast('Gagal menyimpan ke server.', 'warn');
    });
}





let scheduleCache = {};
let scheduleViewDate = new Date(); 
let scheduleEditingEmployeeId = null; 
let scheduleEditingDateStr = null;

function scheduleDateStr(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function changeScheduleMonth(delta) {
    scheduleViewDate.setMonth(scheduleViewDate.getMonth() + delta);
    scheduleViewDate = new Date(scheduleViewDate); 
    renderScheduleTable();
}



function renderScheduleTable() {
    const wrap = document.getElementById('schedule-table-wrap');
    const label = document.getElementById('schedule-month-label');
    if (!wrap || !label) return;

    const year = scheduleViewDate.getFullYear();
    const month = scheduleViewDate.getMonth();
    label.innerText = scheduleViewDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

    if (employeesCache.length === 0) {
        wrap.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">Tambahkan karyawan dulu di atas.</p>';
        return;
    }

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = getTodayDateStr();

    let headerCells = '';
    for (let d = 1; d <= daysInMonth; d++) {
        const isToday = scheduleDateStr(year, month, d) === todayStr;
        headerCells += `<th class="schedule-table-date-col ${isToday ? 'is-today' : ''}">${d}</th>`;
    }

    const bodyRows = employeesCache.map(emp => {
        let cells = '';
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = scheduleDateStr(year, month, d);
            const entry = scheduleCache[dateStr];
            const empEntry = entry && entry.employees ? entry.employees.find(e => e.id === emp.id) : null;
            const isToday = dateStr === todayStr;
            const isLibur = !!(empEntry && empEntry.libur); 
            const cellLabel = isLibur ? 'LIBUR' : (empEntry ? empEntry.jamMulai : ''); 
            const cellClass = isLibur ? 'is-libur' : (empEntry ? 'is-scheduled' : ''); 
            cells += `<td onclick="openScheduleCellEditor('${emp.id}', '${dateStr}')" class="schedule-table-cell ${cellClass} ${isToday ? 'is-today' : ''}">${cellLabel}</td>`;
        }
        return `<tr><td class="schedule-table-name-col">${emp.name}</td>${cells}</tr>`;
    }).join('');

    wrap.innerHTML = `
    <table class="schedule-table">
        <thead><tr><th class="schedule-table-name-col">Nama</th>${headerCells}</tr></thead>
        <tbody>${bodyRows}</tbody>
    </table>`;
}


function openScheduleCellEditor(empId, dateStr) {
    scheduleEditingEmployeeId = empId;
    scheduleEditingDateStr = dateStr;

    const emp = employeesCache.find(e => e.id === empId);
    const entry = scheduleCache[dateStr];
    const empEntry = entry && entry.employees ? entry.employees.find(e => e.id === empId) : null;
    const dateObj = new Date(dateStr + 'T00:00:00');
    const isLibur = !!(empEntry && empEntry.libur); 

    document.getElementById('schedule-cell-title').innerText = `${emp ? emp.name : ''} — ${dateObj.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}`;
    document.getElementById('schedule-cell-jam-masuk').value = (empEntry && !isLibur) ? (empEntry.jamMulai || '') : '';
    document.getElementById('schedule-cell-jam-masuk').disabled = isLibur; 
    document.getElementById('schedule-cell-remove-btn').classList.toggle('hidden', !empEntry);

    
    const liburBtn = document.getElementById('schedule-cell-libur-btn');
    liburBtn.innerText = isLibur ? 'Batal Libur' : 'Tandai Libur';
    liburBtn.classList.toggle('is-active', isLibur);

    document.getElementById('modal-schedule-cell').classList.remove('hidden');
    document.getElementById('modal-schedule-cell').classList.add('flex');
    lucide.createIcons();
}

function closeScheduleCellEditor() {
    document.getElementById('modal-schedule-cell').classList.add('hidden');
    document.getElementById('modal-schedule-cell').classList.remove('flex');
    scheduleEditingEmployeeId = null;
    scheduleEditingDateStr = null;
}

function saveScheduleCellJamMasuk() {
    if (!scheduleEditingEmployeeId || !scheduleEditingDateStr) return;
    if (!window.FB || !window.FB.ready) return showToast('Belum terhubung ke database.', 'warn');

    const jamMulai = document.getElementById('schedule-cell-jam-masuk').value;
    if (!jamMulai) return alert('Isi jam masuk kerjanya!');

    const { db, doc, setDoc } = window.FB;
    const empId = scheduleEditingEmployeeId;
    const dateStr = scheduleEditingDateStr;
    const existing = (scheduleCache[dateStr] && scheduleCache[dateStr].employees) || [];
    
    const updatedEmployees = [...existing.filter(e => e.id !== empId), { id: empId, jamMulai }];

    setDoc(doc(db, 'schedule', dateStr), { date: dateStr, employees: updatedEmployees }).then(() => {
        showToast('Jadwal tersimpan!', 'success');
        closeScheduleCellEditor();
    }).catch((err) => {
        console.error('Gagal simpan jadwal:', err);
        showToast('Gagal menyimpan jadwal ke server.', 'warn');
    });
}



function toggleScheduleCellLibur() {
    if (!scheduleEditingEmployeeId || !scheduleEditingDateStr) return;
    if (!window.FB || !window.FB.ready) return showToast('Belum terhubung ke database.', 'warn');

    const { db, doc, setDoc } = window.FB;
    const empId = scheduleEditingEmployeeId;
    const dateStr = scheduleEditingDateStr;
    const existing = (scheduleCache[dateStr] && scheduleCache[dateStr].employees) || [];
    const currentEntry = existing.find(e => e.id === empId);
    const isCurrentlyLibur = !!(currentEntry && currentEntry.libur);

    const updatedEmployees = isCurrentlyLibur
        ? existing.filter(e => e.id !== empId) 
        : [...existing.filter(e => e.id !== empId), { id: empId, libur: true }]; 

    setDoc(doc(db, 'schedule', dateStr), { date: dateStr, employees: updatedEmployees }).then(() => {
        showToast(isCurrentlyLibur ? 'Libur dibatalkan.' : 'Ditandai libur!', 'success');
        closeScheduleCellEditor();
    }).catch((err) => {
        console.error('Gagal simpan status libur:', err);
        showToast('Gagal menyimpan ke server.', 'warn');
    });
}

function removeScheduleCellJamMasuk() {
    if (!scheduleEditingEmployeeId || !scheduleEditingDateStr) return;
    if (!window.FB || !window.FB.ready) return showToast('Belum terhubung ke database.', 'warn');
    if (!confirm('Hapus jadwal karyawan ini di tanggal ini?')) return;

    const { db, doc, setDoc, deleteDoc } = window.FB;
    const empId = scheduleEditingEmployeeId;
    const dateStr = scheduleEditingDateStr;
    const existing = (scheduleCache[dateStr] && scheduleCache[dateStr].employees) || [];
    const remaining = existing.filter(e => e.id !== empId);

    const savePromise = remaining.length > 0
        ? setDoc(doc(db, 'schedule', dateStr), { date: dateStr, employees: remaining })
        : deleteDoc(doc(db, 'schedule', dateStr)); 

    savePromise.then(() => {
        showToast('Jadwal dihapus!', 'success');
        closeScheduleCellEditor();
    }).catch((err) => {
        console.error('Gagal hapus jadwal:', err);
        showToast('Gagal menyimpan ke server.', 'warn');
    });
}







function computeDailyAttendanceToken(dateStr) {
    const ds = dateStr || getTodayDateStr();
    const seed = `${STORE_NAME || 'TOKO'}-${ds}-ABSEN-OKTSHOP17`;
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
    }
    const code = Math.abs(hash).toString(36).toUpperCase().padStart(6, '0').slice(0, 6);
    return `ABSEN-${ds.replace(/-/g, '')}-${code}`;
}

function getQrToken() {
    return computeDailyAttendanceToken();
}

async function renderAttendanceQR() {
    const container = document.getElementById('qr-absen-container');
    const tokenInput = document.getElementById('qr-token-text');
    if (!container) return;
    const token = getQrToken();
    container.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">Memuat QR...</p>';
    await ensureQRCode(); 
    container.innerHTML = '';
    
    
    new QRCode(container, { text: token, width: 180, height: 180, colorDark: '#000000', colorLight: '#ffffff' });
    if (tokenInput) tokenInput.value = token;
}

function copyQrTokenText() {
    const tokenInput = document.getElementById('qr-token-text');
    if (!tokenInput || !tokenInput.value) return showToast('Belum ada QR untuk disalin.', 'warn');
    tokenInput.select();
    navigator.clipboard.writeText(tokenInput.value).then(() => {
        showToast('Kode berhasil disalin! Bagikan ke kasir lewat WhatsApp.', 'success');
    }).catch(() => {
        showToast('Gagal menyalin otomatis, silakan salin manual dari kotak teksnya.', 'warn');
    });
}


let qrScanStream = null;
let qrScanRAF = null;
let qrScanPendingType = null; 
let qrScanPendingEmployee = null; 
let qrScanHintTimeout = null;


function openEmployeePicker(type) {
    if (employeesCache.length === 0) {
        showToast('Admin belum menambahkan data karyawan. Buka Admin Panel > Kelola Karyawan.', 'warn');
        return;
    }
    if (!getQrToken()) {
        showToast('QR Absen belum di-generate Admin. Hubungi Admin dulu.', 'warn');
        return;
    }

    
    
    if (currentSessionEmployeeId) {
        qrScanPendingType = type;
        selectEmployeeForAttendance(currentSessionEmployeeId, currentSessionEmployeeName);
        return;
    }

    qrScanPendingType = type;
    const list = document.getElementById('employee-picker-list');
    list.innerHTML = employeesCache.map(emp => `
        <button onclick="selectEmployeeForAttendance('${emp.id}', '${emp.name.replace(/'/g, "\\'")}')" class="w-full bg-slate-50 hover:bg-indigo-50 border border-slate-100 rounded-2xl p-4 text-left font-bold text-slate-800 flex items-center justify-between transition">
            ${emp.name}
            <i data-lucide="chevron-right" class="w-4 h-4 text-slate-300"></i>
        </button>
    `).join('');
    lucide.createIcons();

    document.getElementById('modal-employee-picker').classList.remove('hidden');
    document.getElementById('modal-employee-picker').classList.add('flex');
}

function closeEmployeePicker() {
    document.getElementById('modal-employee-picker').classList.add('hidden');
    document.getElementById('modal-employee-picker').classList.remove('flex');
}

function selectEmployeeForAttendance(id, name) {
    qrScanPendingEmployee = { id, name };
    closeEmployeePicker();
    openQrScanner(qrScanPendingType);
}

async function openQrScanner(type) {
    if (!getQrToken()) {
        showToast('QR Absen belum di-generate Admin. Hubungi Admin dulu.', 'warn');
        return;
    }

    qrScanPendingType = type;
    const modal = document.getElementById('modal-qr-scanner');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.getElementById('qr-scanner-status').innerText = 'Menyiapkan pemindai...';
    lucide.createIcons();

    try {
        await ensureJsQR(); 
    } catch (err) {
        console.error('Gagal load jsQR:', err);
        document.getElementById('qr-scanner-status').innerText = 'Gagal memuat modul pemindai QR (cek koneksi internet kasir), coba lagi.';
        return;
    }

    try {
        document.getElementById('qr-scanner-status').innerText = 'Mengaktifkan kamera...';
        
        
        qrScanStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment',
                
                
                
                
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                advanced: [{ focusMode: 'continuous' }]
            }
        }).catch(() => navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }));

        const video = document.getElementById('qr-scanner-video');
        video.srcObject = qrScanStream;
        await video.play();
        document.getElementById('qr-scanner-status').innerText = `Arahkan kamera ke QR Absen di toko (${qrScanPendingEmployee ? qrScanPendingEmployee.name : ''})`;
        qrScanRAF = requestAnimationFrame(qrScanTick);

        
        clearTimeout(qrScanHintTimeout);
        qrScanHintTimeout = setTimeout(() => {
            const statusEl = document.getElementById('qr-scanner-status');
            if (statusEl && qrScanRAF) {
                statusEl.innerText = 'Susah kebaca? Pastikan cahaya cukup & tidak ada pantulan, atau tap "Ambil Foto" di bawah';
            }
        }, 6000);
    } catch (err) {
        console.error('Gagal akses kamera:', err);
        document.getElementById('qr-scanner-status').innerText = 'Gagal akses kamera. Cek izin kamera di browser.';
    }
}

function qrScanTick() {
    const video = document.getElementById('qr-scanner-video');
    const canvas = document.getElementById('qr-scanner-canvas');
    if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
        if (code && code.data) {
            handleQrScanResult(code.data);
            return; 
        }
    }
    qrScanRAF = requestAnimationFrame(qrScanTick);
}



function handleQrFallbackPhoto(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;

    document.getElementById('qr-scanner-status').innerText = 'Memproses foto...';

    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
        img.onload = () => {
            try {
                const canvas = document.getElementById('qr-scanner-canvas');
                
                
                
                
                
                
                const MAX_DIM = 1200;
                let { width, height } = img;
                if (width > MAX_DIM || height > MAX_DIM) {
                    const scale = MAX_DIM / Math.max(width, height);
                    width = Math.round(width * scale);
                    height = Math.round(height * scale);
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                const imageData = ctx.getImageData(0, 0, width, height);
                const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
                if (code && code.data) {
                    handleQrScanResult(code.data);
                } else {
                    document.getElementById('qr-scanner-status').innerText = 'QR tidak terbaca dari foto. Coba lagi dengan pencahayaan lebih terang.';
                    resumeLiveQrScan();
                }
            } catch (err) {
                console.error('Gagal proses foto QR:', err);
                document.getElementById('qr-scanner-status').innerText = 'Gagal memproses foto. Coba ambil foto lagi atau pakai Input Manual.';
                resumeLiveQrScan();
            }
        };
        img.onerror = () => {
            document.getElementById('qr-scanner-status').innerText = 'Foto gagal dimuat. Coba ambil foto lagi.';
            resumeLiveQrScan();
        };
        img.src = e.target.result;
    };
    reader.onerror = () => {
        document.getElementById('qr-scanner-status').innerText = 'Gagal membaca file foto. Coba lagi.';
        resumeLiveQrScan();
    };
    reader.readAsDataURL(file);
}






async function resumeLiveQrScan() {
    const video = document.getElementById('qr-scanner-video');
    const stillAlive = qrScanStream && qrScanStream.getVideoTracks().some(t => t.readyState === 'live');
    if (stillAlive) {
        qrScanRAF = requestAnimationFrame(qrScanTick);
        return;
    }
    try {
        qrScanStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
        });
        video.srcObject = qrScanStream;
        await video.play();
        qrScanRAF = requestAnimationFrame(qrScanTick);
    } catch (err) {
        console.error('Gagal nyalakan ulang kamera:', err);
        document.getElementById('qr-scanner-status').innerText = 'Kamera live terhenti. Tap "Ambil Foto" lagi atau pakai Input Manual.';
    }
}



function toggleManualQrInput() {
    const box = document.getElementById('qr-manual-input-box');
    const isHidden = box.classList.contains('hidden');
    if (isHidden) {
        box.classList.remove('hidden');
        box.classList.add('flex');
        document.getElementById('qr-manual-input').focus();
    } else {
        box.classList.add('hidden');
        box.classList.remove('flex');
    }
}

function submitManualQrCode() {
    const input = document.getElementById('qr-manual-input');
    const value = input.value.trim();
    if (!value) return;
    input.value = '';
    handleQrScanResult(value);
}

function handleQrScanResult(scannedText) {
    clearTimeout(qrScanHintTimeout);
    const expected = getQrToken();
    if (scannedText === expected) {
        const type = qrScanPendingType;
        const employee = qrScanPendingEmployee; 
        closeQrScanner();
        saveAttendanceRecord(type, employee);
        if (document.getElementById('modal-absen-popup') && !document.getElementById('modal-absen-popup').classList.contains('hidden')) {
            renderAbsenPopup();
        }
    } else {
        document.getElementById('qr-scanner-status').innerText = 'QR tidak valid. Scan QR resmi yang ada di toko.';
        setTimeout(() => { qrScanRAF = requestAnimationFrame(qrScanTick); }, 1200);
    }
}

function closeQrScanner() {
    const modal = document.getElementById('modal-qr-scanner');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    if (qrScanRAF) cancelAnimationFrame(qrScanRAF);
    qrScanRAF = null;
    clearTimeout(qrScanHintTimeout);
    if (qrScanStream) {
        qrScanStream.getTracks().forEach(t => t.stop());
        qrScanStream = null;
    }
    qrScanPendingType = null;
    qrScanPendingEmployee = null;

    const manualBox = document.getElementById('qr-manual-input-box');
    if (manualBox) { manualBox.classList.add('hidden'); manualBox.classList.remove('flex'); }
    const manualInput = document.getElementById('qr-manual-input');
    if (manualInput) manualInput.value = '';
}

function refreshAttendanceAdminViews() {
    renderAttendanceQR();
    renderRiwayatAbsen();
    renderPerbaikanAbsenEmployeeSelect();
    renderEmployeeList();
    renderScheduleTable();
    renderResetAbsenEmployeeSelect();
}

function renderResetAbsenEmployeeSelect() {
    const select = document.getElementById('reset-absen-employee-select');
    if (!select) return;
    const prevValue = select.value;
    select.innerHTML = employeesCache.map(e => `<option value="${e.id}">${e.name}</option>`).join('') || '<option value="">Belum ada karyawan</option>';
    if (employeesCache.some(e => e.id === prevValue)) select.value = prevValue;
    renderResetAbsenButton();
}

function renderResetAbsenButton() {
    const btn = document.getElementById('reset-absen-btn');
    const note = document.getElementById('reset-absen-note');
    const select = document.getElementById('reset-absen-employee-select');
    if (!btn) return;
    const empId = select ? select.value : '';
    const empName = (employeesCache.find(e => e.id === empId) || {}).name || '';
    const doneMap = resetAbsenLastDateByEmployee || {};
    const alreadyDoneToday = empId && doneMap[empId] === getTodayDateStr();
    btn.disabled = !empId || alreadyDoneToday;
    btn.classList.toggle('opacity-50', !empId || alreadyDoneToday);
    btn.classList.toggle('cursor-not-allowed', !empId || alreadyDoneToday);
    if (note) {
        note.innerText = alreadyDoneToday
            ? `Reset Absen untuk ${empName} sudah dipakai hari ini. Bisa dipakai lagi besok.`
            : 'Menghapus data penjualan & absen masuk/pulang HANYA milik kasir yang dipilih di atas — dipakai maksimal 1x per hari per kasir.';
    }
}

function openConfirmResetAbsen() {
    const select = document.getElementById('reset-absen-employee-select');
    const empId = select ? select.value : '';
    if (!empId) {
        showToast('Pilih kasir dulu.', 'warn');
        return;
    }
    if ((resetAbsenLastDateByEmployee || {})[empId] === getTodayDateStr()) {
        showToast('Reset Absen kasir ini sudah dipakai hari ini. Coba lagi besok.', 'warn');
        return;
    }
    document.getElementById('modal-confirm-reset-absen').classList.remove('hidden');
    document.getElementById('modal-confirm-reset-absen').classList.add('flex');
}

function closeConfirmResetAbsen() {
    document.getElementById('modal-confirm-reset-absen').classList.add('hidden');
    document.getElementById('modal-confirm-reset-absen').classList.remove('flex');
}

async function confirmResetAbsenYes() {
    const todayStr = getTodayDateStr();
    const select = document.getElementById('reset-absen-employee-select');
    const empId = select ? select.value : '';
    if (!window.FB || !window.FB.ready) {
        showToast('Belum terhubung ke database. Coba lagi sebentar.', 'warn');
        return;
    }
    if (!empId) {
        closeConfirmResetAbsen();
        return;
    }
    if ((resetAbsenLastDateByEmployee || {})[empId] === todayStr) {
        showToast('Reset Absen kasir ini sudah dipakai hari ini.', 'warn');
        closeConfirmResetAbsen();
        return;
    }
    closeConfirmResetAbsen();
    showToast('Memproses Reset Absen...', 'info');

    const { db, doc, setDoc, deleteDoc } = window.FB;
    try {
        const salesDeletes = orderHistory
            .filter(o => o.firestoreId && o.employeeId === empId)
            .map(o => deleteDoc(doc(db, 'sales', o.firestoreId)));

        const attendanceDeletes = attendanceLogCache
            .filter(r => r.date && r.employeeId === empId)
            .map(r => deleteDoc(doc(db, 'attendance', `${r.date}_${r.employeeId}`)));

        await Promise.all([...salesDeletes, ...attendanceDeletes]);

        await setDoc(doc(db, 'config', 'resetAbsenLog'), { [empId]: todayStr }, { merge: true });

        const empName = (employeesCache.find(e => e.id === empId) || {}).name || 'Kasir';
        showToast(`Reset Absen ${empName} berhasil! Kasir ini wajib absen masuk lagi.`, 'success');
    } catch (err) {
        console.error('Gagal Reset Absen:', err);
        showToast('Gagal melakukan Reset Absen. Coba lagi.', 'warn');
    }
}

function getTodayDateStr(date) {
    const d = date || new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}







function getMyTodayAttendance() {
    const empId = getCurrentKasirEmployeeId();
    const todayStr = getTodayDateStr();
    if (!empId) return { date: todayStr, masukTime: null, keluarTime: null };
    const record = attendanceLogCache.find(r => r.date === todayStr && r.employeeId === empId);
    return record || { date: todayStr, employeeId: empId, masukTime: null, keluarTime: null };
}




let mandatoryMasukGateActive = false; 
let absenPopupMandatory = false; 
let shiftEndedActive = false; 





let adminPanelOpen = false;





function getTodayScheduleEntryForCurrentKasir() {
    const empId = getCurrentKasirEmployeeId();
    if (!empId) return null;
    const dayEntry = scheduleCache[getTodayDateStr()];
    if (!dayEntry || !dayEntry.employees) return null;
    const empEntry = dayEntry.employees.find(e => e.id === empId);
    if (!empEntry || empEntry.libur) return null;
    return empEntry;
}








function checkMandatoryMasukGate() {
    if (!attendanceSettingsLoaded || !attendanceLogLoaded) return;
    const record = getMyTodayAttendance();

    
    if (record.keluarTime) {
        if (!shiftEndedActive) showShiftEndedGate(record);
        if (mandatoryMasukGateActive) {
            mandatoryMasukGateActive = false;
            absenPopupMandatory = false;
            closeAbsenPopupForced();
        }
        recomputeDashboardLock();
        return;
    }
    if (shiftEndedActive) hideShiftEndedGate(); 

    const needsMasuk = !!getCurrentKasirEmployeeId() && !record.masukTime;
    if (needsMasuk && !mandatoryMasukGateActive) {
        mandatoryMasukGateActive = true;
        openAbsenPopup(true);
    } else if (!needsMasuk && mandatoryMasukGateActive) {
        mandatoryMasukGateActive = false;
        absenPopupMandatory = false;
        closeAbsenPopupForced();
    }
    recomputeDashboardLock();
}


function showShiftEndedGate(record) {
    shiftEndedActive = true;
    if (adminPanelOpen) return; 
    const keluarTimeStr = record.keluarTime ? new Date(record.keluarTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '';
    const who = record.keluarBy ? ` oleh ${record.keluarBy}` : '';
    document.getElementById('shift-ended-subtitle').innerText = `Absen keluar tercatat pukul ${keluarTimeStr}${who}.`;
    const gate = document.getElementById('shift-ended-gate');
    gate.classList.remove('hidden');
    gate.classList.add('flex');
    lucide.createIcons();
}

function hideShiftEndedGate() {
    shiftEndedActive = false;
    const gate = document.getElementById('shift-ended-gate');
    gate.classList.add('hidden');
    gate.classList.remove('flex');
}


let confirmKeluarPending = false;

function openConfirmKeluar() {
    document.getElementById('modal-confirm-keluar').classList.remove('hidden');
    document.getElementById('modal-confirm-keluar').classList.add('flex');
    lucide.createIcons();
}

function closeConfirmKeluar() {
    document.getElementById('modal-confirm-keluar').classList.add('hidden');
    document.getElementById('modal-confirm-keluar').classList.remove('flex');
}

function confirmKeluarYes() {
    closeConfirmKeluar();
    closeAbsenPopupForced(); 
    
    
    const employee = currentSessionEmployeeId ? { id: currentSessionEmployeeId, name: currentSessionEmployeeName } : null;
    saveAttendanceRecord('keluar', employee);
}



function recomputeDashboardLock() {
    setDashboardLocked(shiftEndedActive || mandatoryMasukGateActive);
}





function setDashboardLocked(locked) {
    ['page-home', 'bottom-bar'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle('dashboard-locked', locked);
        if (locked) el.setAttribute('inert', ''); else el.removeAttribute('inert');
    });
}




function saveAttendanceRecord(type, employee) {
    if (!window.FB || !window.FB.ready) {
        showToast('Belum terhubung ke database. Coba lagi sebentar.', 'warn');
        return;
    }
    
    
    
    const employeeId = (employee && employee.id != null) ? employee.id : null;
    if (!employeeId) {
        showToast('Identitas kasir tidak diketahui — coba login PIN ulang.', 'warn');
        return;
    }

    const todayStr = getTodayDateStr();
    const now = new Date().toISOString();
    const { db, doc, setDoc } = window.FB;
    const docId = `${todayStr}_${employeeId}`; 

    const field = type === 'masuk'
        ? { masukTime: now, masukBy: employee ? employee.name : null, masukById: employeeId }
        : { keluarTime: now, keluarBy: employee ? employee.name : null, keluarById: employeeId };

    
    
    
    
    
    const existingIdx = attendanceLogCache.findIndex(r => r.date === todayStr && r.employeeId === employeeId);
    const mergedRecord = { ...(existingIdx > -1 ? attendanceLogCache[existingIdx] : {}), date: todayStr, employeeId, ...field };
    if (existingIdx > -1) attendanceLogCache[existingIdx] = mergedRecord; else attendanceLogCache.push(mergedRecord);
    attendanceLogLoaded = true;
    checkMandatoryMasukGate();

    setDoc(doc(db, 'attendance', docId), { date: todayStr, employeeId, ...field }, { merge: true }).then(() => {
        const who = employee ? ` (${employee.name})` : '';
        showToast((type === 'masuk' ? 'Absen masuk tercatat!' : 'Absen pulang tercatat!') + who, 'success');
    }).catch((err) => {
        console.error('Gagal simpan absen:', err);
        showToast('Gagal menyimpan absen ke server. Coba absen ulang kalau belum tercatat.', 'warn');
    });
}








const _autoClosingShiftIds = new Set(); 
function autoCloseForgottenShifts() {
    if (!window.FB || !window.FB.ready) return;
    const todayStr = getTodayDateStr();
    const { db, doc, setDoc } = window.FB;
    attendanceLogCache.forEach((record) => {
        if (!record.date || record.date >= todayStr) return; 
        if (!record.masukTime || record.keluarTime) return; 
        const docId = `${record.date}_${record.employeeId}`;
        if (_autoClosingShiftIds.has(docId)) return;
        _autoClosingShiftIds.add(docId);
        setDoc(doc(db, 'attendance', docId), {
            keluarTime: new Date(`${record.date}T23:59:00`).toISOString(),
            keluarBy: 'Sistem (lupa absen keluar)',
            keluarById: null,
            keluarAuto: true
        }, { merge: true }).catch((err) => {
            console.error('Gagal auto-tutup absen lupa keluar:', err);
            _autoClosingShiftIds.delete(docId); 
        });
    });
}

function formatDurationHM(msDuration) {
    const totalMinutes = Math.floor(msDuration / 60000);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}j ${m}m`;
}



function openAbsenPopup(mandatory) {
    absenPopupMandatory = !!mandatory;
    
    
    
    if (mandatory && adminPanelOpen) return;
    renderAbsenPopup();
    const modal = document.getElementById('modal-absen-popup');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.getElementById('absen-popup-close-btn').classList.toggle('hidden', absenPopupMandatory);
    lucide.createIcons();
}


function closeAbsenPopup() {
    if (absenPopupMandatory) {
        showToast('Wajib absen masuk dulu sebelum bisa mulai jualan.', 'warn');
        return;
    }
    closeAbsenPopupForced();
}



function closeAbsenPopupForced() {
    const modal = document.getElementById('modal-absen-popup');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function recordAttendanceManual(type) {
    if (type === 'keluar') {
        openConfirmKeluar(); 
        return;
    }
    closeAbsenPopupForced();
    openEmployeePicker(type);
}

function renderAbsenPopup() {
    const record = getMyTodayAttendance();
    const dateStr = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    document.getElementById('absen-popup-date').innerText = dateStr;

    const body = document.getElementById('absen-popup-body');
    const masukStr = record.masukTime ? new Date(record.masukTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : null;
    const keluarStr = record.keluarTime ? new Date(record.keluarTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : null;

    if (!record.masukTime) {
        const scheduleEntry = getTodayScheduleEntryForCurrentKasir();
        const jadwalInfo = (scheduleEntry && scheduleEntry.jamMulai)
            ? `<p class="text-xs text-indigo-600 font-bold mt-2">Jadwal kamu hari ini: mulai ${scheduleEntry.jamMulai}</p>`
            : '';
        body.innerHTML = `
            <div class="bg-slate-50 rounded-2xl p-5 text-center mb-4">
                <i data-lucide="clock" class="w-6 h-6 text-slate-300 mx-auto mb-2"></i>
                <p class="text-sm text-slate-500 font-semibold">Belum absen masuk hari ini</p>
                ${jadwalInfo}
            </div>
            <button onclick="recordAttendanceManual('masuk')" class="w-full bg-emerald-500 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2">
                <i data-lucide="log-in" class="w-5 h-5"></i> Absen Masuk
            </button>`;
    } else if (!record.keluarTime) {
        body.innerHTML = `
            <div class="flex items-center justify-between bg-emerald-50 rounded-2xl p-4">
                <div>
                    <p class="text-[10px] text-emerald-600 font-bold uppercase">Jam Masuk${record.masukBy ? ` - ${record.masukBy}` : ''}</p>
                    <p class="text-2xl font-black text-emerald-700">${masukStr}</p>
                </div>
                <button onclick="recordAttendanceManual('keluar')" class="bg-orange-500 text-white px-5 py-3.5 rounded-xl font-bold flex items-center gap-2 shrink-0">
                    <i data-lucide="log-out" class="w-4 h-4"></i> Keluar
                </button>
            </div>`;
    } else {
        body.innerHTML = `
            <div class="grid grid-cols-2 gap-3">
                <div class="bg-emerald-50 rounded-2xl p-4 text-center">
                    <p class="text-[10px] text-emerald-600 font-bold uppercase">Masuk${record.masukBy ? ` - ${record.masukBy}` : ''}</p>
                    <p class="text-lg font-black text-emerald-700">${masukStr}</p>
                </div>
                <div class="bg-orange-50 rounded-2xl p-4 text-center">
                    <p class="text-[10px] text-orange-600 font-bold uppercase">Pulang${record.keluarBy ? ` - ${record.keluarBy}` : ''}</p>
                    <p class="text-lg font-black text-orange-700">${keluarStr}</p>
                </div>
            </div>
            <p class="text-center text-xs text-slate-400 font-semibold mt-4">Absensi hari ini sudah lengkap ✓</p>`;
    }
    lucide.createIcons();
}




function renderPerbaikanAbsenEmployeeSelect() {
    const select = document.getElementById('perbaikan-absen-employee');
    const dateInput = document.getElementById('perbaikan-absen-date');
    if (!select) return;
    const prevValue = select.value;
    select.innerHTML = '<option value="">Pilih Karyawan</option>' + employeesCache.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
    if (Array.from(select.options).some(o => o.value === prevValue)) select.value = prevValue;
    if (dateInput && !dateInput.value) dateInput.value = getTodayDateStr();
    loadPerbaikanAbsenRecord();
}



function isoToLocalHM(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}



function localDateTimeToIso(dateStr, hm) {
    return new Date(`${dateStr}T${hm}:00`).toISOString();
}

function loadPerbaikanAbsenRecord() {
    const empSelect = document.getElementById('perbaikan-absen-employee');
    const dateInput = document.getElementById('perbaikan-absen-date');
    const masukInput = document.getElementById('perbaikan-absen-masuk');
    const keluarInput = document.getElementById('perbaikan-absen-keluar');
    const status = document.getElementById('perbaikan-absen-status');
    if (!empSelect || !dateInput || !masukInput || !keluarInput || !status) return;

    const empId = empSelect.value;
    const dateStr = dateInput.value;
    if (!empId || !dateStr) {
        masukInput.value = '';
        keluarInput.value = '';
        status.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">Pilih karyawan & tanggal dulu.</p>';
        return;
    }

    const record = attendanceLogCache.find(r => r.date === dateStr && r.employeeId === empId);
    masukInput.value = record ? isoToLocalHM(record.masukTime) : '';
    keluarInput.value = record ? isoToLocalHM(record.keluarTime) : '';

    if (!record || (!record.masukTime && !record.keluarTime)) {
        status.innerHTML = '<p class="text-xs text-amber-700 font-semibold text-center py-3 bg-amber-50 rounded-xl">⚠️ Belum ada catatan absen sama sekali di tanggal ini.</p>';
    } else if (record.masukTime && !record.keluarTime) {
        status.innerHTML = '<p class="text-xs text-orange-700 font-semibold text-center py-3 bg-orange-50 rounded-xl">⏳ Sudah absen masuk, belum absen keluar.</p>';
    } else if (record.keluarAuto) {
        status.innerHTML = '<p class="text-xs text-blue-700 font-semibold text-center py-3 bg-blue-50 rounded-xl">🔄 Absen keluar sempat ditutup otomatis oleh sistem (lupa absen keluar). Bisa diperbaiki jamnya di bawah kalau perlu.</p>';
    } else {
        status.innerHTML = '<p class="text-xs text-emerald-700 font-semibold text-center py-3 bg-emerald-50 rounded-xl">✓ Absensi tanggal ini sudah lengkap.</p>';
    }
}



function fillPerbaikanKeluarSelesai() {
    const keluarInput = document.getElementById('perbaikan-absen-keluar');
    if (keluarInput) keluarInput.value = '23:59';
}

function savePerbaikanAbsen() {
    const empSelect = document.getElementById('perbaikan-absen-employee');
    const dateInput = document.getElementById('perbaikan-absen-date');
    const masukInput = document.getElementById('perbaikan-absen-masuk');
    const keluarInput = document.getElementById('perbaikan-absen-keluar');
    const empId = empSelect ? empSelect.value : '';
    const dateStr = dateInput ? dateInput.value : '';
    const masukVal = masukInput ? masukInput.value : '';
    const keluarVal = keluarInput ? keluarInput.value : '';

    if (!empId) return alert('Pilih karyawan dulu!');
    if (!dateStr) return alert('Pilih tanggal dulu!');
    if (!masukVal && !keluarVal) return alert('Isi minimal salah satu jam (Masuk atau Keluar) yang mau diperbaiki.');
    if (masukVal && keluarVal && keluarVal <= masukVal) {
        if (!confirm('Jam Keluar sama/lebih awal dari jam Masuk — yakin mau disimpan begini?')) return;
    }
    if (!window.FB || !window.FB.ready) return showToast('Belum terhubung ke database. Coba lagi sebentar.', 'warn');

    const empName = (employeesCache.find(e => e.id === empId) || {}).name || '';
    const field = { date: dateStr, employeeId: empId };
    if (masukVal) {
        field.masukTime = localDateTimeToIso(dateStr, masukVal);
        field.masukBy = `${empName} (diperbaiki Admin)`;
        field.masukById = empId;
    }
    if (keluarVal) {
        field.keluarTime = localDateTimeToIso(dateStr, keluarVal);
        field.keluarBy = `${empName} (diperbaiki Admin)`;
        field.keluarById = empId;
        field.keluarAuto = false; 
    }

    const { db, doc, setDoc } = window.FB;
    const docId = `${dateStr}_${empId}`;
    setDoc(doc(db, 'attendance', docId), field, { merge: true }).then(() => {
        showToast('Absensi berhasil diperbaiki! "Input Total Penjualan" tanggal ini ikut terbuka kalau sudah lengkap.', 'success');
    }).catch((err) => {
        console.error('Gagal perbaiki absensi:', err);
        showToast('Gagal menyimpan perbaikan ke server.', 'warn');
    });
}


function renderRiwayatAbsenEmployeeSelect() {
    const select = document.getElementById('riwayat-absen-employee-select');
    if (!select) return;
    const prevValue = select.value;
    select.innerHTML = employeesCache.map(e => `<option value="${e.id}">${e.name}</option>`).join('') || '<option value="">Belum ada karyawan</option>';
    if (Array.from(select.options).some(o => o.value === prevValue)) select.value = prevValue;
    renderRiwayatAbsen();
}




function getRiwayatAbsenForEmployee(empId, monthFilter) {
    return attendanceLogCache
        .filter(r => r.masukById === empId && (!monthFilter || r.date.startsWith(monthFilter)))
        .sort((a, b) => b.date.localeCompare(a.date));
}

function renderRiwayatAbsen() {
    const body = document.getElementById('riwayat-absen-body');
    const select = document.getElementById('riwayat-absen-employee-select');
    if (!body || !select) return;
    const empId = select.value;
    const records = empId ? getRiwayatAbsenForEmployee(empId).slice(0, 7) : []; 

    body.innerHTML = records.map(r => {
        const dateObj = new Date(r.date + 'T00:00:00');
        const hari = dateObj.toLocaleDateString('id-ID', { weekday: 'long' });
        const tanggalFormatted = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
        const masukStr = r.masukTime ? new Date(r.masukTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';
        const keluarStr = r.keluarTime ? new Date(r.keluarTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';
        return `
        <tr class="border-b border-slate-50">
            <td class="p-3 font-semibold text-slate-700">${hari}</td>
            <td class="p-3 text-slate-500">${tanggalFormatted}</td>
            <td class="p-3 text-emerald-600 font-bold">${masukStr}</td>
            <td class="p-3 text-orange-600 font-bold">${keluarStr}</td>
        </tr>`;
    }).join('') || `<tr><td colspan="4" class="text-center p-6 text-slate-400 text-xs">${empId ? 'Belum ada riwayat absen' : 'Pilih karyawan dulu'}</td></tr>`;
}

async function downloadRiwayatAbsenPDF() {
    const select = document.getElementById('riwayat-absen-employee-select');
    const monthInput = document.getElementById('riwayat-absen-month');
    const empId = select ? select.value : '';
    if (!empId) return alert('Pilih karyawan dulu!');

    const emp = employeesCache.find(e => e.id === empId);
    const monthVal = (monthInput && monthInput.value) ? monthInput.value : getTodayDateStr().slice(0, 7); 
    const records = getRiwayatAbsenForEmployee(empId, monthVal).sort((a, b) => a.date.localeCompare(b.date));

    if (records.length === 0) {
        return alert('Tidak ada data absen di bulan tersebut untuk karyawan ini.');
    }

    await ensureJsPDF();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const monthLabel = new Date(`${monthVal}-01T00:00:00`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    doc.text(`Riwayat Absen - ${emp ? emp.name : ''} - ${monthLabel}`, 10, 10);

    const data = records.map(r => {
        const dateObj = new Date(r.date + 'T00:00:00');
        const hari = dateObj.toLocaleDateString('id-ID', { weekday: 'long' });
        const tgl = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
        const masukStr = r.masukTime ? new Date(r.masukTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';
        const keluarStr = r.keluarTime ? new Date(r.keluarTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';
        return [hari, tgl, masukStr, keluarStr];
    });

    doc.autoTable({ head: [['Hari', 'Tanggal', 'Jam Masuk', 'Jam Keluar']], body: data, startY: 18 });
    doc.save(`Absen-${(emp ? emp.name : 'Karyawan').replace(/\s+/g, '_')}-${monthVal}.pdf`);
}


function isSameDay(dateA, dateB) {
    return dateA.getFullYear() === dateB.getFullYear() &&
        dateA.getMonth() === dateB.getMonth() &&
        dateA.getDate() === dateB.getDate();
}

function getTodaysOrders() {
    const today = new Date();
    return orderHistory.filter(o => {
        const ts = o.timestamp ? new Date(o.timestamp) : null;
        return ts && !isNaN(ts) && isSameDay(ts, today);
    }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); 
}

function openSalesReport() {
    renderSalesReport();
    document.getElementById('modal-sales-report').classList.remove('hidden');
    lucide.createIcons();
}

function closeSalesReport() {
    document.getElementById('modal-sales-report').classList.add('hidden');
}


function renderSalesReport() {
    const empId = currentSessionEmployeeId;

    const allTodaysOrders = getTodaysOrders();
    const todaysOrders = empId ? allTodaysOrders.filter(o => o.employeeId === empId) : allTodaysOrders;
    const total = todaysOrders.reduce((sum, o) => sum + o.total, 0);

    const dateLabel = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    document.getElementById('sales-report-date').innerText = currentSessionEmployeeName ? `${dateLabel} · ${currentSessionEmployeeName}` : dateLabel;
    document.getElementById('sales-report-total').innerText = `Rp ${total.toLocaleString()}`;
    document.getElementById('sales-report-count').innerText = todaysOrders.length;

    const body = document.getElementById('sales-report-body');

    if (todaysOrders.length === 0) {
        body.innerHTML = `<tr><td colspan="4" class="text-center p-8 text-slate-400 text-xs">Belum ada transaksi hari ini</td></tr>`;
        return;
    }

    body.innerHTML = todaysOrders.map(o => {
        const time = new Date(o.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        const itemText = o.items.map(i => `${i.name} x${i.qty}`).join(', ');
        return `
        <tr class="border-b border-slate-100">
            <td class="p-3 align-top font-semibold text-slate-500 whitespace-nowrap">${time}</td>
            <td class="p-3 align-top text-slate-800">${itemText}</td>
            <td class="p-3 align-top">
                <span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[10px] font-bold">${o.method}</span>
            </td>
            <td class="p-3 align-top text-right font-bold text-blue-600 whitespace-nowrap">Rp ${o.total.toLocaleString()}</td>
        </tr>`;
    }).join('');
}


function askConfirmOrder() {
    
    
    if (selectedPayment === 'Cash') {
        const received = parseInt((document.getElementById('cash-received-input') || {}).value, 10) || 0;
        const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
        if (received <= 0) return alert('Isi dulu nominal uang yang diterima!');
        if (received < total) return alert('Uang diterima kurang dari total belanja!');
    }
    document.getElementById('modal-confirm-order').classList.remove('hidden');
    lucide.createIcons();
}

function cancelConfirmOrder() {
    document.getElementById('modal-confirm-order').classList.add('hidden');
}

function processOrder() {
    document.getElementById('modal-confirm-order').classList.add('hidden');

    const now = new Date();
    
    
    const receiptID = now.toISOString().replace(/[-:T.]/g, '').slice(2, 14) + Math.floor(Math.random() * 90 + 10);

    const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    
    
    
    
    const paidAmount = selectedPayment === 'Cash'
        ? (parseInt((document.getElementById('cash-received-input') || {}).value, 10) || 0)
        : total;

    lastOrder = {
        id: receiptID,
        date: now.toLocaleString('id-ID'),
        timestamp: now.toISOString(), 
        total,
        paidAmount,
        change: paidAmount - total,
        method: selectedPayment,
        items: JSON.parse(JSON.stringify(cart)),
        employeeId: currentSessionEmployeeId, 
        employeeName: currentSessionEmployeeName
    };

    saveOrderToFirestore(lastOrder);
    decreaseStockForOrder(lastOrder.items, getCurrentKasirEmployeeId());
    updateConnectionUI();

    document.getElementById('modal-checkout').classList.add('hidden');
    document.getElementById('modal-success').classList.remove('hidden');
    renderReceiptPreview();
    playPaymentSuccessSound();
    if (navigator.vibrate) navigator.vibrate([30, 40, 30]); 
    launchSuccessConfetti();
    lucide.createIcons();
}





function renderReceiptPreview() {
    const el = document.getElementById('receipt-preview');
    if (!el || !lastOrder) return;

    
    
    const kasirEmp = employeesCache.find(e => e.id === lastOrder.employeeId);
    const addressHtml = (kasirEmp && kasirEmp.address)
        ? `<div class="rc-sub">${kasirEmp.address}${kasirEmp.phone ? `, ${kasirEmp.phone}` : ''}</div>`
        : `<div class="rc-sub">Digital Point of Sales</div>`;

    const itemsHtml = lastOrder.items.map((i) => {
        const variantLines = i.variantSelections
            ? `<div class="rc-item-variant">${i.variantSelections.map(v => `${v.name} x${v.qty}`).join(', ')}</div>`
            : '';
        return `
        <div class="rc-item-row">
            <div>
                <div class="rc-item-name">${i.name}</div>
                <div class="rc-item-sub">Rp${i.price.toLocaleString()} x ${i.qty}</div>
                ${variantLines}
            </div>
            <div class="rc-item-total">Rp${(i.qty * i.price).toLocaleString()}</div>
        </div>`;
    }).join('');

    
    
    const paymentRowsHtml = lastOrder.paidAmount != null
        ? `
        <div class="rc-row"><span>Bayar</span><span class="rc-bold">Rp${lastOrder.paidAmount.toLocaleString()}</span></div>
        <div class="rc-row"><span>Kembali</span><span class="rc-bold">Rp${lastOrder.change.toLocaleString()}</span></div>`
        : '';

    el.innerHTML = `
        <div class="rc-center">
            <div class="rc-store-name">${STORE_NAME}</div>
            ${addressHtml}
        </div>
        <div class="rc-hr"></div>
        <div class="rc-row"><span>No</span><span class="rc-bold">${lastOrder.id}</span></div>
        <div class="rc-row"><span>Tanggal</span><span class="rc-bold">${lastOrder.date}</span></div>
        <div class="rc-row"><span>Kasir</span><span class="rc-bold">${lastOrder.employeeName || '-'}</span></div>
        <div class="rc-row"><span>Pembayaran</span><span class="rc-bold">${lastOrder.method}</span></div>
        <div class="rc-hr"></div>
        ${itemsHtml}
        <div class="rc-hr"></div>
        <div class="rc-row"><span class="rc-bold" style="font-size:15px;">Total</span><span class="rc-bold" style="font-size:15px;">Rp${lastOrder.total.toLocaleString()}</span></div>
        ${paymentRowsHtml}
        <div class="rc-hr"></div>
        <div class="rc-center" style="font-size:12px;color:#64748b;">Terimakasih telah berbelanja</div>`;
}



function launchSuccessConfetti() {
    const modal = document.querySelector('#modal-success');
    if (!modal) return;
    const colors = ['#2563eb', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4'];
    const holder = document.createElement('div');
    holder.className = 'confetti-holder';
    for (let i = 0; i < 24; i++) {
        const piece = document.createElement('span');
        piece.className = 'confetti-piece';
        piece.style.left = Math.random() * 100 + '%';
        piece.style.background = colors[i % colors.length];
        piece.style.animationDelay = (Math.random() * 0.3) + 's';
        piece.style.transform = `rotate(${Math.random() * 360}deg)`;
        holder.appendChild(piece);
    }
    modal.appendChild(holder);
    setTimeout(() => holder.remove(), 1600);
}





function playPaymentSuccessSound() {
    try {
        const audio = new Audio('https://www.image2url.com/r2/default/audio/1788174268372-6107ba19-18b9-4c0a-ba75-f1b35c5472db.mp3');
        audio.play().catch(err => console.warn('Gagal memutar suara pembayaran berhasil:', err));
    } catch (err) {
        console.warn('Gagal memutar suara pembayaran berhasil:', err);
    }
}




function saveOrderToFirestore(order) {
    if (!window.FB || !window.FB.ready) {
        showToast('Belum terhubung ke database, transaksi akan otomatis tersimpan begitu koneksi ke server aktif.', 'warn');
        return;
    }
    const { db, collection, addDoc } = window.FB;
    addDoc(collection(db, 'sales'), order).catch((err) => {
        console.error('Gagal menyimpan transaksi:', err);
        showToast('Gagal menyimpan transaksi ke server.', 'warn');
    });
}

function finishTransaction() {
    cart = [];
    lastOrder = null;
    updateCartUI();
    document.getElementById('modal-success').classList.add('hidden');
    
    
    const visibleCategories = getVisibleCategoriesForCurrentKasir();
    filterCategory(visibleCategories.includes('Makanan') ? 'Makanan' : (visibleCategories[0] || ''));
}


function openLoginModal() { document.getElementById('modal-login').classList.remove('hidden'); }
function closeLoginModal() { document.getElementById('modal-login').classList.add('hidden'); }
async function checkLogin() {
    const email = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-pass').value;
    if (!email || !pass) return alert('Isi email & password dulu!');
    if (!window.FB || !window.FB.ready) return alert('Belum terhubung ke database. Coba lagi sebentar.');

    const loginBtn = document.getElementById('login-submit-btn');
    if (loginBtn) { loginBtn.disabled = true; loginBtn.innerText = 'Memeriksa...'; }

    try {
        const { auth, signInWithEmailAndPassword } = window.FB;
        await signInWithEmailAndPassword(auth, email, pass);
        closeLoginModal();
        showPage('admin');
    } catch (err) {
        console.error('Login admin gagal:', err);
        
        const friendlyMessages = {
            'auth/invalid-email': 'Format email tidak valid.',
            'auth/user-not-found': 'Akun admin ini belum terdaftar di Firebase.',
            'auth/wrong-password': 'Password salah.',
            'auth/invalid-credential': 'Email atau password salah.',
            'auth/too-many-requests': 'Terlalu banyak percobaan gagal. Coba lagi beberapa saat lagi.',
            'auth/network-request-failed': 'Koneksi internet bermasalah, coba lagi.'
        };
        alert(friendlyMessages[err.code] || 'Akses Ditolak!');
    } finally {
        if (loginBtn) { loginBtn.disabled = false; loginBtn.innerText = 'Masuk'; }
    }
}

function toggleAdminAccordion(bodyId) {
    const body = document.getElementById(bodyId);
    if (!body) return;
    const toggleBtn = body.previousElementSibling; 
    const chevron = toggleBtn ? toggleBtn.querySelector('.admin-accordion-chevron') : null;
    const isCurrentlyOpen = !body.classList.contains('hidden');

    body.classList.toggle('hidden', isCurrentlyOpen);
    if (chevron) chevron.classList.toggle('is-open', !isCurrentlyOpen);
}





function showAdminGroup(groupId) {
    const level1 = document.getElementById('admin-menu-level1');
    if (level1) level1.classList.add('hidden');
    document.querySelectorAll('.admin-group-view').forEach((el) => el.classList.add('hidden'));
    const target = document.getElementById(`admin-group-${groupId}`);
    if (target) target.classList.remove('hidden');
    const sidebar = document.getElementById('page-admin');
    if (sidebar) sidebar.scrollTop = 0;
    lucide.createIcons();
}

function showAdminMenuLevel1() {
    document.querySelectorAll('.admin-group-view').forEach((el) => el.classList.add('hidden'));
    const level1 = document.getElementById('admin-menu-level1');
    if (level1) level1.classList.remove('hidden');
    const sidebar = document.getElementById('page-admin');
    if (sidebar) sidebar.scrollTop = 0;
    lucide.createIcons();
}






function showPage(page) {
    const enteringAdmin = page === 'admin';
    adminPanelOpen = enteringAdmin;

    const sidebar = document.getElementById('page-admin');
    const backdrop = document.getElementById('admin-backdrop');
    if (sidebar) {
        sidebar.classList.toggle('sidebar-open', enteringAdmin);
        sidebar.toggleAttribute('inert', !enteringAdmin);
    }
    if (backdrop) {
        backdrop.classList.toggle('show', enteringAdmin);
        backdrop.toggleAttribute('inert', !enteringAdmin);
    }
    ['page-home', 'bottom-bar'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        
        
        
        if (enteringAdmin) {
            el.setAttribute('inert', '');
        } else if (!shiftEndedActive && !mandatoryMasukGateActive) {
            el.removeAttribute('inert');
        }
    });

    if (enteringAdmin) {
        
        
        
        forceHideKasirLockScreens();
        showAdminMenuLevel1(); 
        initAdminOnlyFirestoreSync(); 
        renderAdminTools();
        refreshAttendanceAdminViews();
    } else {
        
        restoreKasirLockScreensIfNeeded();
        signBackToAnonymousIfAdmin(); 
    }
    lucide.createIcons();
}


function closeAdminSidebar() {
    showPage('home');
}




function goToKasirDashboard() {
    if (adminPanelOpen) {
        closeAdminSidebar();
    }
}




function signBackToAnonymousIfAdmin() {
    if (!window.FB || !window.FB.auth) return;
    const user = window.FB.auth.currentUser;
    if (user && !user.isAnonymous) {
        window.FB.signOut(window.FB.auth)
            .then(() => window.FB.signInAnonymously(window.FB.auth))
            .catch((err) => console.error('Gagal kembali ke sesi anonim:', err));
    }
}



function forceHideKasirLockScreens() {
    const gate = document.getElementById('shift-ended-gate');
    gate.classList.add('hidden');
    gate.classList.remove('flex');

    const popup = document.getElementById('modal-absen-popup');
    if (popup) {
        popup.classList.add('hidden');
        popup.classList.remove('flex');
    }

    const pinLock = document.getElementById('pin-lock-screen');
    if (pinLock) {
        pinLock.classList.add('hidden');
        pinLock.classList.remove('flex');
    }
}



function restoreKasirLockScreensIfNeeded() {
    
    
    if (!pinLockResolved) {
        tryShowPinLock();
        return;
    }
    if (shiftEndedActive) {
        const gate = document.getElementById('shift-ended-gate');
        gate.classList.remove('hidden');
        gate.classList.add('flex');
        return; 
    }
    if (mandatoryMasukGateActive) {
        openAbsenPopup(true); 
    }
}

function sendWhatsApp() {
    if (!lastOrder) return;
    let phone = document.getElementById('wa-number').value.replace(/[^0-9]/g, "");
    if (phone.startsWith("0")) phone = "62" + phone.slice(1);
    let text = `*STRUK ${STORE_NAME}*%0A------------------%0A`;
    lastOrder.items.forEach(i => {
        text += `${i.name} x${i.qty} = ${i.price * i.qty}%0A`;
        if (i.variantSelections) {
            text += i.variantSelections.map(v => `  - ${v.name} x${v.qty}`).join('%0A') + '%0A';
        }
    });
    text += `------------------%0A*TOTAL: Rp ${lastOrder.total.toLocaleString()}*`;
    if (lastOrder.paidAmount != null) {
        text += `%0ABayar: Rp ${lastOrder.paidAmount.toLocaleString()}%0AKembali: Rp ${lastOrder.change.toLocaleString()}`;
    }
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
}


async function printReceipt() {
    await ensureJsPDF(); 
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: [80, 150] });
    const pageWidth = 80;
    const marginX = 5;
    const rightX = pageWidth - marginX;

    const drawDashedLine = (y) => {
        doc.setLineDashPattern([1, 1], 0);
        doc.setDrawColor(120, 120, 120);
        doc.line(marginX, y, rightX, y);
        doc.setLineDashPattern([], 0);
    };

    
    doc.setFontSize(13).setFont(undefined, 'bold');
    doc.text(STORE_NAME, pageWidth / 2, 10, { align: "center" });
    doc.setFontSize(7).setFont(undefined, 'normal');

    
    
    const kasirEmpPdf = employeesCache.find(e => e.id === lastOrder.employeeId);
    let y = 15;
    if (kasirEmpPdf && kasirEmpPdf.address) {
        doc.text(kasirEmpPdf.address, pageWidth / 2, y, { align: "center" });
        y += 4;
        if (kasirEmpPdf.phone) {
            doc.text(`Hp. ${kasirEmpPdf.phone}`, pageWidth / 2, y, { align: "center" });
            y += 4;
        }
    } else {
        doc.text("Digital Point of Sales", pageWidth / 2, y, { align: "center" });
        y += 5;
    }

    drawDashedLine(y);
    y += 5;

    doc.setFontSize(8);
    doc.text(`No: ${lastOrder.id}`, marginX, y);
    doc.text(`${lastOrder.date}`, rightX, y, { align: "right" });
    y += 4;
    doc.text(`Metode: ${lastOrder.method}`, marginX, y);
    y += 3;

    drawDashedLine(y);
    y += 6;

    
    lastOrder.items.forEach(i => {
        doc.setFont(undefined, 'normal').setFontSize(8);
        doc.text(`${i.name} x${i.qty}`, marginX, y);
        doc.text(`${(i.price * i.qty).toLocaleString()}`, rightX, y, { align: "right" });
        y += 5;
        if (i.variantSelections) {
            doc.setFontSize(6.5);
            i.variantSelections.forEach(v => {
                doc.text(`- ${v.name} x${v.qty}`, marginX + 2, y);
                y += 3.5;
            });
        }
        y += 2;
    });

    drawDashedLine(y);
    y += 6;

    
    doc.setFontSize(10).setFont(undefined, 'bold');
    doc.text(`TOTAL`, marginX, y);
    doc.text(`Rp ${lastOrder.total.toLocaleString()}`, rightX, y, { align: "right" });
    y += 5;

    
    if (lastOrder.paidAmount != null) {
        doc.setFontSize(8).setFont(undefined, 'normal');
        doc.text(`Bayar`, marginX, y);
        doc.text(`Rp ${lastOrder.paidAmount.toLocaleString()}`, rightX, y, { align: "right" });
        y += 4;
        doc.text(`Kembali`, marginX, y);
        doc.text(`Rp ${lastOrder.change.toLocaleString()}`, rightX, y, { align: "right" });
        y += 3;
    }

    drawDashedLine(y);
    y += 6;

    
    doc.setFontSize(7).setFont(undefined, 'normal');
    doc.text("Terima kasih telah berbelanja!", pageWidth / 2, y, { align: "center" });

    doc.save(`Struk-${lastOrder.id}.pdf`);
}

async function downloadPDF() {
    await ensureJsPDF(); 
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const monthInput = document.getElementById('report-filter-month');
    const monthVal = (monthInput && monthInput.value) ? monthInput.value : getTodayDateStr().slice(0, 7);
    const monthLabel = new Date(`${monthVal}-01T00:00:00`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

    const rows = getMonthlySalesRows(); 
    doc.text(`Total Penjualan OKTSHOP17 - ${monthLabel}`, 10, 10);
    const data = rows.map(r => {
        const dateObj = new Date(r.date + 'T00:00:00');
        const tglLabel = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
        const avg = r.qty > 0 ? Math.round(r.total / r.qty) : 0;
        return [tglLabel, r.user, `Rp ${r.total.toLocaleString()}`, r.qty, `Rp ${avg.toLocaleString()}`];
    });
    
    const totalSales = rows.reduce((sum, r) => sum + r.total, 0);
    const totalQty = rows.reduce((sum, r) => sum + r.qty, 0);
    const totalAvg = totalQty > 0 ? Math.round(totalSales / totalQty) : 0;
    data.push(['TOTAL', '', `Rp ${totalSales.toLocaleString()}`, totalQty, `Rp ${totalAvg.toLocaleString()}`]);

    doc.autoTable({ head: [['Tgl/Bln/Thn', 'User', 'Sales', 'Qty', 'Avg']], body: data, startY: 18 });
    doc.save(`Total-Penjualan-${monthVal}.pdf`);
}

init();
