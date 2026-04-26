/**
 * a4-kiosk.js - Specialized logic for Hayyat Copy Paper Kiosk
 */

// Configuration
const SPREADSHEET_ID = "1-KuOU3Kj4Yo6afuGN5qENwAlGvGUORQSz8qfcNCqv18";
const API_KEY = "AIzaSyA05kFZ9ejXco6wpLFfV8WUVaUBbjnhhVI";
const SHEET_NAME = "Sheet1";

// Column Indices (Same as main script for consistency)
const COL = {
    ID: 0, AVAILABILITY: 1, CATEGORY: 2, NAME: 3,
    LENGTH: 6, WIDTH: 7, GSM: 8, SHEETS: 9,
    RATE: 10, WEIGHT: 11, PRICE: 12, MAX: 13, IMAGE: 14,
    HAS_COLORS: 15, COLOR_OPTIONS: 16,
    DISPLAY_SIZE: 17, DISCOUNT_TAG: 18, NEW_TAG: 19,
    STOCK: 5, MIN_STOCK: 24, ERP_CODE: 27, ERP_DESC: 28, PACKING_TYPE: 29
};

let globalProducts = {};
let cart = {};
let lunrIndex = null;

// Initialization
// Initialization with Auth Guard
document.addEventListener('DOMContentLoaded', () => {
    const auth = localStorage.getItem("HAYYAT_KIOSK_AUTHORIZED") || window.location.search.includes('HAYYAT_STORE_2026');
    if (auth) {
        localStorage.setItem("HAYYAT_KIOSK_AUTHORIZED", "true");
        document.getElementById('kiosk-auth-overlay').style.display = 'none';
        fetchProducts();
        startTimeUpdate();
    } else {
        document.getElementById('kiosk-auth-overlay').style.display = 'flex';
        document.getElementById('loading-indicator').style.display = 'none';
    }
});

// IDLE AUTO-REFRESH (60 Seconds)
let idleTimer;
function startIdleTimer() {
    function reset() {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
            localStorage.removeItem('hayyat_a4_cart');
            window.location.reload();
        }, 60000);
    }
    ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(e => document.addEventListener(e, reset, true));
    reset();
}
startIdleTimer();

function startTimeUpdate() {
    const update = () => {
        const now = new Date();
        document.getElementById('current-time').innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };
    update();
    setInterval(update, 1000);
}

// 1. Specialized Fetch (Copy Paper Only)
async function fetchProducts() {
    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}!A1:AD?key=${API_KEY}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch data');

        const data = await response.json();
        const rows = data.values.slice(1);

        // DEBUG: Log all categories to help troubleshooting
        const allCats = [...new Set(rows.map(r => r[COL.CATEGORY]))];
        console.log("[DEBUG] Categories found in sheet:", allCats);

        // FILTER: Flexible matching for "Copy Paper"
        const filteredRows = rows.filter(r => {
            const rowCat = (r[COL.CATEGORY] || "").trim().toLowerCase();
            const isAvailable = r[COL.AVAILABILITY]?.toUpperCase() === "YES";
            return isAvailable && (rowCat === "copy paper" || rowCat === "photocopy paper");
        });

        console.log(`[DEBUG] Found ${filteredRows.length} items in Copy Paper`);

        if (filteredRows.length === 0) {
            document.getElementById('loading-indicator').innerHTML =
                `<p style="color:red;">No products found in "Copy Paper" category.<br>Check console (F12) for list of found categories.</p>`;
            return;
        }

        const grouped = groupProducts(filteredRows);
        globalProducts = grouped;
        renderCopyPaper(grouped);

        document.getElementById('loading-indicator').style.display = 'none';
        document.getElementById('product-list').style.display = 'grid';
    } catch (error) {
        console.error('Fetch error:', error);
        document.getElementById('loading-indicator').innerHTML = `<p style="color:red;">Error: ${error.message}</p>`;
    }
}

function groupProducts(rows) {
    const g = {};
    rows.forEach(r => {
        const name = r[COL.NAME] || 'Unknown';
        if (!g[name]) g[name] = { name: name, variations: [] };

        g[name].variations.push({
            id: r[COL.ID],
            name: name,
            size: `${r[COL.LENGTH]}x${r[COL.WIDTH]}`,
            gsm: r[COL.GSM],
            price: Math.round(parseFloat(r[COL.PRICE] || 0)),
            rate: r[COL.RATE],
            weight: parseFloat(r[COL.WEIGHT] || 0),
            maxLimit: parseInt(r[COL.MAX] || 999), // Pulling from Column N
            image: r[COL.IMAGE] || "https://via.placeholder.com/300x200?text=Paper",
            brand: r[COL.DISPLAY_SIZE] || 'Standard',
            discount: r[COL.DISCOUNT_TAG],
            isNew: r[COL.NEW_TAG],
            erpCode: r[COL.ERP_CODE],
            erpDesc: r[COL.ERP_DESC],
            packingType: r[COL.PACKING_TYPE],
            stock: parseInt(r[COL.STOCK] || 0),
            minStock: parseInt(r[COL.MIN_STOCK] || 0)
        });
    });
    return g;
}

// 2. Specialized Rendering (Persuasive UI)
let currentSelectedProduct = null;

function renderCopyPaper(groups) {
    const wrap = document.getElementById('product-list');
    wrap.innerHTML = "";

    // IF NO PRODUCT SELECTED: Show the big beautiful tiles
    if (!currentSelectedProduct) {
        wrap.className = 'selection-stage';

        const tiles = [
            { name: 'A4 Paper', match: 'A4 PAPER', icon: '📄', desc: 'Standard Office Size', cls: 'tile-a4' },
            { name: 'F4 Paper', match: 'F4 PAPER', icon: '📃', desc: 'Legal / Foolscap Size', cls: 'tile-f4' }
        ];

        tiles.forEach(t => {
            // Find the group key that matches (case-insensitive)
            const groupKey = Object.keys(groups).find(k => k.trim().toUpperCase() === t.match);

            if (groupKey) {
                const tile = document.createElement('div');
                tile.className = `selection-tile ${t.cls}`;
                tile.onclick = () => {
                    currentSelectedProduct = groupKey;
                    renderCopyPaper(groups);
                };
                tile.innerHTML = `
                    <div class="tile-icon">${t.icon}</div>
                    <h2>${t.name}</h2>
                    <p>${t.desc}</p>
                `;
                wrap.appendChild(tile);
            }
        });
        return;
    }

    // IF PRODUCT SELECTED: Show the detailed card
    wrap.className = 'copy-paper-container detail-view';

    // Add Back Button
    const backContainer = document.createElement('div');
    backContainer.className = 'back-btn-container';
    backContainer.style.gridColumn = "1 / -1";
    backContainer.innerHTML = `
        <button class="btn-back" onclick="resetToSelection()">
            <span>←</span> Back to Selection
        </button>
    `;
    wrap.appendChild(backContainer);

    const product = groups[currentSelectedProduct];
    const name = currentSelectedProduct;
    const pId = name.replace(/\s+/g, '_');

    // Get unique sizes for this product
    const sizes = [...new Set(product.variations.map(v => v.size))];

    // State for this card (Initialize only if not exists)
    if (!window[`state_${pId}`]) {
        window[`state_${pId}`] = {
            size: sizes[0],
            brand: null,
            gsm: null
        };
    }

    const layoutWrapper = document.createElement('div');
    layoutWrapper.className = 'detail-layout-wrapper';

    // 1. Standalone Image Box
    const imageBox = document.createElement('div');
    imageBox.className = 'standalone-image-box';
    imageBox.innerHTML = `
        <img id="img_${pId}" src="${product.variations[0].image}" alt="${name}">
        <div id="brand_display_${pId}" class="brand-name-display">
            <!-- Brand name updated via JS -->
        </div>
    `;
    layoutWrapper.appendChild(imageBox);

    // 2. The Main Content Card
    const card = document.createElement('div');
    card.className = 'copy-paper-card content-only-card';
    card.innerHTML = `
        <div class="card-header">
            <h2>${name}</h2>
            <span class="badge-premium">PREMIUM QUALITY</span>
        </div>
        <div class="card-body">
            <div class="card-content-side">
                <!-- Size Selection -->
                <span class="variation-label">1. Choose Size:</span>
                <div class="variation-grid size-grid">
                    ${sizes.map(s => `<button class="var-btn ${s === window[`state_${pId}`].size ? 'active' : ''}" onclick="selectVariation('${pId}', 'size', '${s}', this)">${s}</button>`).join('')}
                </div>

                <!-- GSM Selection (Dynamic) -->
                <span class="variation-label">2. Choose Thickness (GSM):</span>
                <div id="gsms_${pId}" class="variation-grid gsm-grid">
                    <!-- GSMs injected here -->
                </div>

                <!-- Brand Selection (Dynamic) -->
                <span class="variation-label">3. Select Brand:</span>
                <div id="brands_${pId}" class="variation-grid brand-grid">
                    <!-- Brands injected here -->
                </div>

                <div class="price-section">
                    <div id="price_${pId}" class="main-price">Rs 0</div>
                    <div id="rate_${pId}" class="rate-per-kg">Rs 0 / KG</div>
                </div>
            </div>
        </div>
        <div class="card-actions">
            <div class="qty-control">
                <button class="qty-btn" onclick="updateQty('${pId}', -1)">-</button>
                <input type="number" id="qty_${pId}" value="1" min="1" oninput="updateCardUI('${pId}')" onclick="this.select()">
                <button class="qty-btn" onclick="updateQty('${pId}', 1)">+</button>
            </div>
            <button class="add-btn" onclick="addToCart('${pId}')">Add to Order</button>
        </div>
    `;
    layoutWrapper.appendChild(card);

    // 3. Standalone Saver Box
    const saverBox = document.createElement('div');
    saverBox.id = `comp_${pId}`;
    saverBox.className = 'standalone-saver-box';
    saverBox.innerHTML = `
        <!-- Best Value suggestion here -->
    `;
    layoutWrapper.appendChild(saverBox);

    wrap.appendChild(layoutWrapper);

    // Update the UI
    updateCardUI(pId);
}

function resetToSelection() {
    currentSelectedProduct = null;
    renderCopyPaper(globalProducts);
}

function selectVariation(pId, type, value, btn) {
    const state = window[`state_${pId}`];
    state[type] = value;

    // Reset dependents
    if (type === 'size') {
        state.gsm = null;
        state.brand = null;
    } else if (type === 'gsm') {
        state.brand = null;
    }

    // UI Feedback
    const grid = btn.parentElement;
    grid.querySelectorAll('.var-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    updateCardUI(pId);
}

// 3. The "Intracard Comparison" Engine
function updateCardUI(pId) {
    const qtyInput = document.getElementById(`qty_${pId}`);
    const qty = parseInt(qtyInput.value) || 1;

    // Ensure value is at least 1 if user clears it
    if (qtyInput.value === "") { /* allow empty during typing */ }
    else if (qty < 1) qtyInput.value = 1;

    const state = window[`state_${pId}`];
    const productName = pId.replace(/_/g, ' ');
    const variations = globalProducts[productName].variations;

    // 1. Update GSMs for selected Size
    const gsmsForSize = [...new Set(variations.filter(v => v.size === state.size).map(v => v.gsm))];
    const gsmGrid = document.getElementById(`gsms_${pId}`);

    if (state.gsm === null) state.gsm = gsmsForSize[0];

    gsmGrid.innerHTML = gsmsForSize.map(g => `
        <button class="var-btn ${g === state.gsm ? 'active' : ''}" onclick="selectVariation('${pId}', 'gsm', '${g}', this)">${g} GSM</button>
    `).join('');

    // 2. Update Brands for selected Size + GSM
    const brandsForGsm = [...new Set(variations.filter(v => v.size === state.size && v.gsm === state.gsm).map(v => v.brand))];
    const brandGrid = document.getElementById(`brands_${pId}`);

    if (state.brand === null) state.brand = brandsForGsm[0];

    brandGrid.innerHTML = brandsForGsm.map(b => `
        <button class="var-btn ${b === state.brand ? 'active' : ''}" onclick="selectVariation('${pId}', 'brand', '${b}', this)">
            ${b}
            ${variations.find(v => v.size === state.size && v.gsm === state.gsm && v.brand === b && v.discount) ? `<small style="display:block;color:var(--accent);font-size:0.7rem;">OFFER</small>` : ''}
        </button>
    `).join('');

    // 3. Find Final Product and Update Price
    const currentVar = variations.find(v => v.size === state.size && v.brand === state.brand && v.gsm === state.gsm);

    if (currentVar) {
        // Enforce Max Limit on the quantity box
        const max = currentVar.maxLimit || 999;
        qtyInput.max = max;
        if (qty > max) {
            qtyInput.value = max;
            alert(`Maximum allowed quantity for ${currentVar.brand} is ${max}`);
        }

        document.getElementById(`price_${pId}`).innerText = `Rs ${currentVar.price}`;
        document.getElementById(`rate_${pId}`).innerText = `Rate: Rs ${currentVar.rate} / KG`;
        document.getElementById(`img_${pId}`).src = currentVar.image;
        document.getElementById(`brand_display_${pId}`).innerText = currentVar.brand;

        // --- INTRACARD COMPARISON LOGIC ---
        const cheaperBrands = variations.filter(v =>
            v.size === state.size &&
            v.gsm === state.gsm &&
            v.brand !== state.brand &&
            v.price < currentVar.price
        ).sort((a, b) => a.price - b.price);

        const compBox = document.getElementById(`comp_${pId}`);
        const currentQty = parseInt(qtyInput.value) || 1;

        if (cheaperBrands.length > 0) {
            compBox.style.display = 'flex';
            compBox.style.background = '#fff9e6';
            compBox.style.borderColor = 'var(--accent)';
            compBox.classList.add('kiosk-pulse-active'); // Add pulse class

            let html = `
                <div class="comp-header" style="font-family: 'Noto Nastaliq Urdu', serif; direction: rtl; display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <span>💡 کم قیمت والے آپشنز</span>
                    <span style="font-size: 0.8rem; background: #856404; color: white; padding: 2px 8px; border-radius: 10px;">${cheaperBrands.length} سستے آپشنز</span>
                </div>
                <div class="comp-list" style="display:flex; flex-direction:column; gap:10px; margin-top:15px; width: 100%;">
            `;

            cheaperBrands.forEach(alt => {
                const savingsPerUnit = currentVar.price - alt.price;
                const totalSavings = savingsPerUnit * currentQty;
                html += `
                    <div class="comp-item glowing-border-item clickable-suggestion" 
                         onclick="switchToBrand('${pId}', '${alt.brand}')">
                        <div style="display:flex; flex-direction:column; text-align: right;">
                            <span style="font-size:0.75rem; color:#666; font-family: 'Noto Nastaliq Urdu', serif;">اس برانڈ پر جائیں</span>
                            <strong style="font-size:1.2rem; color:var(--primary);">${alt.brand}</strong>
                        </div>
                        <div style="text-align:left;">
                            <span class="comp-savings" style="background:var(--secondary); color:white; padding:6px 15px; border-radius:20px; font-size:1rem; font-weight:800; display: block; font-family: 'Outfit', sans-serif;">Rs ${totalSavings} بچت</span>
                            <div style="font-size:0.75rem; color:#666; margin-top:4px; font-family: 'Noto Nastaliq Urdu', serif;">فی پیکٹ Rs ${savingsPerUnit} بچت</div>
                        </div>
                    </div>
                `;
            });

            html += `</div>`;
            compBox.innerHTML = html;
        } else {
            compBox.style.display = 'flex';
            compBox.style.background = '#f0fff4'; // Light green
            compBox.style.borderColor = '#28a745';
            compBox.classList.remove('kiosk-pulse-active');

            compBox.innerHTML = `
                <div class="comp-header" style="color: #155724; font-family: 'Noto Nastaliq Urdu', serif; direction: rtl; width: 100%; text-align: center;">
                    <span>✅ بہترین قیمت منتخب ہے</span>
                </div>
                <div style="margin-top: 20px; text-align: center; width: 100%;">
                    <div style="font-size: 3.5rem; margin-bottom: 15px; filter: drop-shadow(0 5px 10px rgba(0,0,0,0.1));">💎</div>
                    <p style="color: #155724; font-weight: 700; font-size: 1.1rem; font-family: 'Noto Nastaliq Urdu', serif; line-height: 1.6;">آپ نے سب سے سستا برانڈ منتخب کیا ہے۔</p>
                    <p style="font-size: 0.9rem; color: #555; margin-top: 10px; font-family: 'Noto Nastaliq Urdu', serif;">بہترین انتخاب! کوئی دوسرا برانڈ اس سے کم قیمت پیش نہیں کرتا۔</p>
                </div>
            `;
        }
    }
}

function switchToBrand(pId, brandName) {
    const brandGrid = document.getElementById(`brands_${pId}`);
    const targetBtn = Array.from(brandGrid.querySelectorAll('.var-btn')).find(b => b.innerText.includes(brandName));
    if (targetBtn) {
        selectVariation(pId, 'brand', brandName, targetBtn);
    }
}

// 4. Cart & Checkout (Simplified)
function updateQty(pId, delta) {
    const input = document.getElementById(`qty_${pId}`);
    const productName = pId.replace(/_/g, ' ');
    const state = window[`state_${pId}`];
    const currentVar = globalProducts[productName].variations.find(v =>
        v.size === state.size && v.brand === state.brand && v.gsm === state.gsm
    );

    let val = (parseInt(input.value) || 1) + delta;

    // Check limits
    if (val < 1) val = 1;
    if (currentVar && val > currentVar.maxLimit) {
        val = currentVar.maxLimit;
    }

    input.value = val;
    updateCardUI(pId);
}

function addToCart(pId) {
    const state = window[`state_${pId}`];
    const productName = pId.replace(/_/g, ' ');
    const currentVar = globalProducts[productName].variations.find(v =>
        v.size === state.size && v.brand === state.brand && v.gsm === state.gsm
    );

    const qty = parseInt(document.getElementById(`qty_${pId}`).value);
    const cartKey = `${currentVar.id}_${currentVar.brand}`;

    if (cart[cartKey]) {
        cart[cartKey].qty += qty;
    } else {
        cart[cartKey] = {
            ...currentVar,
            qty: qty
        };
    }

    updateCartBadge();
    showFeedback(pId);
    renderCart();
}

function showFeedback(pId) {
    const btn = document.querySelector(`.add-btn`); // Simplified for demo
    const originalText = "Add to Order";
    // We'd ideally target the specific card's button
}

// --- CART DISPLAY & LOGIC (KIOSK STYLE) ---
function toggleCart() {
    const cartEl = document.getElementById('cart-container');
    cartEl.classList.toggle('active');

    // Prevent body scroll when cart is open
    document.body.style.overflow = cartEl.classList.contains('active') ? 'hidden' : 'auto';
}

function closeCart() {
    document.getElementById('cart-container').classList.remove('active');
    document.body.style.overflow = 'auto';
}

function renderCart() {
    const container = document.getElementById("cart-items");
    container.innerHTML = "";

    const cartKeys = Object.keys(cart);
    if (cartKeys.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 100px 20px; color: #6a6a6a;">
                <p style="font-size: 5rem; margin-bottom: 20px;">🛒</p>
                <p style="font-size: 1.5rem;">Your cart is empty</p>
            </div>
        `;
        document.getElementById("cart-total").innerText = "Rs 0 (0 KG)";
        return;
    }

    let grandTotal = 0;
    let totalWeight = 0;
    cartKeys.forEach(k => {
        const item = cart[k];
        const itemTotal = item.price * item.qty;
        const itemWeight = (item.weight || 0) * item.qty;
        grandTotal += itemTotal;
        totalWeight += itemWeight;

        container.innerHTML += `
            <div class="cart-item" style="position: relative; padding: 15px 0; min-height: 130px; border-bottom: 1px solid #f0f0f0;">
                <div class="cart-item-details" style="width: 50%;">
                    <h4 style="margin: 0 0 5px 0; font-size: 1.2rem;">${item.name}</h4>
                    <div class="specs" style="margin-bottom: 5px; font-size: 0.85rem;">${item.size}, ${item.gsm} GSM, <strong>${item.brand}</strong></div>
                    <div class="price-calc" style="font-size: 1rem; margin-bottom: 2px;">
                        Rs ${item.price} &times; ${item.qty} = Rs ${itemTotal}
                    </div>
                    <div class="weight-info" style="font-size: 0.85rem; margin-bottom: 10px;">
                        ${Math.round(itemWeight)} KG @ Rs ${item.rate}/KG
                    </div>
                    <div class="cart-qty-controls" style="margin-top: 5px;">
                        <button class="qty-btn" style="width:35px; height:35px;" onclick="changeCartQty('${k}', -1)">-</button>
                        <span style="font-size:1.2rem; font-weight:800; min-width:30px; text-align:center;">${item.qty}</span>
                        <button class="qty-btn" style="width:35px; height:35px;" onclick="changeCartQty('${k}', 1)">+</button>
                    </div>
                </div>

                <!-- Perfectly Top-Aligned Image Box -->
                <div class="cart-item-img-center" style="position: absolute; top: 15px; left: 60%; transform: translateX(-50%); display: flex; justify-content: center;">
                    <img src="${item.image}" style="height: 120px; width: auto; max-width: 150px; border-radius: 8px; border: 1px solid #e0e0e0; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                </div>

                <!-- Remove button in top-right -->
                <button class="cart-item-remove" style="position: absolute; top: 15px; right: 0;" onclick="removeFromCart('${k}')">Remove</button>
            </div>
        `;
    });

    document.getElementById("cart-total").innerText = `Rs ${grandTotal.toLocaleString()} (${Math.round(totalWeight)} KG)`;
}

function changeCartQty(cartKey, delta) {
    if (!cart[cartKey]) return;

    let newQty = cart[cartKey].qty + delta;

    // Check min limit
    if (newQty < 1) {
        removeFromCart(cartKey);
        return;
    }

    // Check max limit
    if (newQty > cart[cartKey].maxLimit) {
        alert(`Maximum allowed quantity for this item is ${cart[cartKey].maxLimit}`);
        newQty = cart[cartKey].maxLimit;
    }

    cart[cartKey].qty = newQty;
    renderCart();
    updateCartBadge();
    saveCart();
}

function removeFromCart(cartKey) {
    delete cart[cartKey];
    renderCart();
    updateCartBadge();
    saveCart();
}

function saveCart() {
    localStorage.setItem('hayyat_a4_cart', JSON.stringify(cart));
}

function updateCartBadge() {
    const totalItems = Object.values(cart).reduce((sum, item) => sum + item.qty, 0);
    const badge = document.getElementById("cart-count-badge");
    if (badge) {
        badge.textContent = totalItems;
        badge.style.display = totalItems > 0 ? "flex" : "none";
    }
}
// --- CHECKOUT LOGIC (SYNCED WITH ORIGINAL KIOSK) ---
let currentShippingMethod = 'self';

window.openCheckout = function () {
    if (Object.keys(cart).length === 0) return alert("Your cart is empty");

    // Close cart overlay
    closeCart();

    // Open checkout modal (kiosk-modal uses display flex)
    const modal = document.getElementById('checkout-modal');
    modal.style.display = 'flex';

    // Reset inputs
    document.getElementById('cust-name').value = '';
    document.getElementById('cust-phone').value = '';
    document.getElementById('cust-email').value = '';
    document.getElementById('delivery-address').value = '';

    // Default to self pickup
    updateShipping('self');
};

window.closeCheckout = function () {
    document.getElementById('checkout-modal').style.display = 'none';
};

window.updateShipping = function (method) {
    currentShippingMethod = method;
    const addressContainer = document.getElementById('delivery-address-container');

    // Update active class on buttons
    document.querySelectorAll('.shipping-option-btn').forEach(btn => {
        btn.classList.remove('active');
        const input = btn.querySelector('input');
        if (input && input.value === method) {
            btn.classList.add('active');
            input.checked = true;
        }
    });

    if (method === 'open' || method === 'bundle') {
        addressContainer.style.display = 'block';
        calculateDeliveryCharges(method);
    } else {
        addressContainer.style.display = 'none';
        updateCheckoutTotal(0);
    }
};

function calculateDeliveryCharges(method) {
    let totalWeight = 0;
    Object.values(cart).forEach(item => {
        totalWeight += (Number(item.weight) * Number(item.qty));
    });

    let deliveryCharges = 0;
    if (method === 'open') {
        deliveryCharges = (totalWeight <= 150) ? 350 : Math.round(totalWeight * 3.5);
    } else if (method === 'bundle') {
        let bundles = Math.ceil(totalWeight / 70) || 1;
        deliveryCharges = bundles * 250;
    }

    updateCheckoutTotal(deliveryCharges);
}

function updateCheckoutTotal(deliveryFee) {
    let itemsTotal = 0;
    let totalWeight = 0;
    let itemCount = 0;
    let itemsHtml = '';

    Object.values(cart).forEach(item => {
        const itemTotal = item.price * item.qty;
        itemsTotal += itemTotal;
        totalWeight += (item.weight * item.qty);
        itemCount++;

        itemsHtml += `
            <div class="check-item">
                <strong>${item.name}</strong> (${item.size} | ${item.gsm} GSM${item.brand ? ` | ${item.brand}` : ''})<br>
                ${item.qty}x Rs ${item.price} = Rs ${itemTotal}
            </div>
        `;
    });

    const subTotalLabelEl = document.getElementById('check-subtotal-label');
    const subTotalEl = document.getElementById('check-subtotal');
    const shipTotalEl = document.getElementById('check-shipping');
    const weightEl = document.getElementById('check-weight');
    const totalEl = document.getElementById('check-total');
    const itemsListEl = document.getElementById('check-items-list');

    if (subTotalLabelEl) subTotalLabelEl.innerText = `Subtotal (${itemCount} items)`;
    if (subTotalEl) subTotalEl.innerText = `Rs ${itemsTotal}`;
    if (shipTotalEl) shipTotalEl.innerText = deliveryFee === 0 ? 'FREE' : `Rs ${deliveryFee}`;
    if (weightEl) weightEl.innerText = `${Math.round(totalWeight)} KG`;
    if (totalEl) totalEl.innerText = `Rs ${itemsTotal + deliveryFee}`;
    if (itemsListEl) itemsListEl.innerHTML = itemsHtml;
}

function selectPaymentMethod(method) {
    const shopRadio = document.getElementById('pay-shop');
    const bankRadio = document.getElementById('pay-bank');
    const shopLabel = document.getElementById('label-shop');
    const bankLabel = document.getElementById('label-bank');

    if (method === 'shop') {
        if (shopRadio) shopRadio.checked = true;
        if (shopLabel) shopLabel.classList.add('active');
        if (bankLabel) bankLabel.classList.remove('active');
    } else {
        if (bankRadio) bankRadio.checked = true;
        if (bankLabel) bankLabel.classList.add('active');
        if (shopLabel) shopLabel.classList.remove('active');
    }
}



window.placeOrder = async function () {
    const name = document.getElementById('cust-name').value.trim();
    const phone = document.getElementById('cust-phone').value.trim();
    const address = document.getElementById('delivery-address').value.trim();
    const email = document.getElementById('cust-email').value.trim();

    if (!name || !phone) {
        alert("Please fill in Name and Phone Number.");
        return;
    }

    if ((currentShippingMethod === 'open' || currentShippingMethod === 'bundle') && !address) {
        alert("Please provide a delivery address.");
        return;
    }

    const btn = document.querySelector('.kiosk-place-order-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = "⏳ Saving Order...";
    btn.disabled = true;

    const orderId = `HAYYAT-A4-${Date.now()}`;
    const payment = document.querySelector('input[name="payment"]:checked').value;
    const shipping = currentShippingMethod;

    // Calculate final numbers
    let subtotal = 0;
    let totalWeight = 0;
    Object.values(cart).forEach(i => {
        subtotal += (i.price * i.qty);
        totalWeight += ((i.weight || 0) * i.qty);
    });

    let deliveryCharges = 0;
    if (shipping === 'open') {
        deliveryCharges = (totalWeight <= 150) ? 350 : Math.round(totalWeight * 3.5);
    } else if (shipping === 'bundle') {
        deliveryCharges = (Math.ceil(totalWeight / 70) || 1) * 250;
    }

    const totalCalculated = subtotal + deliveryCharges;

    // 1. Generate Invoice Link
    const invoiceLink = `https://www.hayyatstore.com/order.html?id=${orderId}`;

    const orderItems = Object.values(cart).map(i => ({
        name: i.name,
        specs: `${i.size} | ${i.gsm} GSM | ${i.brand}`,
        qty: i.qty,
        price: i.price,
        rate: i.rate,
        weight: i.weight,
        total: i.price * i.qty
    }));

    const orderData = {
        orderId,
        invoiceLink,
        customerName: name,
        customerPhone: phone,
        customerEmail: email,
        shippingMethod: shipping,
        paymentMethod: payment,
        deliveryAddress: address,
        orderItems,
        totalAmount: totalCalculated,
        subtotal: subtotal,
        deliveryCharges: deliveryCharges,
        totalWeight: Math.round(totalWeight)
    };

    try {
        // 2. Send to Google Sheet (with invoiceLink)
        const scriptUrl = 'https://script.google.com/macros/s/AKfycbysHbzMzacuCiZp16PJO5Gnx8kN2asM2Te4yDavvSdXRUN2jfUwRvc-LCjRvKPGXbsG/exec';
        await fetch(scriptUrl, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({ action: 'createOrder', order: orderData })
        });

        // 3. Trigger WhatsApp (Via MacroDroid) — includes invoice link
        const macroDroidUrl = 'https://trigger.macrodroid.com/5f8b53ed-bdb1-4979-8f48-81059ecfd195/order';
        const msg = `✅ *A4 Kiosk Order Received*\n-------------------------\nCustomer: ${name}\nOrder Link: ${invoiceLink}\n\nOrder Id: ${orderId}\n💰 *Please show this message at the counter to proceed.*`;
        const waUrl = `${macroDroidUrl}?phone=92${phone.startsWith('0') ? phone.substring(1) : phone}&msg=${encodeURIComponent(msg)}`;
        fetch(waUrl, { mode: 'no-cors' });

        // 4. Email Webhook (Structured ERP Format — same as kiosk.js)
        const nowTime = new Date();
        const formattedDate = `${String(nowTime.getDate()).padStart(2, '0')}/${String(nowTime.getMonth() + 1).padStart(2, '0')}/${nowTime.getFullYear()} ${String(nowTime.getHours()).padStart(2, '0')}:${String(nowTime.getMinutes()).padStart(2, '0')}`;

        let orderSummary = "ORDER_DATA_START\n";
        orderSummary += "---CUSTOMER_INFO---\n";
        orderSummary += `Name: ${name}\n`;
        orderSummary += `Phone: ${phone || "Not provided"}\n`;
        orderSummary += `OrderTime: ${formattedDate}\n\n`;
        orderSummary += "---ORDER_MASTER---\n";
        orderSummary += "OrderNo: SQ-AUTO\n";
        orderSummary += "Location: mansion\n";
        orderSummary += `OrderID: ${orderId}\n`;
        if (shipping === "open" || shipping === "bundle") {
            orderSummary += `DeliveryAddress: ${address || 'Not provided'}\n`;
            orderSummary += `DeliveryCharges: ${deliveryCharges || 0}\n`;
        }
        orderSummary += "\n";
        orderSummary += "---ORDER_ITEMS---\n";

        Object.values(cart).forEach((i, index) => {
            const itemTotal = i.price * i.qty;
            const itemWeight = (i.weight || 0) * i.qty;
            const stockAfter = (i.stock || 0) - i.qty;
            const packingId = i.packingType || "Weight";
            const itemRate = (packingId === "Quantity") ? i.price : i.rate;

            orderSummary += `[ITEM_${index + 1}]\n`;
            orderSummary += `ProductExp: ${i.erpCode || ''}\n`;
            orderSummary += `ProdDesc: ${i.erpDesc || ''}\n`;
            orderSummary += `PackingID: ${packingId}\n`;
            orderSummary += `Qty: ${i.qty}\n`;
            orderSummary += `ItemWeight: ${itemWeight.toFixed(2)}\n`;
            orderSummary += `ItemRate: ${itemRate}\n`;
            orderSummary += `ItemSubtotal: ${itemTotal}\n`;
            orderSummary += `ValueRs: ${i.sheets || ''}\n`;
            orderSummary += `StockAfter: ${stockAfter}\n`;
            orderSummary += `[ITEM_END]\n\n`;
        });
        orderSummary += "ORDER_DATA_END";

        const emailData = {
            customerName: name,
            customerPhone: phone || 'Not provided',
            customerEmail: email || 'Not provided',
            shippingMethod: shipping === "self" ? "Self Pickup" : (shipping === "open" ? "Delivery - Open" : "Delivery - Bundle"),
            paymentMethod: payment === "bank" ? "Bank Transfer" : "Pay at Shop",
            deliveryAddress: address || 'Not applicable',
            orderSummary: orderSummary,
            orderTotal: totalCalculated,
            orderWeight: Math.round(totalWeight)
        };

        await fetch('https://script.google.com/macros/s/AKfycbzqQWaupJvBJiFdbIJfhWaYoJYqqqGdLf4402bBRzyvdKGdM-gD1N3u9gQ7s8bDvSvG/exec', {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify(emailData)
        });

        // 5. Prepare Receipt & Show Success
        prepareReceipt(name, phone, orderId, shipping, payment, address, subtotal, deliveryCharges);

        document.getElementById('checkout-modal').style.display = 'none';
        const sm = document.getElementById('success-modal');
        if (sm) { sm.style.display = 'flex'; document.getElementById('success-order-id').innerText = orderId; }

        // Clear cart
        cart = {};
        saveCart();

        // 6. Print
        setTimeout(() => {
            if (typeof fully !== 'undefined') fully.print();
            else window.print();
        }, 1000);

    } catch (e) {
        console.error("Order failed", e);
        alert("Order failed. Please try again.");
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

function prepareReceipt(n, p, id, shippingMethod, paymentMethod, address, subtotal, deliveryFee) {
    document.getElementById('print-name').innerText = n;
    document.getElementById('print-phone').innerText = p || 'N/A';
    document.getElementById('print-order-id').innerText = id;

    const _now = new Date();
    const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const _dateStr = `${String(_now.getDate()).padStart(2, '0')}-${_months[_now.getMonth()]}-${_now.getFullYear()}`;
    const dateEl = document.getElementById('print-date');
    if (dateEl) dateEl.innerText = _dateStr;

    const shippingMap = { 'self': 'Self Pickup', 'open': 'Delivery - Open', 'bundle': 'Delivery - Bundle' };
    const paymentMap = { 'shop': 'Pay at Shop', 'bank': 'Bank Transfer' };

    const shipEl = document.getElementById('print-shipping');
    if (shipEl) shipEl.innerText = shippingMap[shippingMethod] || shippingMethod || 'N/A';

    const payEl = document.getElementById('print-payment');
    if (payEl) payEl.innerText = paymentMap[paymentMethod] || paymentMethod || 'N/A';

    const addressRow = document.getElementById('print-address-row');
    const addressEl = document.getElementById('print-address');
    if ((shippingMethod === 'open' || shippingMethod === 'bundle') && address && address.trim() !== "") {
        if (addressRow) addressRow.style.display = 'block';
        if (addressEl) addressEl.innerText = address;
    } else {
        if (addressRow) addressRow.style.display = 'none';
    }

    const body = document.getElementById('print-items-body');
    if (body) {
        body.innerHTML = Object.values(cart).map(i => {
            const specs = [];
            if (i.size) specs.push(i.size);
            if (i.gsm) specs.push(`${i.gsm} GSM`);
            if (i.brand) specs.push(i.brand);
            const specStr = specs.length > 0 ? `<div style="font-size:11px; font-weight:700; color:#000; margin-top:2px;">${specs.join(' | ')}</div>` : '';
            return `<tr>
                <td style="padding-top:8px; padding-bottom:8px;"><strong>${i.name}</strong>${specStr}</td>
                <td style="text-align:center;">${i.qty}</td>
                <td style="text-align:center;">${i.price}</td>
                <td style="text-align:center;">${i.rate || '-'}</td>
                <td style="text-align:right;"><strong>${i.price * i.qty}</strong></td>
            </tr>`;
        }).join('');
    }

    const subEl = document.getElementById('print-subtotal');
    if (subEl) subEl.innerText = `Rs ${subtotal}`;

    const delRow = document.getElementById('print-delivery-row');
    const delVal = document.getElementById('print-delivery-charges');
    if (deliveryFee > 0) {
        if (delRow) delRow.style.display = 'flex';
        if (delVal) delVal.innerText = `Rs ${deliveryFee}`;
    } else {
        if (delRow) delRow.style.display = 'none';
    }

    const totalEl = document.getElementById('print-total-amount');
    if (totalEl) totalEl.innerText = `Rs ${subtotal + deliveryFee}`;
}


