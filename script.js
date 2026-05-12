window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }
gtag('js', new Date());

gtag('config', 'G-H2V1WJFV61');



window.OneSignalDeferred = window.OneSignalDeferred || [];
OneSignalDeferred.push(async function (OneSignal) {
    await OneSignal.init({
        appId: "5e33c1f3-d93e-4ed4-9e14-71337dc91bba",
    });
});



// Configuration
const APP_VERSION = "2026.05.12.02"; // Added GA4 Ecommerce Event Tracking
const SPREADSHEET_ID = "1-KuOU3Kj4Yo6afuGN5qENwAlGvGUORQSz8qfcNCqv18"
const API_KEY = "AIzaSyA05kFZ9ejXco6wpLFfV8WUVaUBbjnhhVI"
const SHEET_NAME = "Sheet1"
const CUSTOM_SHEET_NAME = "Custom_Rolls"

let customRollData = {}; // Stores roll info by Category -> Brand -> GSM
let selectedCustomCategory = null;
let selectedCustomBrand = null;
let selectedCustomRoll = null;

const COL = {
    ID: 0, AVAILABILITY: 1, CATEGORY: 2, NAME: 3,
    LENGTH: 6, WIDTH: 7, GSM: 8, SHEETS: 9,
    RATE: 10, WEIGHT: 11, PRICE: 12, MAX: 13, IMAGE: 14,
    HAS_COLORS: 15,        // NEW: Column P (index 15)
    COLOR_OPTIONS: 16,
    DISPLAY_SIZE: 17,      // Column R
    DISCOUNT_TAG: 18,      // ADD THIS - Column S
    NEW_TAG: 19,            // This is Column T (index 19)
    HALF_QTY: 20,
    EVEN_ONLY: 21,
    MULTIPLE_1_5: 22,
    STOCK: 5,               // Column F
    MIN_STOCK: 24,           // Column Y
    ERP_CODE: 27,            // Column AB
    ERP_DESC: 28,            // Column AC
    PACKING_TYPE: 29         // Column AD
}


// Function to get display size based on category
function getDisplaySize(category, actualSize) {
    // Only apply labels to specific categories
    if (LABEL_CATEGORIES.includes(category)) {
        // Return the label if it exists, otherwise keep actual size
        return SIZE_LABELS[actualSize] || actualSize;
    }
    // For all other categories, show actual size
    return actualSize;
}
// ===== END SIZE LABEL SYSTEM =====

// Sample fallback data
const SAMPLE_PRODUCTS = {
    "Premium Papers": {
        category: "Premium Papers",
        items: [
            {
                id: "sample-1",
                name: "Art Paper Glossy",
                size: "23x36",
                gsm: "120",
                sheets: "100",
                weight: 8.5,
                price: 850,
                rate: "100",
                image: "https://via.placeholder.com/300x200/004c99/ffffff?text=Art+Paper",
                maxQty: 50,
                category: "Premium Papers"
            },
            {
                id: "sample-2",
                name: "Art Paper Matt",
                size: "23x36",
                gsm: "150",
                sheets: "100",
                weight: 10.5,
                price: 1050,
                rate: "100",
                image: "https://via.placeholder.com/300x200/28a745/ffffff?text=Matt+Paper",
                maxQty: 50,
                category: "Premium Papers"
            },
            {
                id: "sample-3",
                name: "Offset Paper",
                size: "25x36",
                gsm: "80",
                sheets: "500",
                weight: 36,
                price: 1800,
                rate: "50",
                image: "https://via.placeholder.com/300x200/6c757d/ffffff?text=Offset+Paper",
                maxQty: 100,
                category: "Premium Papers"
            }
        ]
    },
    "Specialty Papers": {
        category: "Specialty Papers",
        items: [
            {
                id: "sample-4",
                name: "Bond Paper",
                size: "22x34",
                gsm: "90",
                sheets: "500",
                weight: 33.5,
                price: 1675,
                rate: "50",
                image: "https://via.placeholder.com/300x200/dc3545/ffffff?text=Bond+Paper",
                maxQty: 75,
                category: "Specialty Papers"
            }
        ]
    }
};

let cart = {};
let globalProducts = {};
let lunrIndex = null;
let currentShippingMethod = 'self';
let usingFallbackData = false;

// --- CART PERSISTENCE ---
function saveCart() {
    localStorage.setItem('hayyat_cart', JSON.stringify(cart));
}

function loadCart() {
    try {
        const saved = localStorage.getItem('hayyat_cart');
        if (saved) {
            cart = JSON.parse(saved);
            renderCart();
            updateCartBadge();
        }
    } catch (e) { console.warn("Cart load failed", e); }
}

/**
 * Auto-Update on Page Load
 * Compares saved cart items with fresh Google Sheets data.
 * Matches by name + size + GSM + brand + color (NOT by item.id)
 * to avoid wrong-price bugs when Sheet rows are reordered or IDs are missing/duplicated.
 */
function revalidateCart() {
    if (!cart || Object.keys(cart).length === 0) return { count: 0, keys: [] };
    if (!window.lunrStore) return { count: 0, keys: [] };

    // Build a lookup list from all fresh products in the store
    const freshProducts = Object.values(window.lunrStore);

    let changed = false;
    let changeCount = 0;
    let changedKeys = [];

    Object.keys(cart).forEach(key => {
        const item = cart[key];

        // --- SAFE MATCH: name + size + GSM + brand + color ---
        const itemName = (item.name || '').trim().toLowerCase();
        const itemSize = (item.size || '').trim().toLowerCase();
        const itemGsm = String(item.gsm || '').trim().toLowerCase();
        const itemBrand = (item.selectedBrand || item.displaySize || '').trim().toLowerCase();
        const itemColor = (item.selectedColor || item.color || '').trim().toLowerCase();

        const fresh = freshProducts.find(fp => {
            const nameMatch = (fp.name || '').trim().toLowerCase() === itemName;
            const sizeMatch = (fp.size || '').trim().toLowerCase() === itemSize;
            const gsmMatch = String(fp.gsm || '').trim().toLowerCase() === itemGsm;

            if (!nameMatch || !sizeMatch || !gsmMatch) return false;

            // Brand match: only enforce if cart item has a brand selected
            const fpBrand = (fp.displaySize || '').trim().toLowerCase();
            if (itemBrand && fpBrand && fpBrand !== itemBrand) return false;

            // Color match: check if the selected color exists in this row's options
            const fpColorOptions = (fp.colorOptions || []).map(c => c.trim().toLowerCase());
            if (itemColor && fpColorOptions.length > 0 && !fpColorOptions.includes(itemColor)) return false;

            return true;
        });

        if (!fresh) {
            console.warn(`revalidateCart: no fresh match found for cart item "${item.name}" (${item.size}, ${item.gsm} GSM). Skipping price update.`);
            return; // Skip — don't touch this item's price
        }

        const freshPrice = Math.round(parseFloat(fresh.price || 0));
        const freshRate = fresh.rate || item.rate;
        const freshMaxQty = fresh.maxQty || 999;

        let priceChanged = item.price !== freshPrice || item.rate !== freshRate;
        let qtyReduced = false;

        if (priceChanged) {
            item.price = freshPrice;
            item.rate = freshRate;
        }

        // --- ERP SYNC (FIX FOR EMPTY FIELDS IN EMAILS) ---
        item.erpCode = fresh.erpCode || '';
        item.erpDesc = fresh.erpDesc || '';
        item.packingType = fresh.packingType || 'Weight';
        item.sheets = fresh.sheets || ''; // Added for ValueRs

        if (item.qty > freshMaxQty) {
            item.qty = freshMaxQty;
            qtyReduced = true;
        }

        if (priceChanged || qtyReduced) {
            changed = true;
            changeCount++;
            changedKeys.push(key);
        }
    });

    if (changed) {
        saveCart();
        renderCart(changedKeys);
        showCartUpdateBanner(changeCount);
    }
    return { count: changeCount, keys: changedKeys };
}

function showCartUpdateBanner(count) {
    let banner = document.getElementById('price-change-banner');

    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'price-change-banner';
        banner.innerHTML = `
                    <div class="price-banner-content">
                        <span class="price-banner-icon">&#x1F6D2;</span>
                        <div class="price-banner-text">
                            <strong id="price-banner-title"></strong>
                            <small id="price-banner-body"></small>
                            <small id="price-banner-urdu"></small>
                        </div>
                    </div>
                    <button class="price-banner-close" onclick="closePriceBanner()" title="Dismiss">&#10005;</button>
                `;
        document.body.prepend(banner);
    }

    document.getElementById('price-banner-title').innerHTML = `Cart Items Updated`;
    document.getElementById('price-banner-body').innerHTML =
        `${count} item(s) in your cart have been updated due to price or stock changes.`;

    // Urdu line (RTL)
    document.getElementById('price-banner-urdu').innerHTML =
        `<span dir="rtl" style="display:block;text-align:right;font-family:'Noto Nastaliq Urdu','Jameel Noori Nastaleeq',serif;font-size:1em;font-weight:700;line-height:1.7;margin-top:5px;border-top:1px solid rgba(255,255,255,0.25);padding-top:4px;">`
        + `آپ کے کارٹ میں موجود اشیاء کی قیمتیں تازہ ترین ریٹ کے مطابق تبدیل کر دی گئی ہیں۔`
        + `</span>`;

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            banner.classList.add('visible');
        });
    });

    clearTimeout(window._priceBannerTimer);
    window._priceBannerTimer = setTimeout(closePriceBanner, 10000);
}

// --- VERSION CONTROL ---
function checkAppVersion(liveVersion) {
    if (!liveVersion) return;
    const cleanLiveVersion = String(liveVersion).trim();

    console.log(`Version Check: [Local: ${APP_VERSION}] [Sheet: ${cleanLiveVersion}]`);

    if (cleanLiveVersion && cleanLiveVersion !== APP_VERSION) {
        // LOOP GUARD: Check if we just reloaded in the last 10 seconds
        const lastReload = sessionStorage.getItem('last_version_reload');
        const now = Date.now();

        if (lastReload && (now - lastReload < 10000)) {
            console.warn("Version mismatch detected, but stopping loop as we just reloaded.");
            return false;
        }

        console.info(`Version Mismatch! Redirecting to new version...`);
        sessionStorage.setItem('last_version_reload', now);

        const loading = document.getElementById('loading-indicator');
        if (loading) {
            loading.style.display = 'block';
            loading.querySelector('p').innerText = "Updating Webstore to Latest Version...";
        }
        saveCart();
        setTimeout(() => location.reload(true), 800);
        return true;
    }
    return false;
}

// Payment method handling
function setupPaymentListeners() {
    const shopBtn = document.querySelector('label[for="pay-shop"]');
    const bankBtn = document.querySelector('label[for="pay-bank"]');
    const shopRadio = document.getElementById('pay-shop');
    const bankRadio = document.getElementById('pay-bank');

    // Click on labels
    if (shopBtn) {
        shopBtn.addEventListener('click', function () {
            shopRadio.checked = true;
            updatePaymentButtons();
        });
    }

    if (bankBtn) {
        bankBtn.addEventListener('click', function () {
            bankRadio.checked = true;
            updatePaymentButtons();
        });
    }

    // Also listen to radio button changes directly
    if (shopRadio) {
        shopRadio.addEventListener('change', updatePaymentButtons);
    }

    if (bankRadio) {
        bankRadio.addEventListener('change', updatePaymentButtons);
    }

    // Initial update
    updatePaymentButtons();
}

// Initialize on load
document.addEventListener('DOMContentLoaded', function () {
    loadCart(); // Load persisted cart items
    fetchProducts();
    fetchCustomRolls(); // Load custom roll options
    setupShippingListeners();
    setupPaymentListeners();
    // handleInitialHash moved to fetchProducts to ensure data is ready

    // Close cart when clicking outside on mobile
    document.addEventListener('click', function (event) {
        const cartContainer = document.getElementById('cart-container');
        const cartBtn = document.getElementById('view-cart-btn');

        // BUG FIX: If the clicked element has been removed from the DOM (e.g. by
        // renderCart() replacing innerHTML when a qty +/- button is pressed),
        // document.contains() returns false for that detached node. Without this
        // guard the cart would wrongly close after every qty button click.
        if (!document.contains(event.target)) return;

        if (cartContainer.classList.contains('active') &&
            !cartContainer.contains(event.target) &&
            event.target !== cartBtn &&
            !cartBtn.contains(event.target)) {
            closeCart();
        }
    });
});

function setupShippingListeners() {
    // Radio button change listeners
    const selfRadio = document.getElementById('shipping-self');
    const openRadio = document.getElementById('shipping-delivery-open');
    const bundleRadio = document.getElementById('shipping-delivery-bundle');

    if (selfRadio) {
        selfRadio.addEventListener('change', function () {
            if (this.checked) {
                updateShipping('self');
            }
        });
    }

    if (openRadio) {
        openRadio.addEventListener('change', function () {
            if (this.checked) {
                updateShipping('open');
            }
        });
    }

    if (bundleRadio) {
        bundleRadio.addEventListener('change', function () {
            if (this.checked) {
                updateShipping('bundle');
            }
        });
    }

    // Label click listeners
    const selfLabel = document.querySelector('label[for="shipping-self"]');
    const openLabel = document.querySelector('label[for="shipping-delivery-open"]');
    const bundleLabel = document.querySelector('label[for="shipping-delivery-bundle"]');

    if (selfLabel) {
        selfLabel.addEventListener('click', function () {
            document.getElementById('shipping-self').checked = true;
            updateShipping('self');
        });
    }

    if (openLabel) {
        openLabel.addEventListener('click', function () {
            document.getElementById('shipping-delivery-open').checked = true;
            updateShipping('open');
        });
    }

    if (bundleLabel) {
        bundleLabel.addEventListener('click', function () {
            document.getElementById('shipping-delivery-bundle').checked = true;
            updateShipping('bundle');
        });
    }
}
async function fetchProducts(options = {}) {
    const isQuiet = options.quiet === true;
    try {
        // Show loading indicator
        if (!isQuiet) document.getElementById('loading-indicator').style.display = 'block';

        // Try to fetch from Google Sheets (A1:AD to include version cell X2, ERP columns and Packing Type)
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}!A1:AD?key=${API_KEY}`;
        console.log('Fetching from URL:', url);

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('API Response:', data);

        if (!data.values || data.values.length === 0) {
            throw new Error('No data found in spreadsheet');
        }

        // Check for forced refresh (Option 1)
        // We assume Row 2, Column X (index 23) contains the version code
        const versionRow = data.values[1];
        const liveVersion = versionRow ? versionRow[23] : null;
        if (checkAppVersion(liveVersion)) return; // Stop execution, page will reload

        const rows = data.values.slice(1); // Skip header row
        const groupedProducts = group(rows.filter(r => r[COL.AVAILABILITY]?.toUpperCase() === "YES"));

        if (Object.keys(groupedProducts).length === 0) {
            throw new Error('No available products found');
        }

        globalProducts = groupedProducts;
        buildLunrIndex(groupedProducts);
        const validation = revalidateCart(); // Sync saved cart with fresh prices

        if (isQuiet) return validation; // Return results for background updates

        renderProducts(groupedProducts);

        // Hide loading, show products
        document.getElementById('loading-indicator').style.display = 'none';
        document.getElementById('product-list').style.display = 'grid';
        document.getElementById('view-cart-btn').style.display = 'flex';
        // ADD THIS LINE:
        fetchAnnouncements();  // Load announcements
        generateDynamicSchema(groupedProducts); // NEW: Tell Google about these dynamic categories
        handleInitialHash(); // NEW: Now open the category if the link has a #hash

    } catch (error) {
        console.error('Error fetching products:', error);

        // Use fallback data
        console.log('Using fallback data...');
        usingFallbackData = true;

        globalProducts = SAMPLE_PRODUCTS;
        buildLunrIndex(SAMPLE_PRODUCTS);
        renderProducts(SAMPLE_PRODUCTS);

        // Show fallback notice
        document.getElementById('fallback-notice').style.display = 'block';

        // Hide loading, show products
        document.getElementById('loading-indicator').style.display = 'none';
        document.getElementById('product-list').style.display = 'grid';
        document.getElementById('view-cart-btn').style.display = 'flex';
    }
}

async function fetchAnnouncements() {
    try {
        const SHEET_NAME = "Announcement";
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}!A2:C?key=${API_KEY}`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error('Failed to fetch announcements');
        }

        const data = await response.json();

        if (!data.values || data.values.length === 0) {
            console.log('No announcements found');
            document.querySelector('.announcement-container').style.display = 'none';
            return;
        }

        const announcements = [];

        data.values.forEach(row => {
            if (row.length >= 3) {
                const text = row[0] || '';
                const active = (row[1] || '').toLowerCase().trim();
                const priority = parseInt(row[2]) || 999;

                if (text && active === 'active') {
                    announcements.push({
                        text: text,
                        priority: priority
                    });
                }
            }
        });

        if (announcements.length === 0) {
            document.querySelector('.announcement-container').style.display = 'none';
            return;
        }

        // Sort by priority
        announcements.sort((a, b) => a.priority - b.priority);

        displayAnnouncements(announcements);

    } catch (error) {
        console.error('Error fetching announcements:', error);
        document.querySelector('.announcement-container').style.display = 'none';
    }
}

function displayAnnouncements(announcements) {
    const track = document.getElementById('announcement-track');
    if (!track) return;

    track.innerHTML = '';

    // Create announcement items
    announcements.forEach((ann, index) => {
        const item = document.createElement('div');
        item.className = 'announcement-item';
        item.textContent = ann.text;
        track.appendChild(item);

        // Add separator between announcements
        if (index < announcements.length - 1) {
            const separator = document.createElement('span');
            separator.className = 'announcement-separator';
            separator.innerHTML = '✦';
            track.appendChild(separator);
        }
    });

    // Create seamless loop by duplicating content within same track
    const originalContent = track.innerHTML;
    track.innerHTML = originalContent + ' ' + originalContent;

    // Calculate scroll speed based on content length (longer content = slower)
    const contentWidth = track.scrollWidth / 2; // Divide by 2 because we duplicated
    const baseSpeed = 40; // Base speed in seconds
    const speedFactor = Math.max(0.5, Math.min(2, contentWidth / 1000)); // Adjust factor
    const finalSpeed = baseSpeed * speedFactor;

    // Apply the speed
    track.style.animationDuration = `${finalSpeed}s`;

    // Show the container
    document.querySelector('.announcement-container').style.display = 'block';
}

function group(rows) {
    console.log("=== DEBUG: First row all columns ===")
    if (rows.length > 0) {
        const firstRow = rows[0]
        for (let i = 0; i < firstRow.length; i++) {
            console.log(`Column ${i}: "${firstRow[i] || '(empty)'}"`)
        }
    }
    const g = {}
    const clearanceItems = []; // Virtual category accumulator

    rows.forEach(r => {
        const cat = r[COL.CATEGORY] || 'Uncategorized'

        // Build the base item object
        const itemObj = {
            id: r[COL.ID] || Math.random().toString(36).substr(2, 9),
            name: r[COL.NAME] || 'Unknown Product',
            size: `${r[COL.LENGTH] || 0}x${r[COL.WIDTH] || 0}`,
            gsm: r[COL.GSM] || 'N/A',
            sheets: r[COL.SHEETS] || 'N/A',
            weight: parseFloat(r[COL.WEIGHT] || 0),
            price: Math.round(parseFloat(r[COL.PRICE] || 0)),
            rate: r[COL.RATE] || 'N/A',
            image: r[COL.IMAGE] || "https://via.placeholder.com/300x200?text=Paper+Image",
            maxQty: parseInt(r[COL.MAX] || 9999),
            category: cat,
            hasColors: (r[COL.HAS_COLORS] || '').toUpperCase() === 'YES',
            colorOptions: (r[COL.HAS_COLORS] || '').toUpperCase() === 'YES' ? (r[COL.COLOR_OPTIONS] || '').split(',').map(c => c.trim()) : [],
            displaySize: r[COL.DISPLAY_SIZE] || '',  // Custom display text from Column R
            showGSM: !["White Sticker", "Stickers"].includes(cat),  // Control GSM display
            isStickerOnly: cat === "Stickers",  // NEW: Flag for stickers category
            discountTag: r[COL.DISCOUNT_TAG] || '',
            newTag: r[COL.NEW_TAG] || '',
            erpCode: r[COL.ERP_CODE] || '',
            erpDesc: r[COL.ERP_DESC] || '',
            packingType: r[COL.PACKING_TYPE] || 'Weight',
            halfQty: (r[COL.HALF_QTY] || '').trim().toUpperCase() === 'YES',
            evenOnly: (r[COL.EVEN_ONLY] || '').trim().toUpperCase() === 'YES',
            multiple15: (r[COL.MULTIPLE_1_5] || '').trim().toUpperCase() === 'YES',
            stock: parseInt(r[COL.STOCK] || 0),
            minStock: parseInt(r[COL.MIN_STOCK] || 0)
        };

        // Calculate dynamic Max Qty based on stock vs reserved limit
        const stockLimit = Math.max(0, itemObj.stock - itemObj.minStock);
        const originalMax = parseInt(r[COL.MAX] || 9999);
        itemObj.stockLimit = stockLimit;
        itemObj.originalMax = originalMax;
        itemObj.maxQty = Math.min(stockLimit, originalMax);

        // 1. Add to original category
        if (!g[cat]) g[cat] = { category: cat, items: [] }
        g[cat].items.push(itemObj);

        // 2. Add to virtual "Clearance Sale" if discount exists
        if (itemObj.discountTag && itemObj.discountTag.trim() !== "") {
            clearanceItems.push({ ...itemObj, category: 'Clearance Sale', originalCategory: cat });
        }
    })

    // If we have clearance items, prepend them to the groups
    if (clearanceItems.length > 0) {
        const finalGroups = {
            "Clearance Sale": { category: "Clearance Sale", items: clearanceItems }
        };
        // Add the rest of the categories
        Object.keys(g).forEach(key => {
            finalGroups[key] = g[key];
        });
        return finalGroups;
    }

    return g
}

function buildLunrIndex(groups) {
    const indexStore = {};
    let productIdCounter = 0;

    lunrIndex = lunr(function () {
        this.ref('ref');
        this.field('name');
        this.field('category');
        this.field('size');
        this.field('gsm');
        this.field('displaySize');

        Object.keys(groups).forEach(cat => {
            const items = groups[cat].items;
            items.forEach(item => {
                const docId = productIdCounter++;
                const doc = {
                    ref: item.id,
                    name: item.name.toLowerCase(),
                    category: cat.toLowerCase(),
                    size: item.size.toLowerCase(),
                    gsm: item.gsm.toLowerCase(),
                    displaySize: (item.displaySize || '').toLowerCase()
                };
                this.add(doc);
                indexStore[item.id] = item;
            });
        });
    });
    window.lunrStore = indexStore;
}

function searchProducts(query) {
    const list = document.getElementById("product-list");
    const searchTerm = query.trim();

    if (!searchTerm) {
        renderProducts(globalProducts);
        return;
    }

    if (!lunrIndex) {
        // Simple search fallback
        const filteredGroups = {};
        Object.keys(globalProducts).forEach(cat => {
            const filteredItems = globalProducts[cat].items.filter(item =>
                item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.size.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.gsm.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (item.displaySize || '').toLowerCase().includes(searchTerm.toLowerCase())
            );

            if (filteredItems.length > 0) {
                filteredGroups[cat] = {
                    category: cat,
                    items: filteredItems
                };
            }
        });

        renderProducts(Object.keys(filteredGroups).length > 0 ? filteredGroups : {});
        return;
    }

    try {
        const results = lunrIndex.search(`${searchTerm}* ${searchTerm}~1`);
        const filteredGroups = {};

        if (results.length === 0) {
            list.innerHTML = `
                <div class="no-results" style="grid-column: 1/-1;">
                    <h3>No products found for "${searchTerm}"</h3>
                    <p>Try different search terms</p>
                </div>
            `;
            return;
        }

        results.forEach(result => {
            const item = window.lunrStore[result.ref];
            if (item) {
                const cat = item.category;
                if (!filteredGroups[cat]) filteredGroups[cat] = { category: cat, items: [] };
                if (!filteredGroups[cat].items.some(i => i.id === item.id)) {
                    filteredGroups[cat].items.push(item);
                }
            }
        });

        renderProducts(filteredGroups, true);
    } catch (error) {
        console.error('Search error:', error);
        // Show all products on search error
        renderProducts(globalProducts);
    }
}

// After rendering products
setTimeout(() => {
    initializeAllProducts()
}, 100)

// Helper function for color button styling
function getColorStyle(colorName) {
    const colorMap = {
        'White': 'background: #ffffff; color: #333; border: 1px solid #ddd;',
        'Black': 'background: #000000; color: white;',
        'Blue': 'background: #007bff; color: white;',
        'Red': 'background: #dc3545; color: white;',
        'Green': 'background: #28a745; color: white;',
        'Yellow': 'background: #ffc107; color: #333;',
        'Cream': 'background: #fffdd0; color: #333; border: 1px solid #ddd;',
        'Gray': 'background: #6c757d; color: white;',
        'Brown': 'background: #8B4513; color: white;',
        'Pink': 'background: #e83e8c; color: white;', // ADD THIS LINE
        'Orange': 'background: #fd7e14; color: white;'
    };

    if (colorMap[colorName]) {
        return colorMap[colorName];
    }
    return 'background: #f8f9fa; color: #333;';
}

// Helper function to get quantity step
function getQuantityStep(product) {
    if (product.multiple15) return '1.5';
    if (product.evenOnly) return '2';
    if (product.halfQty) return '0.5';
    return '1';
}
function renderProducts(groups, isSearch = false) {
    const wrap = document.getElementById("product-list")
    wrap.innerHTML = ""
    wrap.classList.remove("focus-mode"); // Reset focus mode on re-render

    if (Object.keys(groups).length === 0) {
        wrap.innerHTML = `
            <div class="no-results" style="grid-column: 1/-1;">
                <h3>${isSearch ? 'No products found' : 'No products available'}</h3>
                <p>${isSearch ? 'Try different search terms' : 'Please check back later'}</p>
            </div>
        `;
        return;
    }

    let mainHtml = "";

    // ADD CUSTOM SIZE TILE (Only on home/main view if rolls data exists)
    if (!isSearch && Object.keys(customRollData).length > 0) {
        mainHtml += `
            <div class="category-section custom-size-tile" onclick="showCustomView()">
                <div class="category-header">
                    <span>Custom Size</span>
                </div>
            </div>
        `;
    }

    Object.keys(groups).forEach((cat, index) => {
        const catKey = safeKey(cat);
        const isClearance = cat === "Clearance Sale";
        const items = groups[cat].items;

        // Sub-group items if we are in Clearance Sale
        const subGroups = {};
        if (isClearance) {
            items.forEach(i => {
                const subCat = i.originalCategory || 'General';
                if (!subGroups[subCat]) subGroups[subCat] = [];
                subGroups[subCat].push(i);
            });
        } else {
            subGroups['default'] = items;
        }

        let catContentHtml = "";
        Object.keys(subGroups).forEach(subCatName => {
            let subCatItemsHtml = "";
            const subItems = subGroups[subCatName];
            const grouped = {};

            subItems.forEach(i => {
                const key = safeKey(cat + "_" + i.name);
                if (!grouped[key]) grouped[key] = { name: i.name, variations: [], hasColors: i.hasColors, colorOptions: i.colorOptions };

                // If this product has multiple colors, expand into one variation per color
                // This ensures v.color is set on each variation so the map can correctly key them
                if (i.hasColors && i.colorOptions && i.colorOptions.length > 0) {
                    i.colorOptions.forEach(color => {
                        grouped[key].variations.push({ ...i, color: color.trim() });
                    });
                } else {
                    grouped[key].variations.push(i);
                }
            });

            Object.keys(grouped).forEach(k => {
                const g = grouped[k];
                window[`g_${k}`] = g;
                const map = {};
                g.variations.forEach(v => {
                    if (v.displaySize) {
                        const brandKey = `${v.size}_${v.gsm}_${v.displaySize}`;
                        map[brandKey] = v;
                        const fallbackKey = `${v.size}_${v.gsm}`;
                        if (!map[fallbackKey]) map[fallbackKey] = v;
                    } else {
                        const baseKey = `${v.size}_${v.gsm}`;
                        map[baseKey] = v;
                    }
                    if (v.color) {
                        if (v.displaySize) {
                            const colorBrandKey = `${v.size}_${v.gsm}_${v.displaySize}_${v.color}`;
                            map[colorBrandKey] = v;
                        }
                        const colorKey = `${v.size}_${v.gsm}_${v.color}`;
                        map[colorKey] = v;
                    }
                });
                window[`map_${k}`] = map;
                window[`category_${k}`] = cat;

                const minPrice = Math.min(...g.variations.map(v => parseFloat(v.rate) || 9999));
                const firstImg = g.variations[0].image;

                subCatItemsHtml += `
<div class="product-card compact-card" onclick="openVariationSheet('${k}')" style="cursor: pointer;">
    <img src="${firstImg}" alt="${g.name}" loading="lazy">
    <div class="product-info">
        <h3>${g.name}</h3>
        <p class="starting-price">From Rs ${minPrice}/KG</p>
        <button class="select-btn" onclick="openVariationSheet('${k}')">
            <span class="desktop-text">Select</span>
            <span class="mobile-text">Select Size & Weight</span>
        </button>
    </div>
</div>`;
            });

            if (isClearance) {
                const subCatKey = safeKey("sub_" + subCatName);
                catContentHtml += `
                    <div class="category-section clearance-sub-tile" id="sub-section-${subCatKey}" onclick="toggleClearanceSub(event, '${subCatKey}')">
                        <h2 class="category-header sub-header">${subCatName}</h2>
                        <div class="category-products sub-content" id="sub-content-${subCatKey}" style="max-height: 0; overflow: hidden; transition: max-height 0.3s ease-out;">
                            <div class="category-products nested-grid" id="sub-grid-${subCatKey}">
                                ${subCatItemsHtml}
                            </div>
                        </div>
                    </div>`;
            } else {
                catContentHtml += subCatItemsHtml;
            }
        });

        // Build the main category wrapper
        if (cat && cat !== "undefined") {
            mainHtml += `
<div class="category-section ${isClearance ? 'clearance-sale' : ''}" id="section-${catKey}" onclick="handleSectionClick(event, '${catKey}')">
    <h2 class="category-header">${isClearance ? '🔥 ' + cat : cat}</h2>
    <div class="category-products" id="cat-${catKey}" style="max-height: 0;">
        ${catContentHtml}
    </div>
</div>`;
        }
    });

    wrap.innerHTML = mainHtml;
}

function safeKey(t) {
    return t.replace(/[^a-zA-Z0-9]/g, "_")
}

function selectVar(key, type, val, btn) {
    // Get the category for this product
    const category = window[`category_${key}`]

    // Check if this category needs GSM filtering
    const shouldFilterGsms = !["Copy Paper", "Stickers", "A4 Paper", "White Sticker"].includes(category)

    if (type === "size") {
        window[`size_${key}`] = val

        // For Photocopy Paper, when size changes, we need to update available GSMs
        // based on the selected size
        if (category === "Copy Paper") {
            updateAvailableGsmsForPhotocopy(key, val);
        } else if (shouldFilterGsms) {
            updateAvailableGsms(key, val)
        }
    }
    if (type === "gsm") window[`gsm_${key}`] = val
    if (type === "color") window[`color_${key}`] = val
    if (type === "brand") {
        window[`brand_${key}`] = val
        // When brand changes for Photocopy Paper, update GSM options
        if (category === "Copy Paper") {
            updateGsmsForPhotocopy(key, window[`size_${key}`], val);
        }
    }

    // Remove active class from all buttons of the same type
    const parent = btn.parentElement
    parent.querySelectorAll(".variation-btn").forEach(b => b.classList.remove("active"))
    btn.classList.add("active")

    updateUI(key, true)
}

// New function specifically for Photocopy Paper size changes
// Updated function for Photocopy Paper size changes - updates both brands and GSMs
function updateAvailableGsmsForPhotocopy(key, selectedSize) {
    // Get all variations for this product
    const variations = window[`map_${key}`];
    if (!variations) return;

    // Get unique brands available for the selected size
    const availableBrands = [...new Set(
        Object.values(variations)
            .filter(v => v.size === selectedSize && v.displaySize)
            .map(v => v.displaySize)
    )];

    // Update the brand grid
    const brandGrid = document.getElementById(`brand-grid-${key}`);
    if (brandGrid) {
        brandGrid.innerHTML = '';

        if (availableBrands.length === 0) {
            brandGrid.innerHTML = '<button class="variation-btn" disabled>No brands available</button>';
            window[`brand_${key}`] = '';
        } else {
            availableBrands.forEach((brand, index) => {
                const button = document.createElement('button');
                button.className = `variation-btn brand-btn ${index === 0 ? 'active' : ''}`;
                button.innerHTML = `<span>${brand}</span>`;
                button.onclick = function () { selectVar(key, 'brand', brand, this); };

                // Find if any variation for this brand has tags
                const brandVars = Object.values(variations).filter(v => v.size === selectedSize && v.displaySize === brand);
                const discount = brandVars.find(v => v.discountTag)?.discountTag;
                const newly = brandVars.find(v => v.newTag)?.newTag;

                if (discount) {
                    const badge = document.createElement('span');
                    badge.className = 'badge-on-btn badge-discounted';
                    badge.style.right = newly ? '25px' : '-5px'; // Adjust if both present
                    badge.style.background = 'red';
                    badge.innerText = discount.substring(0, 4).toUpperCase();
                    button.appendChild(badge);
                }
                if (newly) {
                    const badge = document.createElement('span');
                    badge.className = 'badge-on-btn badge-new';
                    badge.style.right = '-5px';
                    badge.style.background = '#28a745';
                    badge.innerText = newly.substring(0, 3).toUpperCase();
                    button.appendChild(badge);
                }

                brandGrid.appendChild(button);
            });

            // Set default brand to first available
            window[`brand_${key}`] = availableBrands[0];
        }
    }

    // Now update GSM options based on selected size AND default brand
    updateGsmsForPhotocopy(key, selectedSize, window[`brand_${key}`]);
}

// New function to update GSMs when brand changes
function updateGsmsForPhotocopy(key, selectedSize, selectedBrand) {
    const variations = window[`map_${key}`];
    if (!variations) return;

    // Filter variations that match the selected size AND brand
    const availableGsms = [...new Set(
        Object.values(variations)
            .filter(v => v.size === selectedSize && v.displaySize === selectedBrand)
            .map(v => v.gsm)
    )];

    // Get the GSM grid container
    const gsmGrid = document.getElementById(`gsm-grid-${key}`);
    if (!gsmGrid) return;

    // Clear existing GSM buttons
    gsmGrid.innerHTML = '';

    if (availableGsms.length === 0) {
        gsmGrid.innerHTML = '<button class="variation-btn" disabled>No GSM available</button>';
        window[`gsm_${key}`] = '';
    } else {
        // Create new GSM buttons
        availableGsms.forEach((gsm, index) => {
            const button = document.createElement('button');
            button.className = `variation-btn ${index === 0 ? 'active' : ''}`;
            button.style.position = 'relative';
            button.innerHTML = `<span>${gsm}</span>`;
            button.onclick = function () { selectVar(key, 'gsm', gsm, this); };

            // Check for tags
            const gsmVars = Object.values(variations).filter(v => v.size === selectedSize && v.displaySize === selectedBrand && v.gsm === gsm);
            const discount = gsmVars.find(v => v.discountTag)?.discountTag;
            const newly = gsmVars.find(v => v.newTag)?.newTag;

            if (discount) {
                const badge = document.createElement('span');
                badge.className = 'badge-on-btn badge-discounted';
                badge.style.right = newly ? '25px' : '-5px';
                badge.style.background = 'red';
                badge.innerText = discount.substring(0, 4).toUpperCase();
                button.appendChild(badge);
            }
            if (newly) {
                const badge = document.createElement('span');
                badge.className = 'badge-on-btn badge-new';
                badge.style.right = '-5px';
                badge.style.background = '#28a745';
                badge.innerText = newly.substring(0, 3).toUpperCase();
                button.appendChild(badge);
            }

            gsmGrid.appendChild(button);
        });

        // Update selected GSM to first available
        window[`gsm_${key}`] = availableGsms[0];
    }

    updateUI(key, true);
}
// GSM updating function (only for categories that need it)
function updateAvailableGsms(key, selectedSize) {
    // Get the GSM map for this product
    const gsmMap = window[`sizeToGsms_${key}`]

    if (!gsmMap) {
        console.error(`No GSM map found for product: ${key}`)
        return
    }

    // Get available GSMs for the selected size
    const availableGsms = gsmMap[selectedSize] || []

    // Get the GSM grid container
    const gsmGrid = document.getElementById(`gsm-grid-${key}`)

    if (!gsmGrid) {
        console.error(`No GSM grid found for product: ${key}`)
        return
    }

    // Clear existing GSM buttons
    gsmGrid.innerHTML = ''

    if (availableGsms.length === 0) {
        // No GSMs available for this size
        gsmGrid.innerHTML = '<button class="variation-btn" disabled>No GSM available</button>'
        window[`gsm_${key}`] = ''
    } else {
        // Create new GSM buttons for available GSMs
        availableGsms.forEach((gsm, index) => {
            const button = document.createElement('button')
            button.className = `variation-btn ${index === 0 ? 'active' : ''}`
            button.textContent = gsm
            button.onclick = function () { selectVar(key, 'gsm', gsm, this) }
            gsmGrid.appendChild(button)
        })

        // Update the selected GSM to the first available option
        window[`gsm_${key}`] = availableGsms[0]
    }

    // Update UI immediately to reflect the change
    updateUI(key, true)
}

function jumpToAlt(targetKey, size, gsm) {
    // 1. Find the card for the suggested product
    const infoEl = document.getElementById(`info_${targetKey}`);
    if (!infoEl) return;
    const card = infoEl.closest('.product-card');
    if (!card) return;

    // 2. Scroll into view and flash orange (Background flash)
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('blink-highlight');

    // Set suggestion flag for this product
    window['suggested_' + targetKey] = true;

    setTimeout(() => card.classList.remove('blink-highlight'), 3000);

    // 3. Select Size (Using Case-Insensitive Matching)
    const sizeGrid = card.querySelector('.size-grid');
    if (sizeGrid) {
        const targetSizeStr = size.toString().toLowerCase().trim();
        const sizeBtn = Array.from(sizeGrid.querySelectorAll('.variation-btn'))
            .find(b => b.innerText.toLowerCase().trim() === targetSizeStr);

        if (sizeBtn) {
            selectVar(targetKey, 'size', size, sizeBtn);
        }
    }

    // 4. Select GSM (Delayed heavily to wait for grid update)
    setTimeout(() => {
        const targetGsmStr = gsm.toString().toLowerCase().trim();
        const gsmGrid = card.querySelector('.gsm-grid');
        if (gsmGrid) {
            const gsmBtn = Array.from(gsmGrid.querySelectorAll('.variation-btn'))
                .find(b => b.innerText.toLowerCase().trim() === targetGsmStr);
            if (gsmBtn) {
                selectVar(targetKey, 'gsm', gsm, gsmBtn);
            }
        }
    }, 600); // 600ms to ensure GSM grid is fully rendered
}

function updateUI(key, isUserInteraction = false) {
    // Get selected values
    const selectedSize = window[`size_${key}`]
    const selectedGsm = window[`gsm_${key}`]
    const selectedColor = window[`color_${key}`] // Don't default to empty yet
    const selectedBrand = window[`brand_${key}`] || ''

    const priceEl = document.getElementById(`price_${key}`);
    const infoEl = document.getElementById(`info_${key}`);
    const cartBtn = document.querySelector(`.product-card #qty_${key}`).closest('.qty-row').querySelector('.btn-cart');
    const compBox = document.getElementById(`comp_box_${key}`);
    const altList = document.getElementById(`alt_list_${key}`);

    // Check if COlor Grid exists for this product
    const colorGrid = document.getElementById(`color-grid-${key}`);

    // --- CHECK IF OPTIONS ARE SELECTED ---
    if (!selectedSize || !selectedGsm || (colorGrid && !selectedColor)) {
        let msg = '👈 Please Select Size & GSM';
        if (colorGrid && !selectedColor) msg = '👈 Please Select Size, GSM & Color';

        priceEl.innerHTML = `<span style="color: #666; font-size: 0.9rem;">${msg}</span>`;
        infoEl.innerText = 'Choose patterns above';
        if (cartBtn) {
            cartBtn.disabled = true;
            cartBtn.innerText = 'Select Options';
        }
        if (compBox) compBox.style.display = 'none';
        return;
    }

    // Enable button if selection is made
    if (cartBtn) {
        cartBtn.disabled = false;
        cartBtn.innerText = 'Add to Cart';
    }

    // Build the lookup key - PRIORITY: size_gsm_brand_color
    let lookupKey = `${selectedSize}_${selectedGsm}`
    if (selectedBrand) lookupKey += `_${selectedBrand}`
    if (selectedColor) lookupKey += `_${selectedColor}`

    // Find the product variation
    let p = window[`map_${key}`][lookupKey]

    // Fallbacks
    if (!p && selectedColor) {
        lookupKey = `${selectedSize}_${selectedGsm}`;
        if (selectedBrand) lookupKey += `_${selectedBrand}`;
        p = window[`map_${key}`][lookupKey];
    }
    if (!p && selectedBrand) {
        lookupKey = `${selectedSize}_${selectedGsm}`;
        if (selectedColor) lookupKey += `_${selectedColor}`;
        p = window[`map_${key}`][lookupKey];
    }
    if (!p) p = window[`map_${key}`][`${selectedSize}_${selectedGsm}`];

    if (p) {
        // Update display
        priceEl.innerText = `Rs ${p.price} (Rs ${p.rate}/KG)`
        infoEl.innerText = p.showGSM === false ? `${p.sheets} Sheets | Rs ${p.rate}/KG` : `${p.gsm} GSM | Rs ${p.rate}/KG`

        const img = document.getElementById(`img_${key}`)
        if (img && p.image) img.src = p.image

        const qtyInput = document.getElementById(`qty_${key}`)
        // We no longer set qtyInput.max or cap the value here,
        // so the user can type freely. Validation happens on Add to Cart.

        // --- DYNAMIC SAVINGS LOGIC (With Exclusions) ---
        const cat = window[`category_${key}`]
        // Exclude specific categories: Copy Paper, Stickers, Carbonless, and Colour Card
        const excludedCats = ["Copy Paper", "Stickers", "Carbonless", "Colour Card"];

        // Also exclude products that have color variations in their variations list
        const variations = Object.values(window[`map_${key}`] || {});
        const hasColors = variations.some(v => v.color && v.color.trim() !== "");

        if (isUserInteraction && compBox && altList && !excludedCats.includes(cat) && !hasColors) {
            const currentPrice = parseFloat(p.price);

            if (globalProducts[cat]) {
                const cheaperAlternatives = globalProducts[cat].items.filter(item => {
                    const currentOrigCat = p.originalCategory || p.category;
                    const itemOrigCat = item.originalCategory || item.category;
                    return item.size === selectedSize &&
                        item.gsm === selectedGsm &&
                        item.name !== p.name &&
                        parseFloat(item.price) < currentPrice &&
                        currentOrigCat === itemOrigCat;
                });

                if (cheaperAlternatives.length > 0) {
                    compBox.querySelector('.comparison-title').innerText = '🔥 کم قیمت والے آپشنز:';
                    compBox.style.display = 'block';
                    const qty = parseFloat(document.getElementById(`qty_${key}`)?.value || 1);
                    altList.innerHTML = cheaperAlternatives.map(alt => {
                        const savingsPerUnit = currentPrice - parseFloat(alt.price);
                        const totalSavings = savingsPerUnit * qty;
                        // Use category-aware key for jumping to alternatives
                        const targetKey = safeKey(cat + "_" + alt.name);
                        return `
                            <a href="javascript:void(0)" class="alt-item" onclick="jumpToAlt('${targetKey}', '${selectedSize}', '${selectedGsm}')">
                                <span class="alt-name">${alt.displaySize || alt.name}</span>
                                <div class="alt-info-wrapper">
                                    <div class="alt-price-stack">
                                        <span class="alt-packet-price">Rs ${alt.price}</span>
                                        <span class="alt-kg-rate">${alt.rate}/KG</span>
                                    </div>
                                    <span class="alt-savings">Save Rs ${totalSavings.toFixed(0)}</span>
                                    <span class="alt-arrow">→</span>
                                </div>
                            </a>
                        `;
                    }).join('');
                } else {
                    compBox.style.display = 'none';
                }
            }
        } else if (compBox) {
            compBox.style.display = 'none';
        }
    }
}
function updateCartBadge() {
    const totalItems = Object.values(cart).reduce((sum, item) => sum + item.qty, 0)
    const badge = document.getElementById("cart-count-badge")
    badge.textContent = totalItems
    badge.style.display = totalItems > 0 ? "flex" : "none"
}

// Cart Management Functions
function toggleCart() {
    const cartEl = document.getElementById("cart-container");
    cartEl.classList.toggle("active");

    const isOpen = cartEl.classList.contains("active");
    // Prevent body scroll when cart is open
    document.body.style.overflow = isOpen ? "hidden" : "auto";
}

function openCart() {
    const cartEl = document.getElementById("cart-container");
    cartEl.classList.add("active");
    document.body.style.overflow = "hidden";

    // Track GA Event: View Cart
    if (typeof gtag === 'function') {
        gtag('event', 'view_cart', {
            currency: 'PKR',
            value: Object.values(cart).reduce((sum, i) => sum + (i.price * i.qty), 0),
            items: Object.values(cart).map(i => ({
                item_name: i.name,
                item_id: i.id,
                price: i.price,
                quantity: i.qty,
                item_variant: `${i.size} ${i.gsm}gsm ${i.selectedBrand || ''} ${i.selectedColor || ''}`.trim()
            }))
        });
    }
}

function closeCart() {
    const cartEl = document.getElementById("cart-container");
    cartEl.classList.remove("active");
    document.body.style.overflow = "auto";
}

// Checkout Functions
let lastPriceCheck = 0;

async function openCheckout() {
    if (Object.keys(cart).length === 0) {
        alert("Your cart is empty")
        return
    }

    // --- REAL-TIME PRICE CHECK ---
    const now = Date.now();
    let checkResult = { count: 0, keys: [] };

    // Only run verification once every 30 seconds to avoid spamming
    if (now - lastPriceCheck > 30000) {
        const checkoutBtn = document.querySelector('.btn-checkout');
        const originalText = checkoutBtn ? checkoutBtn.innerHTML : 'Proceed to Checkout';

        if (checkoutBtn) {
            checkoutBtn.disabled = true;
            checkoutBtn.innerHTML = '<span class="spinner-small"></span> Verifying prices...';
        }

        try {
            // Capture the result from the fetchProducts call
            checkResult = await fetchProducts({ quiet: true });
            lastPriceCheck = now;
        } catch (e) {
            console.warn("Price verification failed", e);
        } finally {
            if (checkoutBtn) {
                checkoutBtn.disabled = false;
                checkoutBtn.innerHTML = originalText;
            }
        }

        // STOP & REVIEW GATE: If prices changed, do NOT open checkout.
        // Stay in cart and let user see the changes + highlights.
        if (checkResult.count > 0) {
            openCart(); // Ensure cart is open so they see labels
            console.log("Price change detected. Stopping checkout for review.");
            return; // EXIT HERE
        }
    }
    // -----------------------------

    closeCart()

    document.getElementById("cust-name").value = ""
    document.getElementById("cust-email").value = ""
    document.getElementById("cust-phone").value = ""
    document.getElementById("delivery-address").value = ""

    document.getElementById('shipping-self').checked = true;
    updateShipping('self', false);

    document.getElementById("checkout-modal").classList.add("active")
    document.body.style.overflow = "hidden"

    // Track GA Event: Begin Checkout
    if (typeof gtag === 'function') {
        gtag('event', 'begin_checkout', {
            currency: 'PKR',
            value: Object.values(cart).reduce((sum, i) => sum + (i.price * i.qty), 0),
            items: Object.values(cart).map(i => ({
                item_name: i.name,
                item_id: i.id,
                price: i.price,
                quantity: i.qty
            }))
        });
    }
}

function closeCheckout() {
    document.getElementById("checkout-modal").classList.remove("active")
    document.body.style.overflow = "auto"
}

// ===== CHECKOUT HELPER FUNCTIONS =====
function updateShipping(method, updateRadio = true) {
    currentShippingMethod = method;
    const container = document.getElementById("delivery-address-container")

    // Get all shipping buttons
    const selfBtn = document.querySelector('label[for="shipping-self"]')
    const openBtn = document.querySelector('label[for="shipping-delivery-open"]')
    const bundleBtn = document.querySelector('label[for="shipping-delivery-bundle"]')

    if (updateRadio) {
        document.querySelector(`input[value="${method}"]`).checked = true;
    }

    // Remove active class from all shipping buttons
    [selfBtn, openBtn, bundleBtn].forEach(btn => {
        if (btn) btn.classList.remove("active")
    })

    // Show/hide address container based on method
    if (method === "open" || method === "bundle") {
        container.style.display = "block"
        // Add active class to selected button
        if (method === "open" && openBtn) openBtn.classList.add("active")
        if (method === "bundle" && bundleBtn) bundleBtn.classList.add("active")
        calculateDeliveryCharges(method)
    } else {
        // Self pickup
        container.style.display = "none"
        if (selfBtn) selfBtn.classList.add("active")
        document.getElementById("delivery-charges").innerText = ""
        updateCheckoutTotal(0)
    }
}
function calculateDeliveryCharges(method = 'open') {
    let totalWeight = 0;
    Object.values(cart).forEach(item => {
        // Ensure weight and qty are treated as numbers
        totalWeight += (Number(item.weight) * Number(item.qty));
    });

    let deliveryCharges = 0;
    let chargesText = "";

    if (method === 'open') {
        // 1. Calculate the base charge
        if (totalWeight <= 150) {
            deliveryCharges = 350; // Flat minimum
        } else {
            // Simple Weight * 3.5 (No rounding to 10 or 100)
            deliveryCharges = Math.round(totalWeight * 3.5);
        }

        chargesText = `Delivery Charges (Open): Rs ${deliveryCharges}`;

    } else if (method === 'bundle') {
        // BUNDLE logic (70kg per bundle)
        let bundles = totalWeight / 70;
        let decimalPart = bundles % 1;

        // Custom rounding rule: <= 0.5 rounds down, > 0.5 rounds up
        if (decimalPart <= 0.5) {
            bundles = Math.floor(bundles);
        } else {
            bundles = Math.ceil(bundles);
        }

        bundles = Math.max(1, bundles); // Minimum 1 bundle
        deliveryCharges = bundles * 250;
        chargesText = `Delivery Charges (Bundle): Rs ${deliveryCharges} (${bundles} bundles × Rs 250)`;
    }

    // Update the UI
    const displayElement = document.getElementById("delivery-charges");
    if (displayElement) {
        displayElement.innerText = chargesText;
    }

    // Update the grand total in your system
    if (typeof updateCheckoutTotal === "function") {
        updateCheckoutTotal(deliveryCharges);
    }

    return deliveryCharges;
}

function updateCheckoutTotal(deliveryCharges) {
    let total = 0
    Object.values(cart).forEach(i => {
        total += i.price * i.qty
    })

    const subtotal = total
    total += deliveryCharges || 0
    const totalWeight = Object.values(cart).reduce((sum, i) => sum + i.weight * i.qty, 0)

    document.getElementById("checkout-summary-box").innerHTML = generateSummaryText(subtotal, total, totalWeight, deliveryCharges)
}

function generateSummaryText(subtotal, total, totalWeight, deliveryCharges) {
    let summaryHtml = "<h4>Order Summary</h4>"

    // Helper for formatting with commas
    const fmt = (num) => Math.round(num).toLocaleString('en-IN');

    summaryHtml += `<div class="summary-line"><span>Subtotal (${Object.keys(cart).length} Items)</span><span>Rs. ${fmt(subtotal)}</span></div>`

    const shippingText = deliveryCharges > 0 ? `Rs. ${fmt(deliveryCharges)}` : `FREE`
    summaryHtml += `<div class="summary-line"><span>Shipping</span><span>${shippingText}</span></div>`

    summaryHtml += `<div class="summary-line" style="font-size: 0.9em; padding-top: 10px; border-top: 1px dashed #ddd;">
                      <span>Total Weight</span><span>${Math.round(totalWeight)} KG</span></div>`

    // Clear spacing for Total and Rs.
    summaryHtml += `<div class="summary-total"><span>Total</span><span>Rs. ${fmt(total)}</span></div>`

    summaryHtml += `<div style="border-top: 1px solid #eee; margin-top: 15px; padding-top: 10px; font-size: 0.85em;">`
    summaryHtml += `<p style="margin: 0 0 8px 0; font-weight: 700;">Items in Cart:</p>`
    Object.values(cart).forEach(i => {
        const itemTotal = i.price * i.qty
        summaryHtml += `<div style="margin-bottom: 5px; padding: 5px 0; border-bottom: 1px dashed #f0f0f0;">
                          ${i.name} (${i.size}, ${i.gsm} GSM${i.selectedBrand ? `, ${i.selectedBrand}` : ''}${i.selectedColor ? `, ${i.selectedColor}` : ''})<br>
                          <small>${i.qty} × Rs. ${fmt(i.price)} = Rs. ${fmt(itemTotal)} (Rs. ${fmt(i.rate)}/KG)</small>
                        </div>`
    })
    summaryHtml += `</div>`

    return summaryHtml
}

function removeFromCart(cartKey) {
    delete cart[cartKey]
    renderCart()
    updateCartBadge()
    saveCart() // Persist to local storage
}

/**
 * FEATURE: Beautiful Trailing Animation
 * Animates a product image clone from the product card to the cart icon.
 */
/**
 * FEATURE: Trail of Light Animation
 * Animates a stream of green particles from the source element to the cart icon.
 */
function animateToCart(startEl, targetEl) {
    const startRect = startEl.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();

    const startX = startRect.left + startRect.width / 2;
    const startY = startRect.top + startRect.height / 2;
    const endX = targetRect.left + targetRect.width / 2;
    const endY = targetRect.top + targetRect.height / 2;

    const particleCount = 15;
    for (let i = 0; i < particleCount; i++) {
        setTimeout(() => {
            const p = document.createElement('div');
            p.className = 'cart-particle-trail';
            p.style.left = startX + 'px';
            p.style.top = startY + 'px';
            document.body.appendChild(p);

            // Trigger animation after a tiny delay
            setTimeout(() => {
                p.style.transform = `translate(${endX - startX}px, ${endY - startY}px) scale(0.3)`;
                p.style.opacity = '0';
            }, 10);

            setTimeout(() => p.remove(), 1000);
        }, i * 45); // Faster stream
    }

    // Intense feedback on cart icon
    setTimeout(() => {
        // Shake the button
        targetEl.classList.remove('cart-shake');
        void targetEl.offsetWidth;
        targetEl.classList.add('cart-shake');

        // Create the ripple/ping effect
        const ping = document.createElement('div');
        ping.className = 'cart-ping-effect';
        targetEl.appendChild(ping);
        setTimeout(() => ping.remove(), 700);
    }, 700);
}

/**
 * FEATURE: Center Success Checkmark
 * Shows a large green checkmark in the center of the screen.
 */
function showSuccessCheckmark() {
    const check = document.createElement('div');
    check.className = 'success-checkmark-overlay';
    check.innerHTML = '&#10004;'; // Checkmark symbol
    document.body.appendChild(check);

    setTimeout(() => check.remove(), 1100);
}

function createParticle(x, y) {
    const p = document.createElement('div');
    p.className = 'cart-particle';
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    p.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--secondary') || '#28a745';
    document.body.appendChild(p);

    setTimeout(() => p.remove(), 600);
}
// ===== END CHECKOUT FUNCTIONS =====

// ADD TO CART FUNCTION - UPDATED FOR BRAND
async function addToCart(key) {

    const qtyInput = document.getElementById(`qty_${key}`)
    if (!qtyInput) return;
    let rawQty = qtyInput.value;
    let qty = parseFloat(rawQty);

    // Get selected values
    const selectedSize = window[`size_${key}`]
    const selectedGsm = window[`gsm_${key}`]
    const selectedColor = window[`color_${key}`] || ''
    const selectedBrand = window[`brand_${key}`] || ''

    console.log("=== DEBUG START ===");
    console.log("Selected Size:", selectedSize, "GSM:", selectedGsm, "Brand:", selectedBrand, "Color:", selectedColor);
    console.log("All keys in map for this product:", Object.keys(window[`map_${key}`]));
    let debugLookupKey = `${selectedSize}_${selectedGsm}`;
    if (selectedBrand) debugLookupKey += `_${selectedBrand}`;
    if (selectedColor) debugLookupKey += `_${selectedColor}`;
    console.log("Looking for key:", debugLookupKey);
    console.log("Product found?", window[`map_${key}`][debugLookupKey]);
    if (window[`map_${key}`][debugLookupKey]) {
        console.log("Found product color:", window[`map_${key}`][debugLookupKey].color);
    }
    console.log("=== DEBUG END ===");
    // ===== END DEBUG BLOCK =====

    // Build lookup key in ORDER OF PRIORITY
    let variantKey = `${selectedSize}_${selectedGsm}`

    // 1. Try with brand + color (if both exist)
    if (selectedBrand && selectedColor) {
        variantKey = `${selectedSize}_${selectedGsm}_${selectedBrand}_${selectedColor}`
    }
    // 2. Try with brand only
    else if (selectedBrand) {
        variantKey = `${selectedSize}_${selectedGsm}_${selectedBrand}`
    }
    // 3. Try with color only  
    else if (selectedColor) {
        // Include brand if available
        if (selectedBrand) {
            variantKey = `${selectedSize}_${selectedGsm}_${selectedBrand}_${selectedColor}`
        } else {
            variantKey = `${selectedSize}_${selectedGsm}_${selectedColor}`
        }
    }
    // 4. Base key already set

    let p = window[`map_${key}`][variantKey]

    // If not found, try other combinations
    if (!p) {
        // Try brand without color (if we tried with color)
        if (selectedBrand && selectedColor) {
            variantKey = `${selectedSize}_${selectedGsm}_${selectedBrand}`
            p = window[`map_${key}`][variantKey]
        }
        // Try color without brand (if we tried with brand)
        if (!p && selectedBrand && selectedColor) {
            // Try with color only (no brand)
            variantKey = `${selectedSize}_${selectedGsm}_${selectedColor}`
            p = window[`map_${key}`][variantKey]

            // If still not found, try brand only (no color)
            if (!p) {
                variantKey = `${selectedSize}_${selectedGsm}_${selectedBrand}`
                p = window[`map_${key}`][variantKey]
            }
        }
        // Try base key (no brand, no color)
        if (!p) {
            variantKey = `${selectedSize}_${selectedGsm}`
            p = window[`map_${key}`][variantKey]
        }
    }

    if (!p) {
        alert("⚠️ ATTENTION: PRODUCT IS OUT OF STOCK ⚠️")
        return
    }

    // === PRICE VALIDATION - LIVE CHECK WITH FIX FOR PROBLEMATIC PRODUCTS ===
    try {
        // Fetch A1:AD to also check the Version cell (X2), ERP columns and Packing Type during cart-add
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}!A1:AD?key=${API_KEY}&_=${Date.now()}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.values) {
            // 1. Version Check (Option 1) - Row 2, Column X (index 23)
            const liveVersion = data.values[1] ? data.values[1][23] : null;
            if (checkAppVersion(liveVersion)) return;

            // 2. Filter out header to find the product
            const productRows = data.values.slice(1);
            // Parse size
            const sizeParts = selectedSize.split('x');
            const length = sizeParts[0];
            const width = sizeParts[1];

            // Get product name
            const productName = p.name;

            // CHECK IF THIS IS A PROBLEMATIC PRODUCT 
            // (multiple products with same name, size, and GSM but different brands/colors)
            const isProblematicProduct = window[`map_${key}`] &&
                Object.keys(window[`map_${key}`]).filter(k =>
                    k.startsWith(`${selectedSize}_${selectedGsm}`)
                ).length > 1;

            let freshProduct;

            if (isProblematicProduct) {
                // For problematic products: Match by unique combination
                // We use a TWO-PASS search: 
                // 1. First look for the row where this is the PRIMARY color (listed first)
                // 2. Fallback to any row that contains this color
                const findMatch = (primaryOnly) => productRows.find(row => {
                    const rowName = (row[3] || '').trim().toLowerCase();
                    const targetName = productName.trim().toLowerCase();
                    const rowBrand = (row[17] || '').trim().toLowerCase();
                    const targetBrand = selectedBrand.trim().toLowerCase();
                    const rowColorString = (row[16] || '').trim().toLowerCase();
                    const targetColor = selectedColor.trim().toLowerCase();
                    const rowColors = rowColorString.split(',').map(c => c.trim().toLowerCase());

                    const nameMatch = rowName === targetName;
                    const sizeMatch = row[6] == length && row[7] == width;
                    const gsmMatch = row[8] == selectedGsm;

                    if (!nameMatch || !sizeMatch || !gsmMatch) return false;

                    const brandMatch = !targetBrand || rowBrand === targetBrand;

                    let colorMatch = false;
                    if (!targetColor) {
                        colorMatch = true;
                    } else if (primaryOnly) {
                        // Check if it's the FIRST color in the list (The designated row for this color)
                        colorMatch = rowColors[0] === targetColor;
                    } else {
                        // Just check if it exists in the list
                        colorMatch = rowColors.includes(targetColor);
                    }

                    if (targetBrand && targetColor) return brandMatch && colorMatch;
                    if (targetBrand) return brandMatch;
                    if (targetColor) return colorMatch;

                    return true;
                });

                freshProduct = findMatch(true) || findMatch(false);
                console.log("Using primary-color lookup for product:", productName);
            } else {
                // For normal products: Use standard lookup
                freshProduct = productRows.find(row =>
                    (row[3] || '').trim().toLowerCase() === productName.trim().toLowerCase() &&
                    row[6] == length &&
                    row[7] == width &&
                    row[8] == selectedGsm
                );
            }

            // Final fallback to Name + Size + GSM if specific search fails
            if (!freshProduct) {
                freshProduct = productRows.find(row =>
                    (row[3] || '').trim().toLowerCase() === productName.trim().toLowerCase() &&
                    row[6] == length &&
                    row[7] == width &&
                    row[8] == selectedGsm
                );
            }

            if (freshProduct) {
                const freshPrice = Math.round(parseFloat(freshProduct[12] || 0));
                const currentPrice = p.price;

                const freshStock = parseInt(freshProduct[COL.STOCK] || 0);
                const freshMinStock = parseInt(freshProduct[COL.MIN_STOCK] || 10);
                const freshMaxLimit = parseInt(freshProduct[COL.MAX] || 9999);
                const liveMaxQty = Math.min(Math.max(0, freshStock - freshMinStock), freshMaxLimit);

                console.log('Validation results for:', productName, 'Live Max Qty:', liveMaxQty);

                // --- STOCK VALIDATION FIRST ---
                if (liveMaxQty === 0) {
                    alert("⚠️ ATTENTION: PRODUCT IS NO LONGER AVAILABLE ⚠️");
                    // Update UI to Disable button
                    updateUI(key);
                    return;
                }

                if (qty > liveMaxQty) {
                    if (liveMaxQty === freshMaxLimit) {
                        alert(`ایک آرڈر میں زیادہ سے زیادہ ${liveMaxQty} پیکٹ کی اجازت ہے۔`); // Urdu for Max Order Limit
                    } else {
                        alert(`معذرت! اس وقت صرف ${liveMaxQty} پیکٹ دستیاب ہیں۔`); // Urdu for Low Stock
                    }
                    qtyInput.value = liveMaxQty;
                    p.maxQty = liveMaxQty;
                    p.stockLimit = Math.max(0, freshStock - freshMinStock); // Keep track of reason
                    p.originalMax = freshMaxLimit;
                    // Update all variations of this product in memory
                    Object.values(window[`map_${key}`] || {}).forEach(v => {
                        if (v.id === p.id) v.maxQty = liveMaxQty;
                    });
                    updateUI(key);
                    return; // Stop adding to cart so user can confirm new qty
                }

                // --- PRICE VALIDATION ---

                if (freshPrice > 0 && currentPrice > 0 && freshPrice !== currentPrice) {
                    // ✅ FEATURE 9: Smooth price update — no page reload, cart is preserved

                    // Read the fresh rate/KG from column 10 (COL.RATE)
                    const freshRate = freshProduct[10] || p.rate;

                    // ⚡ Capture OLD rate BEFORE overwriting p.rate
                    const oldRate = parseFloat(p.rate) || 0;
                    const newRate = parseFloat(freshRate) || 0;

                    // Update BOTH price and rate in every entry of the variation map
                    Object.keys(window[`map_${key}`] || {}).forEach(mKey => {
                        const entry = window[`map_${key}`][mKey];
                        if (entry && entry.id === p.id) {
                            entry.price = freshPrice;
                            entry.rate = freshRate;
                        }
                    });
                    p.price = freshPrice;
                    p.rate = freshRate;

                    // ── Direct DOM update (guaranteed, no map-lookup dependency) ──
                    // Updates BOTH locations where Rs/KG is shown on the product card:
                    //   1. price_${key}  →  "Rs 3290 (Rs 340/KG)"
                    //   2. info_${key}   →  "250 GSM | Rs 340/KG"
                    const _priceEl = document.getElementById(`price_${key}`);
                    const _infoEl = document.getElementById(`info_${key}`);
                    if (_priceEl) _priceEl.innerText = `Rs ${freshPrice} (Rs ${freshRate}/KG)`;
                    if (_infoEl) _infoEl.innerText = _infoEl.innerText.replace(/Rs\s*[\d,]+\/KG/, `Rs ${freshRate}/KG`);
                    // ─────────────────────────────────────────────────────────────

                    // Also run updateUI() for any other state (image, qty limits)
                    updateUI(key);

                    // Show the slide-in banner (cart is NOT cleared)
                    showPriceChangeBanner(p.name, currentPrice, freshPrice, oldRate, newRate);
                    // ↑ Execution continues — item added to cart at updated price
                }
            }
        }
    } catch (e) {
        console.log('Price check failed:', e);
        // Allow add to cart if check fails
    }
    // === END PRICE VALIDATION ===

    // ✅ START OF NEW VALIDATION: Check if quantity is valid
    const allowHalf = p.halfQty === true;
    const evenOnly = p.evenOnly === true;
    const multiple15 = p.multiple15 === true;

    if (isNaN(qty) || qty <= 0) {
        alert("Please enter a valid quantity");
        return;
    }

    // Check for 1.5 Multiples first
    if (multiple15) {
        if (Math.abs((qty / 1.5) - Math.round(qty / 1.5)) > 0.001) {
            alert("150 SHEETS Packing, please enter multiples of 1.5 only (1.5, 3, 4.5, etc.).\n150 شیٹس کی پیکنگ! صرف 1.5 کے حساب سے تعداد درج کریں (مثلاً 1.5، 3، 4.5 وغیرہ)۔");
            qtyInput.focus();
            return;
        }
    }
    // Check for Even Only
    else if (evenOnly) {
        if (qty % 2 !== 0) {
            alert("200 SHEETS Packing, please enter even quantities only (2, 4, 6, etc.).\n 200 شیٹس کی پیکنگ! صرف تعداد درج کریں (مثلاً 2، 4، 6 وغیرہ)۔ ");
            qtyInput.focus();
            return;
        }
    }
    // Check for Half Quantity
    else if (allowHalf) {
        if (Math.abs(qty * 2 - Math.round(qty * 2)) > 0.001) {
            alert(`For this item, please enter a quantity in increments of 0.5 (e.g., 0.5, 1.0, 1.5).`);
            qtyInput.focus();
            return;
        }
    }
    // Default: Whole Number
    else {
        if (Math.abs(qty - Math.round(qty)) > 0.001) {
            alert(`For this item, please enter a whole number quantity.`);
            qtyInput.focus();
            return;
        }
    }
    // ✅ END OF NEW VALIDATION

    // VALIDATION: Check if selected brand matches product brand
    if (selectedBrand && p.displaySize && selectedBrand !== p.displaySize) {
        alert(`Product not available`)
        return
    }

    // VALIDATION: Check if selected color matches product color
    if (selectedColor && p.color && selectedColor !== p.color) {
        alert(`Color mismatch: Selected ${selectedColor} but product is ${p.color}`)
        return
    }

    if (qty > p.maxQty) {
        qty = p.maxQty
        qtyInput.value = qty
        if (p.maxQty === p.originalMax) {
            alert(`ایک آرڈر میں زیادہ سے زیادہ ${p.maxQty} پیکٹ کی اجازت ہے۔`)
        } else {
            alert(`معذرت! اس وقت صرف ${p.maxQty} پیکٹ دستیاب ہیں۔`)
        }
        return
    }


    // Create unique cart key - Category-Independent to prevent duplicates
    // We identify the item solely by its physical properties (Name, Size, GSM, Brand, Color)
    const cartKey = safeKey(p.name.trim() + "_" + p.size + "_" + p.gsm +
        (p.displaySize ? "_" + p.displaySize : "") +
        (p.color ? "_" + p.color : ""));

    const cartItem = {
        ...p,
        qty,
        selectedColor: selectedColor,
        selectedBrand: selectedBrand,
        isSuggested: window['suggested_' + key] || false
    }

    if (cart[cartKey]) {
        const newQty = cart[cartKey].qty + qty
        if (newQty > p.maxQty) {
            if (p.maxQty === p.originalMax) {
                alert(`ایک آرڈر میں زیادہ سے زیادہ ${p.maxQty} پیکٹ کی اجازت ہے۔ آپ کے کارٹ میں پہلے سے ${cart[cartKey].qty} موجود ہیں۔`)
            } else {
                alert(`معذرت! اس وقت صرف ${p.maxQty} پیکٹ دستیاب ہیں۔ آپ کے کارٹ میں پہلے سے ${cart[cartKey].qty} موجود ہیں۔`)
            }
            return
        }
        cart[cartKey].qty = newQty
    } else {
        cart[cartKey] = cartItem
    }

    // ✅ Trail of Light Animation
    try {
        const addBtn = document.querySelector(`[onclick="addToCart('${key}')"]`);
        const cartBtn = document.getElementById('view-cart-btn');
        if (addBtn && cartBtn) {
            animateToCart(addBtn, cartBtn);
            showSuccessCheckmark();
        }
    } catch (e) { console.error("Animation failed", e); }

    renderCart()
    updateCartBadge()
    saveCart() // Persist to local storage

    // Track GA Event: Add to Cart
    if (typeof gtag === 'function') {
        gtag('event', 'add_to_cart', {
            currency: 'PKR',
            value: p.price * qty,
            items: [{
                item_name: p.name,
                item_id: p.id,
                price: p.price,
                quantity: qty,
                item_brand: selectedBrand,
                item_variant: `${selectedSize} ${selectedGsm}gsm ${selectedColor}`.trim(),
                item_category: p.category
            }]
        });
    }

    //if (window.innerWidth <= 768) {
    // openCart();
    // }

    const addBtn = document.querySelector(`[onclick="addToCart('${key}')"]`)
    const originalText = addBtn.textContent
    addBtn.textContent = "Added!"
    addBtn.style.backgroundColor = "#1f8b3b"

    setTimeout(() => {
        addBtn.textContent = originalText
        addBtn.style.backgroundColor = ""
    }, 1000)
}
// UPDATE CART RENDER FUNCTION FOR BRAND
function renderCart(keysToHighlight = []) {
    const container = document.getElementById("cart-items")
    container.innerHTML = ""

    if (Object.keys(cart).length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: #6a6a6a;">
                <p style="font-size: 1.2em; margin-bottom: 10px;">🛒</p>
                <p>Your cart is empty</p>
                <p style="font-size: 0.9em;">Add some products to get started</p>
            </div>
        `
        document.getElementById("cart-total").innerText = "Total: Rs 0"
        return
    }

    let total = 0
    let totalWeight = 0
    Object.keys(cart).forEach(k => {
        const item = cart[k]
        const itemTotalPrice = item.price * item.qty
        const itemTotalWeight = item.weight * item.qty
        total += itemTotalPrice
        totalWeight += itemTotalWeight

        // Check if this item should be highlighted
        const isHighlighted = keysToHighlight.includes(k);

        // Build specifications line - UPDATED FOR BRAND
        let specs = `${item.size}, GSM ${item.gsm}`
        if (item.selectedBrand && item.selectedBrand !== '') {
            specs += `, ${item.selectedBrand}`
        }
        if (item.selectedColor && item.selectedColor !== '') {
            specs += `, ${item.selectedColor}`
        }

        // ✅ FEATURE 10: Determine qty step for this item
        const itemStep = item.multiple15 ? '1.5' : (item.evenOnly ? '2' : (item.halfQty ? '0.5' : '1'));
        const itemMin = item.multiple15 ? '1.5' : (item.halfQty ? '0.5' : (item.evenOnly ? '2' : '1'));

        container.innerHTML += `
            <div class="cart-item ${isHighlighted ? 'highlight-change' : ''}">
                <div class="cart-item-details">
                    <strong>${item.name}</strong><br>
                    <small>${specs}</small><br>
                    <div style="margin-top: 5px;">
                        Rs ${item.price} &times; ${item.qty} = <strong>Rs ${itemTotalPrice}</strong><br>
                        <small>${Math.round(itemTotalWeight)} KG @ Rs ${item.rate}/KG</small>
                    </div>
                    <div class="cart-qty-controls">
                        <button class="cart-qty-btn" onclick="changeCartQty('${k}', -1)" title="Decrease quantity">&#8722;</button>
                        <input class="cart-qty-num-input"
                            type="number"
                            onfocus="this.select()"
                            value="${item.qty}"
                            min="${itemMin}"
                            max="${item.maxQty}"
                            step="${itemStep}"
                            oninput="updateCartQty('${k}', this.value)"
                            onchange="updateCartQty('${k}', this.value)"
                            onblur="updateCartQty('${k}', this.value)">
                        <button class="cart-qty-btn" onclick="changeCartQty('${k}', 1)" title="Increase quantity">+</button>
                    </div>
                </div>
                <div class="cart-item-actions">
                    <button class="remove-btn" onclick="removeFromCart('${k}')">Remove</button>
                </div>
            </div>`
    })

    document.getElementById("cart-total").innerText = `Total: Rs ${total} (${Math.round(totalWeight)} KG)`
}

let isOrderBeingPlaced = false; // ADD THIS LINE AT TOP

// Updated placeOrder() function with link generation and email copy
async function placeOrder() {
    // ⬇️ ADD THESE 2 LINES AT THE START ⬇️
    const btn = document.querySelector('.whatsapp-btn');
    if (btn.disabled) return; else btn.innerHTML = '<span class="whatsapp-icon">⏳</span> Saving...', btn.disabled = true;
    // Generate unique Order ID
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 6).toUpperCase();
    const orderId = `HAYYAT-${timestamp}-${random}`;

    // Generate invoice link
    const invoiceLink = `https://www.hayyatstore.com/order.html?id=${orderId}`;

    // Number formatting function
    function formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    const name = document.getElementById("cust-name").value.trim();
    const phone = document.getElementById("cust-phone").value.trim();
    const email = document.getElementById("cust-email").value.trim();
    const address = document.getElementById("delivery-address").value.trim();

    const shippingElement = document.querySelector('input[name="shipping"]:checked');
    if (!shippingElement) {
        alert("Please select a shipping method");
        btn.disabled = false; btn.innerHTML = 'Place Order via WhatsApp';
        return;
    }
    const shipping = shippingElement.value;

    if (!name) {
        alert("Please enter your full name");
        document.getElementById("cust-name").focus();
        btn.disabled = false; btn.innerHTML = 'Place Order via WhatsApp';
        return;
    }

    if (!phone || phone.length < 10) {
        alert("Please enter a valid phone number");
        document.getElementById("cust-phone").focus();
        btn.disabled = false; btn.innerHTML = 'Place Order via WhatsApp';
        return;
    }

    if ((shipping === "open" || shipping === "bundle") && !address) {
        alert("Please enter delivery address");
        document.getElementById("delivery-address").focus();
        btn.disabled = false; btn.innerHTML = 'Place Order via WhatsApp';
        return;
    }

    // Calculate order details
    let total = 0;
    let totalWeight = 0;
    const orderItems = [];

    Object.values(cart).forEach(i => {
        const itemTotal = i.price * i.qty;
        const itemWeight = i.weight * i.qty;
        total += itemTotal;
        totalWeight += itemWeight;

        // Build specifications
        let specs = `${i.size}, GSM ${i.gsm}`;
        if (i.selectedBrand && i.selectedBrand !== '') {
            specs += `, ${i.selectedBrand}`;
        }
        if (i.selectedColor && i.selectedColor !== '') {
            specs += `, ${i.selectedColor}`;
        }

        orderItems.push({
            name: i.name,
            specs: specs,
            qty: i.qty,
            price: i.price,
            weight: i.weight,
            rate: i.rate,
            total: itemTotal,
            weightTotal: itemWeight
        });
    });

    let deliveryCharges = 0;
    if (shipping === "open" || shipping === "bundle") {
        if (shipping === "open") {
            // UNIFIED: Case 1: <= 150kg is 350. Case 2: > 150kg is Weight * 3.5
            // Removed the complex nearest-100 rounding that caused 468/400 errors
            deliveryCharges = (totalWeight <= 150) ? 350 : Math.round(totalWeight * 3.5);
        } else if (shipping === "bundle") {
            // BUNDLE delivery logic
            let bundles = totalWeight / 70;
            let decimalPart = bundles % 1;

            if (decimalPart <= 0.5) {
                bundles = Math.floor(bundles);
            } else {
                bundles = Math.ceil(bundles);
            }

            bundles = Math.max(1, bundles);
            deliveryCharges = bundles * 250;
        }

        total += deliveryCharges;
    }

    // Build orderSummary for email (New Structured Format for ERP)
    let orderSummary = "ORDER_DATA_START\n";
    orderSummary += "---CUSTOMER_INFO---\n";
    orderSummary += `Name: ${name}\n`;
    orderSummary += `Phone: ${phone}\n`;

    const nowTime = new Date();
    const formattedDate = `${String(nowTime.getDate()).padStart(2, '0')}/${String(nowTime.getMonth() + 1).padStart(2, '0')}/${nowTime.getFullYear()} ${String(nowTime.getHours()).padStart(2, '0')}:${String(nowTime.getMinutes()).padStart(2, '0')}`;
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

        // Dynamic ERP formatting logic based on packing type
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
        if (i.isSuggested) {
            orderSummary += `SuggestTag: (Suggest)\n`;
        }
        orderSummary += `[ITEM_END]\n\n`;
    });
    orderSummary += "ORDER_DATA_END";

    // Prepare order data for Google Sheets
    const orderData = {
        orderId: orderId,
        invoiceLink: invoiceLink,
        customerName: name,
        customerPhone: phone,
        customerEmail: email || '',
        shippingMethod: shipping === "self" ? "Self Pickup" : (shipping === "open" ? "Delivery - Open" : "Delivery - Bundle"),
        paymentMethod: document.querySelector('input[name="payment"]:checked').value === "bank" ? "Bank Transfer" : "Pay at Shop",
        deliveryAddress: address || '',
        orderItems: orderItems,
        totalAmount: total,
        totalWeight: Math.round(totalWeight),
        subtotal: total - deliveryCharges,
        deliveryCharges: deliveryCharges
    };

    try {
        // --- ONE-CLICK BULLETPROOF LOGIC ---

        // 1. Prepare WhatsApp Message
        let whatsappMessage = `📦 *NEW ORDER - HAYYAT PAPER STORE*\n\n`;
        whatsappMessage += `Order #${orderId}\n`;
        whatsappMessage += `Customer: ${name}\n`;
        whatsappMessage += `Phone: ${phone}\n\n`;
        whatsappMessage += `📋 *VIEW ORDER DETAILS & TRACKING:*\n`;
        whatsappMessage += `${invoiceLink}\n\n`;
        whatsappMessage += `⚠️ *DO NOT EDIT THIS LINK*`;

        let whatsappNumber = ((shipping === "open" || shipping === "bundle") &&
            document.querySelector('input[name="payment"]:checked').value === "bank")
            ? "923046470666" : "923036470666";
        const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`;

        // Track GA Event: Purchase (WhatsApp Order)
        if (typeof gtag === 'function') {
            gtag('event', 'purchase', {
                transaction_id: orderId,
                value: total,
                currency: 'PKR',
                shipping: deliveryCharges,
                items: Object.values(cart).map(i => ({
                    item_name: i.name,
                    item_id: i.id,
                    price: i.price,
                    quantity: i.qty
                }))
            });
        }

        // 2. OPEN WHATSAPP (Desktop: New Tab | Mobile: Switch App)
        window.open(whatsappUrl, '_blank');

        // 3. WAIT FOR SAVES TO FINISH (Bulletproof Logic)
        // This prevents the page reload from killing the save request halfway through.
        await saveOrderToGoogleSheets(orderData);

        const emailData = {
            customerName: name,
            customerPhone: phone,
            customerEmail: email || 'Not provided',
            shippingMethod: shipping === "self" ? "Self Pickup" : (shipping === "open" ? "Delivery - Open" : "Delivery - Bundle"),
            paymentMethod: document.querySelector('input[name="payment"]:checked').value === "bank" ? "Bank Transfer" : "Pay at Shop",
            deliveryAddress: address || 'Not applicable',
            orderSummary: orderSummary,
            orderTotal: total,
            orderWeight: Math.round(totalWeight)
        };

        await fetch('https://script.google.com/macros/s/AKfycbxR_N_bqa1efcT7gmSF2kprsOIRJoC82oiUk-Wg_i2HYJYvFazaoqLXXZ63ZMI2FCQu3g/exec', {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(emailData)
        });

        // 4. UI SUCCESS & REFRESH
        btn.innerHTML = '<span class="whatsapp-icon">✅</span> Order Saved!';
        setTimeout(() => {
            localStorage.removeItem('hayyat_cart'); // Clear persisted cart
            window.location.reload(); // Hard refresh to latest version
        }, 2500); // Give user enough time to see the success state

    } catch (error) {
        console.error('Order error:', error);
        alert('Error saving order. Please try again or contact support.');
        btn.disabled = false;
        btn.innerHTML = 'Place Order via WhatsApp';
    }
}

// Function to save order to Google Sheets
async function saveOrderToGoogleSheets(orderData) {
    const scriptUrl = 'https://script.google.com/macros/s/AKfycbysHbzMzacuCiZp16PJO5Gnx8kN2asM2Te4yDavvSdXRUN2jfUwRvc-LCjRvKPGXbsG/exec';

    const response = await fetch(scriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            action: 'createOrder',
            order: orderData
        })
    });

    // Note: no-cors mode doesn't allow reading response
    // Assume success if no network error
    return { success: true };
}
// Handle window resize
window.addEventListener('resize', function () {
    if (window.innerWidth > 768) {
        document.body.style.overflow = "auto"
    }
})
// Add CSS for textarea
const style = document.createElement('style')
style.textContent = `
    #delivery-address {
        width: 100%;
        padding: 14px;
        border: 1px solid var(--medium-gray);
        border-radius: 6px;
        box-sizing: border-box;
        font-size: 1em;
        font-family: 'Roboto', sans-serif;
        resize: vertical;
        min-height: 100px;
        transition: border-color 0.2s;
    }
    #delivery-address:focus {
        border-color: var(--primary);
        outline: none;
        box-shadow: 0 0 0 2px rgba(0, 76, 153, 0.1);
    }
`

/**
 * Generates dynamic Structured Data for Google.
 * This tells Google about all categories loaded from the Sheet, even if they aren't in the static sitemap.
 */
function generateDynamicSchema(groups) {
    const categories = Object.keys(groups);
    if (categories.length === 0) return;

    // Create ItemList for categories
    const schema = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": "Hayyat Paper Categories",
        "itemListElement": categories.map((cat, index) => ({
            "@type": "ListItem",
            "position": index + 1,
            "url": `https://www.hayyatstore.com/#cat_${safeKey(cat)}`,
            "name": cat
        }))
    };

    // Remove old dynamic schema if it exists
    const oldSchema = document.getElementById('dynamic-category-schema');
    if (oldSchema) oldSchema.remove();

    // Inject into head
    const script = document.createElement('script');
    script.id = 'dynamic-category-schema';
    script.type = 'application/ld+json';
    script.text = JSON.stringify(schema);
    document.head.appendChild(script);

    console.log("SEO: Dynamic Category Schema Injected for", categories.length, "categories.");
}

// --- SEO & DEEP LINKING CONFIG ---
const ORIGINAL_TITLE = document.title;
const ORIGINAL_DESCRIPTION = document.querySelector('meta[name="description"]')?.content || "";

/**
 * Updates the page title and meta description based on the active category.
 * Target pattern: [Category Name] Wholesale Rates in Pakistan | Hayyat Paper Store
 */
function updateSEO(categoryName) {
    if (categoryName) {
        const dynamicTitle = `${categoryName} Wholesale Rates in Pakistan | Hayyat Paper Store`;
        const dynamicDesc = `Get competitive wholesale prices for ${categoryName} at Hayyat Paper Store. Nationwide delivery across Pakistan, including Karachi, Lahore, Islamabad, Faisalabad, and more. Trusted paper solutions since 1990.`;

        document.title = dynamicTitle;
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) metaDesc.setAttribute("content", dynamicDesc);

        // --- GOOGLE ANALYTICS TRACKING ---
        if (typeof gtag === 'function') {
            gtag('event', 'page_view', {
                page_title: dynamicTitle,
                page_location: window.location.href,
                page_path: window.location.pathname + window.location.hash
            });
        }
    } else {
        document.title = ORIGINAL_TITLE;
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) metaDesc.setAttribute("content", ORIGINAL_DESCRIPTION);

        // Track return to home
        if (typeof gtag === 'function') {
            gtag('event', 'page_view', {
                page_title: ORIGINAL_TITLE,
                page_location: window.location.href,
                page_path: window.location.pathname
            });
        }
    }
}

/**
 * Checks the URL hash and expands the corresponding category.
 * Now wait for a split second to ensure CSS/Rendering is complete.
 */
function handleInitialHash() {
    const hash = window.location.hash.substring(1); // Remove #
    if (hash && hash.startsWith('cat_')) {
        const catKey = hash.replace('cat_', '');
        // Give the browser a moment to finish layout
        requestAnimationFrame(() => {
            const section = document.getElementById(`section-${catKey}`);
            if (section && !section.classList.contains('focused')) {
                console.log("SEO: Deep link detected, opening category:", catKey);
                toggleCategory(catKey);
            }
        });
    }
}

// Listen for back/forward navigation
window.addEventListener('hashchange', () => {
    const hash = window.location.hash.substring(1);
    const focused = document.querySelector('.category-section.focused');

    if (!hash && focused) {
        // If we went back to home, close focus mode
        const catKey = focused.id.replace('section-', '');
        toggleCategory(catKey);
    } else if (hash && hash.startsWith('cat_')) {
        const catKey = hash.replace('cat_', '');
        if (!focused || focused.id !== `section-${catKey}`) {
            toggleCategory(catKey);
        }
    }
});

// Helper to manage clicks on category sections
function handleSectionClick(event, categoryKey) {
    const section = document.getElementById(`section-${categoryKey}`);
    const isFocused = section.classList.contains("focused");

    // If clicking a sub-category header inside Clearance, don't trigger main section toggle
    if (event.target.closest('.sub-header')) {
        event.stopPropagation();
        return;
    }

    // If clicking header OR if not focused yet, toggle it
    if (event.target.closest('.category-header') || !isFocused) {
        toggleCategory(categoryKey);
    }
}

/**
 * Toggles sub-categories inside the Clearance Sale section.
 * Mimics the main category "Focus Mode" behavior.
 */
function toggleClearanceSub(event, subCatKey) {
    event.stopPropagation();
    const section = document.getElementById(`sub-section-${subCatKey}`);
    const content = document.getElementById(`sub-content-${subCatKey}`);
    const parent = section.parentElement; // The main Clearance products container
    const isExpanded = section.classList.contains("expanded");

    if (isExpanded) {
        // CLOSE SUB-TILE
        section.classList.remove("expanded");
        content.style.maxHeight = "0px";

        // Show all other sub-tiles in this section
        parent.querySelectorAll('.clearance-sub-tile').forEach(t => {
            t.classList.remove("hidden-sub");
        });
    } else {
        // OPEN SUB-TILE
        // Hide other sub-tiles
        parent.querySelectorAll('.clearance-sub-tile').forEach(t => {
            if (t.id !== `sub-section-${subCatKey}`) {
                t.classList.add("hidden-sub");
            }
        });

        section.classList.add("expanded");
        content.style.maxHeight = "10000px";

        // Scroll to the top of the clearance section
        const mainSection = document.getElementById('section-Clearance_Sale');
        if (mainSection) {
            window.scrollTo({ top: mainSection.offsetTop - 20, behavior: 'smooth' });
        }
    }
}

// Category Dashboard -> Focus Mode transition
function toggleCategory(categoryKey) {
    const wrap = document.getElementById("product-list");
    const section = document.getElementById(`section-${categoryKey}`);
    const productsDiv = document.getElementById(`cat-${categoryKey}`);
    const isFocused = section.classList.contains("focused");

    if (isFocused) {
        // EXIT FOCUS MODE (Back to Dashboard)
        wrap.classList.remove("focus-mode");
        section.classList.remove("focused");

        // Show all other top-level sections
        wrap.querySelectorAll(':scope > .category-section').forEach(s => {
            s.classList.remove("hidden");
        });

        productsDiv.style.maxHeight = "0";

        // SEO and URL Update
        updateSEO(null);
        if (window.location.hash) {
            history.pushState(null, null, ' '); // Remove hash without jump
        }

        // Scroll back to where the section was
        window.scrollTo({ top: section.offsetTop - 100, behavior: 'smooth' });
    } else {
        // ENTER FOCUS MODE
        wrap.classList.add("focus-mode");

        // Hide all other top-level sections
        wrap.querySelectorAll(':scope > .category-section').forEach(s => {
            if (s.id !== `section-${categoryKey}`) {
                s.classList.add("hidden");
            }
        });

        section.classList.add("focused");
        productsDiv.style.maxHeight = "10000px";

        // SEO and URL Update
        const categoryName = section.querySelector('.category-header')?.textContent || "";
        updateSEO(categoryName);
        window.location.hash = `cat_${categoryKey}`;

        // Smooth scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}
// Expand all categories after products are loaded
function expandAllCategories() {
    const categories = document.querySelectorAll('.category-products');
    categories.forEach(catDiv => {
        catDiv.style.maxHeight = catDiv.scrollHeight + "px";
        const header = catDiv.previousElementSibling;
        if (header) header.classList.add("expanded");
    });
}
function updatePaymentButtons() {
    const shopLabel = document.querySelector('label[for="pay-shop"]');
    const bankLabel = document.querySelector('label[for="pay-bank"]');

    if (document.getElementById('pay-shop').checked) {
        shopLabel.classList.add('active');
        bankLabel.classList.remove('active');
    } else {
        bankLabel.classList.add('active');
        shopLabel.classList.remove('active');
    }
}

document.head.appendChild(style)

// ============================================================
// FEATURE 9 — Price Change Notification Banner
// ============================================================

/**
 * Slides in a non-destructive banner when a product price has changed.
 * The cart is preserved; the item is added at the updated price.
 */
function showPriceChangeBanner(productName, oldPrice, newPrice, oldRate, newRate) {
    let banner = document.getElementById('price-change-banner');

    // Create the banner element once and reuse it
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'price-change-banner';
        banner.innerHTML = `
            <div class="price-banner-content">
                <span class="price-banner-icon">&#x1F3F7;&#xFE0F;</span>
                <div class="price-banner-text">
                    <strong id="price-banner-title"></strong>
                    <small id="price-banner-body"></small>
                    <small id="price-banner-urdu"></small>
                </div>
            </div>
            <button class="price-banner-close" onclick="closePriceBanner()" title="Dismiss">&#10005;</button>
        `;
        document.body.prepend(banner);
    }

    const arrow = newPrice > oldPrice ? '&#x2191;' : '&#x2193;';
    const rateArrow = newRate > oldRate ? '&#x2191;' : '&#x2193;';

    document.getElementById('price-banner-title').innerHTML =
        `Price Updated &mdash; ${productName}`;

    document.getElementById('price-banner-body').innerHTML =
        `Packet: Rs ${oldPrice.toLocaleString()} &rarr; Rs ${newPrice.toLocaleString()} ${arrow}`
        + (oldRate && newRate ? `&nbsp;&bull;&nbsp; KG Rate: Rs ${oldRate.toLocaleString()} &rarr; Rs ${newRate.toLocaleString()} ${rateArrow}` : '')
        + `&nbsp;&bull;&nbsp; Item added at updated price.`;

    // Urdu line (RTL)
    const urduArrow = newPrice > oldPrice ? '↑' : '↓';
    const urduRateArrow = newRate > oldRate ? '↑' : '↓';
    document.getElementById('price-banner-urdu').innerHTML =
        `<span dir="rtl" style="display:block;text-align:right;font-family:'Noto Nastaliq Urdu','Jameel Noori Nastaleeq',serif;font-size:1em;font-weight:700;line-height:1.7;margin-top:5px;border-top:1px solid rgba(255,255,255,0.25);padding-top:4px;">`
        + `<strong>قیمت تبدیل ہو گئی — ${productName}</strong><br>`
        + `پیکٹ: Rs ${oldPrice.toLocaleString()} ← Rs ${newPrice.toLocaleString()} ${urduArrow}`
        + (oldRate && newRate ? `&nbsp;|&nbsp; فی کلو: Rs ${oldRate.toLocaleString()} ← Rs ${newRate.toLocaleString()} ${urduRateArrow}` : '')
        + `<br>نئی قیمت پر کارٹ میں شامل کر دیا گیا۔`
        + `</span>`;

    // Use double requestAnimationFrame so the CSS transition fires correctly
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            banner.classList.add('visible');
        });
    });

    // Auto-dismiss after 7 seconds
    clearTimeout(window._priceBannerTimer);
    window._priceBannerTimer = setTimeout(closePriceBanner, 7000);
}

function closePriceBanner() {
    const banner = document.getElementById('price-change-banner');
    if (banner) banner.classList.remove('visible');
}

// ============================================================
// FEATURE 10 — Cart Quantity Controls
// ============================================================

/**
 * Handles the + / - buttons. Calculates the correct step
 * based on the product's packing rules and calls updateCartQty.
 */
function changeCartQty(cartKey, direction) {
    const item = cart[cartKey];
    if (!item) return;

    const step = item.multiple15 ? 1.5
        : item.evenOnly ? 2
            : item.halfQty ? 0.5
                : 1;

    // Round carefully to avoid floating-point drift
    const newQty = Math.round((item.qty + direction * step) * 10000) / 10000;

    if (newQty <= 0) {
        if (confirm(`Remove "${item.name}" from cart?`)) {
            removeFromCart(cartKey);
        }
        return;
    }

    updateCartQty(cartKey, newQty);
}

/**
 * Validates and applies a new quantity to a cart item.
 * Respects all packing rules (even-only, half-qty, 1.5× multiples).
 * Also refreshes the checkout summary if the modal is open.
 */
function updateCartQty(cartKey, newQtyRaw) {
    const item = cart[cartKey];
    if (!item) return;

    const qty = parseFloat(newQtyRaw);

    // If empty or zero, offer to remove
    if (isNaN(qty) || qty <= 0) {
        if (confirm(`Remove "${item.name}" from cart?`)) {
            removeFromCart(cartKey);
        } else {
            renderCart(); // Reset the input to the previous valid value
        }
        return;
    }

    // Packing-rule validation
    const multiple15 = item.multiple15 === true;
    const evenOnly = item.evenOnly === true;
    const halfQty = item.halfQty === true;

    if (multiple15) {
        if (Math.abs((qty / 1.5) - Math.round(qty / 1.5)) > 0.001) {
            alert('150-sheet packing: please enter multiples of 1.5 (e.g. 1.5, 3, 4.5).');
            renderCart();
            return;
        }
    } else if (evenOnly) {
        if (qty % 2 !== 0) {
            alert('200-sheet packing: please enter even quantities only (e.g. 2, 4, 6).');
            renderCart();
            return;
        }
    } else if (halfQty) {
        if (Math.abs(qty * 2 - Math.round(qty * 2)) > 0.001) {
            alert('Please enter quantities in increments of 0.5 (e.g. 0.5, 1, 1.5).');
            renderCart();
            return;
        }
    } else {
        if (Math.abs(qty - Math.round(qty)) > 0.001) {
            alert('Please enter a whole number quantity.');
            renderCart();
            return;
        }
    }

    // Max-quantity guard
    if (qty > item.maxQty) {
        if (item.maxQty === item.originalMax) {
            alert(`ایک آرڈر میں زیادہ سے زیادہ ${item.maxQty} پیکٹ کی اجازت ہے۔`);
        } else {
            alert(`معذرت! اس وقت صرف ${item.maxQty} پیکٹ دستیاب ہیں۔`);
        }
        renderCart();
        return;
    }

    // All good — apply the new quantity
    cart[cartKey].qty = qty;
    renderCart();
    updateCartBadge();
    saveCart(); // Persist changes

    // Refresh checkout summary live if checkout modal is open
    const modal = document.getElementById('checkout-modal');
    if (modal && modal.classList.contains('active')) {
        if (currentShippingMethod !== 'self') {
            calculateDeliveryCharges(currentShippingMethod); // internally calls updateCheckoutTotal
        } else {
            updateCheckoutTotal(0);
        }
    }
}

/* --- BOTTOM SHEET LOGIC --- */
let currentSheetKey = null;
let selectedSheetSize = null;
let selectedSheetVariant = null;

function openVariationSheet(productKey) {
    const g = window[`g_${productKey}`];
    if (!g) return;

    currentSheetKey = productKey;
    selectedSheetSize = null;
    selectedSheetVariant = null;

    // Track GA Event: View Item (Variation Sheet Opened)
    if (typeof gtag === 'function') {
        gtag('event', 'view_item', {
            currency: 'PKR',
            value: g.variations[0].price,
            items: [{
                item_name: g.name,
                item_id: g.variations[0].id,
                item_category: g.variations[0].category
            }]
        });
    }

    document.getElementById('sheet-title').innerText = g.name;
    document.getElementById('sheet-qty').value = g.variations[0].multiple15 ? '1.5' : (g.variations[0].evenOnly ? '2' : '1');
    document.getElementById('sheet-qty').step = getQuantityStep(g.variations[0]);

    renderSheetBody(productKey);

    // Auto-select first size to show weights immediately
    const sizes = [...new Set(g.variations.map(v => v.size))];
    if (sizes.length > 0) {
        selectSheetSize(sizes[0]);
    }

    updateSheetUI();

    document.getElementById('variation-sheet-overlay').classList.add('active');
    document.getElementById('variation-sheet').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeVariationSheet() {
    document.getElementById('variation-sheet-overlay').classList.remove('active');
    document.getElementById('variation-sheet').classList.remove('active');
    document.body.style.overflow = 'auto';
}

function renderSheetBody(productKey) {
    const g = window[`g_${productKey}`];
    const body = document.getElementById('sheet-body');
    const sizes = [...new Set(g.variations.map(v => v.size))];

    let html = `
        <span class="variation-group-title">SELECT SIZE (INCHES)</span>
        <div class="chip-grid">
            ${sizes.map(s => `<div class="chip-btn" onclick="selectSheetSize('${s}')" id="chip-${s}">${s}</div>`).join('')}
        </div>
        <div id="weight-selection-area" style="display: none;">
            <span class="variation-group-title">SELECT WEIGHT (GSM)</span>
            <div class="weight-list" id="weight-list"></div>
        </div>
    `;
    body.innerHTML = html;
}

function selectSheetSize(size) {
    selectedSheetSize = size;
    selectedSheetVariant = null;

    // Update Chips UI
    document.querySelectorAll('.chip-btn').forEach(btn => btn.classList.remove('active'));
    const selectedChip = document.getElementById(`chip-${size}`);
    if (selectedChip) selectedChip.classList.add('active');

    // Show Weight area
    const weightArea = document.getElementById('weight-selection-area');
    weightArea.style.display = 'block';

    // Render Weight List
    const g = window[`g_${currentSheetKey}`];
    const variations = g.variations.filter(v => v.size === size);

    const weightList = document.getElementById('weight-list');
    weightList.innerHTML = variations.map(v => {
        const lookupKey = v.displaySize ? (v.color ? `${v.size}_${v.gsm}_${v.displaySize}_${v.color}` : `${v.size}_${v.gsm}_${v.displaySize}`) : (v.color ? `${v.size}_${v.gsm}_${v.color}` : `${v.size}_${v.gsm}`);

        let label = `${v.gsm} GSM`;
        if (v.displaySize) label = `${v.displaySize} - ${label}`;
        if (v.color) label += ` (${v.color})`;

        // Restore color-specific styling
        const style = v.color ? getColorStyle(v.color) : '';

        // Add badges if present
        let badges = '';
        if (v.discountTag && v.newTag) {
            badges += `<span class="badge-on-btn badge-discounted" style="right: 25px;">${v.discountTag.substring(0, 4)}</span>`;
            badges += `<span class="badge-on-btn badge-new" style="right: -5px;">${v.newTag.substring(0, 3)}</span>`;
        } else if (v.discountTag) {
            badges += `<span class="badge-on-btn badge-discounted" style="right: -5px;">${v.discountTag.substring(0, 4)}</span>`;
        } else if (v.newTag) {
            badges += `<span class="badge-on-btn badge-new" style="right: -5px;">${v.newTag.substring(0, 3)}</span>`;
        }

        return `
            <div class="weight-item" onclick="selectSheetWeight('${lookupKey}')" id="weight-${lookupKey}" style="${style}">
                ${badges}
                <div class="weight-label">
                    <span>${label}</span>
                </div>
            </div>
        `;
    }).join('');

    updateSheetUI();

    // Auto-scroll to weights
    weightArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function selectSheetWeight(lookupKey) {
    selectedSheetVariant = window[`map_${currentSheetKey}`][lookupKey];

    // Update Weight UI
    document.querySelectorAll('.weight-item').forEach(item => item.classList.remove('active'));
    const selectedItem = document.getElementById(`weight-${lookupKey}`);
    if (selectedItem) selectedItem.classList.add('active');

    // Update Quantity Input Step and Min based on selected variant
    const qtyInput = document.getElementById('sheet-qty');
    const step = getQuantityStep(selectedSheetVariant);
    qtyInput.step = step;
    qtyInput.min = step;

    // Adjust current quantity if it doesn't match the new step/min
    let currentQty = parseFloat(qtyInput.value);
    const stepNum = parseFloat(step);

    if (isNaN(currentQty) || currentQty < stepNum) {
        qtyInput.value = step;
    } else {
        // Ensure quantity is a multiple of the step
        const remainder = currentQty % stepNum;
        if (remainder > 0.001 && (stepNum - remainder) > 0.001) {
            // If it doesn't match, round to nearest valid multiple
            qtyInput.value = Math.max(stepNum, Math.round(currentQty / stepNum) * stepNum);
        }
    }

    updateSheetUI();
}

function updateSheetUI() {
    const addBtn = document.getElementById('sheet-add-btn');
    const priceDisplay = document.getElementById('sheet-price');
    const qtyInput = document.getElementById('sheet-qty');
    const compBox = document.getElementById('sheet-comparison-box');
    const altList = document.getElementById('sheet-alt-list');
    const qty = parseFloat(qtyInput.value) || 1;

    if (selectedSheetVariant) {
        addBtn.disabled = false;
        const rateDisplay = document.getElementById('sheet-rate');
        const currentPrice = selectedSheetVariant.price;

        if (rateDisplay) {
            rateDisplay.innerText = `Rs ${selectedSheetVariant.rate}/KG`;
            rateDisplay.style.display = 'block';
        }

        priceDisplay.innerText = `Rs ${Math.round(currentPrice * qty)}`;
        priceDisplay.style.display = 'block';

        // --- CHEAPER OPTIONS LOGIC ---
        const cat = window[`category_${currentSheetKey}`];
        const excludedCats = ["Copy Paper", "Stickers", "Carbonless", "Colour Card"];

        // Check for color variations in the current product group
        const g = window[`g_${currentSheetKey}`];
        const hasColors = g.variations.some(v => v.color && v.color.trim() !== "");

        if (!excludedCats.includes(cat) && !hasColors && globalProducts[cat]) {
            const cheaperAlternatives = globalProducts[cat].items.filter(item => {
                const currentOrigCat = selectedSheetVariant.originalCategory || selectedSheetVariant.category;
                const itemOrigCat = item.originalCategory || item.category;
                return item.size === selectedSheetSize &&
                    item.gsm === selectedSheetVariant.gsm &&
                    item.name !== g.name &&
                    parseFloat(item.price) < currentPrice &&
                    currentOrigCat === itemOrigCat;
            });

            if (cheaperAlternatives.length > 0) {
                compBox.style.display = 'block';
                altList.innerHTML = cheaperAlternatives.map(alt => {
                    const savingsPerUnit = currentPrice - parseFloat(alt.price);
                    const totalSavings = savingsPerUnit * qty;
                    const targetKey = safeKey(cat + "_" + alt.name);
                    return `
                        <a href="javascript:void(0)" class="alt-item" onclick="jumpToAltFromSheet('${targetKey}', '${selectedSheetSize}', '${selectedSheetVariant.gsm}')">
                            <span class="alt-name">${alt.displaySize || alt.name}</span>
                            <div class="alt-info-wrapper">
                                <div class="alt-price-stack">
                                    <span class="alt-packet-price">Rs ${alt.price}</span>
                                    <span class="alt-kg-rate">${alt.rate}/KG</span>
                                </div>
                                <span class="alt-savings">Save Rs ${totalSavings.toFixed(0)}</span>
                                <span class="alt-arrow">→</span>
                            </div>
                        </a>
                    `;
                }).join('');
            } else {
                compBox.style.display = 'none';
            }
        } else {
            compBox.style.display = 'none';
        }
    } else {
        addBtn.disabled = true;
        const rateDisplay = document.getElementById('sheet-rate');
        if (rateDisplay) rateDisplay.style.display = 'none';
        priceDisplay.style.display = 'none';
        compBox.style.display = 'none';
    }
}

function jumpToAltFromSheet(targetKey, size, gsm) {
    // 1. Close current sheet
    closeVariationSheet();

    // 2. Small delay then open new sheet for target brand
    setTimeout(() => {
        openVariationSheet(targetKey);

        // 3. Auto-select size
        setTimeout(() => {
            selectSheetSize(size);

            // 4. Auto-select GSM/Weight
            setTimeout(() => {
                const lookupKey = `${size}_${gsm}`;
                // Try variants with brand if it's Copy Paper etc
                const g = window[`g_${targetKey}`];
                let finalKey = lookupKey;
                const variants = g.variations.filter(v => v.size === size && v.gsm === gsm);
                if (variants.length > 0) {
                    const v = variants[0];
                    finalKey = v.displaySize ? `${v.size}_${v.gsm}_${v.displaySize}` : `${v.size}_${v.gsm}`;
                }

                selectSheetWeight(finalKey);
            }, 300);
        }, 300);
    }, 300);
}

function changeSheetQty(direction) {
    const qtyInput = document.getElementById('sheet-qty');
    const step = parseFloat(qtyInput.step) || 1;
    let val = parseFloat(qtyInput.value) || 1;

    val = Math.max(step, val + (direction * step));
    qtyInput.value = val;
    updateSheetUI();
}

async function addFromSheetToCart() {
    if (!selectedSheetVariant) return;

    const qty = parseFloat(document.getElementById('sheet-qty').value);
    const productKey = currentSheetKey;
    const p = selectedSheetVariant;


    // Stock check
    if (qty > p.maxQty) {
        alert(`Sorry, only ${p.maxQty} packets available.`);
        return;
    }

    // === LIVE PRICE CHECK (Before adding to cart) ===
    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}!A1:AD?key=${API_KEY}&_=${Date.now()}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.values) {
            const productRows = data.values.slice(1);
            const sizeParts = p.size.split('x');
            const length = sizeParts[0];
            const width = sizeParts[1];

            // Search for the variation in live data
            const freshProduct = productRows.find(row => {
                const rowName = (row[COL.NAME] || '').trim().toLowerCase();
                const targetName = p.name.trim().toLowerCase();
                const rowBrand = (row[COL.DISPLAY_SIZE] || '').trim().toLowerCase();
                const targetBrand = (p.displaySize || '').trim().toLowerCase();
                const rowSizeMatch = row[COL.LENGTH] == length && row[COL.WIDTH] == width;
                const rowGsmMatch = row[COL.GSM] == p.gsm;

                // NEW: Color match for separate color rows
                const rowColorString = (row[COL.COLOR_OPTIONS] || '').trim().toLowerCase();
                const targetColor = (p.color || '').trim().toLowerCase();
                const colorMatch = !targetColor || rowColorString.split(',').map(c => c.trim()).includes(targetColor);

                return rowName === targetName && rowSizeMatch && rowGsmMatch && rowBrand === targetBrand && colorMatch;
            });

            if (freshProduct) {
                const freshPrice = Math.round(parseFloat(freshProduct[COL.PRICE] || 0));
                const currentPrice = p.price;
                const freshRate = freshProduct[COL.RATE] || p.rate;

                if (freshPrice > 0 && currentPrice > 0 && freshPrice !== currentPrice) {
                    const oldRate = parseFloat(p.rate) || 0;
                    const newRate = parseFloat(freshRate) || 0;

                    // Update global map and current reference
                    Object.keys(window[`map_${productKey}`] || {}).forEach(mKey => {
                        const entry = window[`map_${productKey}`][mKey];
                        if (entry && entry.id === p.id) {
                            entry.price = freshPrice;
                            entry.rate = freshRate;
                        }
                    });

                    p.price = freshPrice;
                    p.rate = freshRate;

                    // Notify user
                    showPriceChangeBanner(p.name, currentPrice, freshPrice, oldRate, newRate);

                    // Update sheet UI price display
                    if (document.getElementById('sheet-price')) {
                        document.getElementById('sheet-price').innerHTML = `
                            <div class="button-price-stack">
                                <span class="button-rate-label">Rs ${p.rate}/KG</span>
                                <span class="button-price-label">Rs ${Math.round(freshPrice * qty)}</span>
                            </div>
                        `;
                    }
                }
            }
        }
    } catch (e) {
        console.log('Live price check failed:', e);
    }
    // === END PRICE CHECK ===

    // --- PACKING RULE VALIDATION ---
    const allowHalf = p.halfQty === true;
    const evenOnly = p.evenOnly === true;
    const multiple15 = p.multiple15 === true;

    if (multiple15) {
        if (Math.abs((qty / 1.5) - Math.round(qty / 1.5)) > 0.001) {
            alert("150 SHEETS Packing: Please enter multiples of 1.5 only (1.5, 3, 4.5, etc.).");
            return;
        }
    } else if (evenOnly) {
        if (qty % 2 !== 0) {
            alert("200 SHEETS Packing: Please enter even quantities only (2, 4, 6, etc.).");
            return;
        }
    } else if (allowHalf) {
        if (Math.abs(qty * 2 - Math.round(qty * 2)) > 0.001) {
            alert("Please enter a quantity in increments of 0.5 (e.g., 0.5, 1.0, 1.5).");
            return;
        }
    } else {
        if (Math.abs(qty - Math.round(qty)) > 0.001) {
            alert("Please enter a whole number quantity.");
            return;
        }
    }
    // --- END VALIDATION ---

    // Create unique cart key - Category-Independent to prevent duplicates
    // We identify the item solely by its physical properties (Name, Size, GSM, Brand, Color)
    const cartKey = safeKey(p.name.trim() + "_" + p.size + "_" + p.gsm +
        (p.displaySize ? "_" + p.displaySize : "") +
        (p.color ? "_" + p.color : ""));

    const cartItem = {
        ...p,
        qty: qty,
        selectedColor: p.color || '',
        selectedBrand: p.displaySize || '',
        isSuggested: false
    };

    if (cart[cartKey]) {
        const newQty = cart[cartKey].qty + qty;
        if (newQty > p.maxQty) {
            alert(`Max limit reached. Total in cart: ${cart[cartKey].qty}`);
            return;
        }
        cart[cartKey].qty = newQty;
    } else {
        cart[cartKey] = cartItem;
    }

    renderCart();
    updateCartBadge();
    saveCart();

    // Track GA Event: Add to Cart (from Sheet)
    if (typeof gtag === 'function') {
        gtag('event', 'add_to_cart', {
            currency: 'PKR',
            value: p.price * qty,
            items: [{
                item_name: p.name,
                item_id: p.id,
                price: p.price,
                quantity: qty,
                item_brand: p.displaySize || '',
                item_variant: `${p.size} ${p.gsm}gsm ${p.color || ''}`.trim(),
                item_category: p.category
            }]
        });
    }

    // ✅ Trail of Light Animation (from Sheet)
    try {
        const addBtn = document.getElementById('sheet-add-btn');
        const cartBtn = document.getElementById('view-cart-btn');
        if (addBtn && cartBtn) {
            animateToCart(addBtn, cartBtn);
            showSuccessCheckmark();
        }
    } catch (e) { console.error("Animation failed", e); }

    // Success feedback on button
    const addBtn = document.getElementById('sheet-add-btn');
    const originalText = addBtn.innerHTML;
    addBtn.innerHTML = '<span>Added!</span>';
    addBtn.style.backgroundColor = '#1f8b3b';

    setTimeout(() => {
        addBtn.innerHTML = originalText;
        addBtn.style.backgroundColor = '';
        // closeVariationSheet(); 
    }, 800);
}

// ============================================================
// CUSTOM SIZE ORDERING LOGIC
// ============================================================

async function fetchCustomRolls() {
    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${CUSTOM_SHEET_NAME}!A2:J?key=${API_KEY}`;
        const response = await fetch(url);
        if (!response.ok) return;

        const data = await response.json();
        if (!data.values) return;

        // Group by Category -> Brand -> GSM
        // Category(0), Brand(1), GSM(2), MOQ_KG(3), Width(4), Rate_KG(5), Sheets_Per_Pkt(6), Availability(8), Erp(9)
        const grouped = {};
        data.values.forEach(r => {
            if (r[8]?.toUpperCase() !== "YES") return;
            const cat = r[0];
            const brand = r[1] || "Generic";
            const gsm = r[2];

            if (!grouped[cat]) grouped[cat] = {};
            if (!grouped[cat][brand]) grouped[cat][brand] = {};
            if (!grouped[cat][brand][gsm]) grouped[cat][brand][gsm] = [];

            grouped[cat][brand][gsm].push({
                category: cat,
                brand: brand,
                gsm: gsm,
                moq_kg: parseFloat(r[3]) || 500,
                rollWidth: r[4],
                rate_kg: parseFloat(r[5]) || 0,
                sheetsPerPkt: parseInt(r[6]) || 500,
                erp: r[9]
            });
        });
        customRollData = grouped;
    } catch (e) { console.error("Custom rolls fetch failed", e); }
}

function showCustomView() {
    document.getElementById('custom-size-view').classList.add('active');
    document.body.style.overflow = 'hidden'; // Stop scroll
    renderCustomCategories();
}

function hideCustomView() {
    document.getElementById('custom-size-view').classList.remove('active');
    document.body.style.overflow = '';
    resetCustomView(); // Start fresh next time
}

function resetCustomView() {
    selectedCustomCategory = null;
    selectedCustomBrand = null;
    selectedCustomRoll = null;

    // Clear all inputs and placeholders
    const inputs = ['custom-len', 'custom-wid', 'custom-qty', 'custom-name', 'custom-phone'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.value = '';
            el.placeholder = (id === 'custom-qty') ? 'Min' : '0';
        }
    });

    // Remove "active" class from all chips
    document.querySelectorAll('.custom-view .chip').forEach(chip => {
        chip.classList.remove('active');
    });

    // Hide sections
    document.getElementById('custom-brand-section').style.display = 'none';
    document.getElementById('custom-gsm-section').style.display = 'none';
    document.getElementById('custom-dim-section').style.display = 'none';
    document.getElementById('custom-info-section').style.display = 'none';
    document.getElementById('custom-quote-card').style.display = 'none';

    // Reset sidebar labels
    document.getElementById('quote-moq').innerText = '--';
    document.getElementById('quote-total').innerText = 'Rs 0';
    if (document.getElementById('quote-rate')) document.getElementById('quote-rate').innerText = '--';
    if (document.getElementById('quote-packet-rate')) document.getElementById('quote-packet-rate').innerText = '--';

    const userQtyRow = document.getElementById('quote-user-qty-row');
    if (userQtyRow) userQtyRow.style.display = 'none';
}

function renderCustomCategories() {
    const list = document.getElementById('custom-cat-list');
    list.innerHTML = Object.keys(customRollData).map(cat => `
        <div class="chip ${selectedCustomCategory === cat ? 'active' : ''}" 
             onclick="selectCustomCategory('${cat}')">${cat}</div>
    `).join('');
}

function selectCustomCategory(cat) {
    selectedCustomCategory = cat;
    selectedCustomBrand = null;
    selectedCustomRoll = null;
    renderCustomCategories();

    // Reset following steps
    document.getElementById('custom-brand-section').style.display = 'block';
    document.getElementById('custom-gsm-section').style.display = 'none';
    document.getElementById('custom-dim-section').style.display = 'none';
    document.getElementById('custom-info-section').style.display = 'none';
    document.getElementById('custom-quote-card').style.display = 'none';

    const brandList = document.getElementById('custom-brand-list');
    const brands = Object.keys(customRollData[cat]);
    brandList.innerHTML = brands.map(brand => `
        <div class="chip" onclick="selectCustomBrand('${brand}')">${brand}</div>
    `).join('');
}

function selectCustomBrand(brand) {
    selectedCustomBrand = brand;
    selectedCustomRoll = null;

    // Update active states
    const chips = document.querySelectorAll('#custom-brand-list .chip');
    chips.forEach(c => c.classList.remove('active'));

    // Logic to find which chip was clicked
    const clickedChip = Array.from(chips).find(c => c.innerText === brand);
    if (clickedChip) clickedChip.classList.add('active');

    document.getElementById('custom-gsm-section').style.display = 'block';
    document.getElementById('custom-dim-section').style.display = 'none';
    document.getElementById('custom-info-section').style.display = 'none';

    const gsmList = document.getElementById('custom-gsm-list');
    const gsms = Object.keys(customRollData[selectedCustomCategory][brand]);
    gsmList.innerHTML = gsms.map(gsm => `
        <div class="chip" onclick="selectCustomGsm('${gsm}')">${gsm} GSM</div>
    `).join('');
}

function selectCustomGsm(gsm) {
    // Pick the first roll option for this Category -> Brand -> GSM
    selectedCustomRoll = customRollData[selectedCustomCategory][selectedCustomBrand][gsm][0];

    // Update active states
    const chips = document.querySelectorAll('#custom-gsm-list .chip');
    chips.forEach(c => c.classList.remove('active'));
    event.target.classList.add('active');

    document.getElementById('custom-dim-section').style.display = 'block';
    document.getElementById('custom-info-section').style.display = 'block';
    document.getElementById('custom-quote-card').style.display = 'block';

    calculateCustomQuote('size');
}

function calculateCustomQuote(source) {
    if (!selectedCustomRoll) return;

    const L = parseFloat(document.getElementById('custom-len').value) || 0;
    const W = parseFloat(document.getElementById('custom-wid').value) || 0;
    const name = document.getElementById('custom-name').value.trim();
    const phone = document.getElementById('custom-phone').value.trim();
    const gsm = parseFloat(selectedCustomRoll.gsm);
    const rate = selectedCustomRoll.rate_kg;
    const sheetsPerPkt = selectedCustomRoll.sheetsPerPkt;
    const moq_kg = selectedCustomRoll.moq_kg;

    if (L > 0 && W > 0) {
        // MATH: Weight (KG) = (L * W * GSM) / 1,550,000
        const sheetWeight = (L * W * gsm) / 1550000;
        const pktWeight = sheetWeight * sheetsPerPkt;

        // MOQ (Packets) = MOQ_KG / pktWeight
        const moqPkts = Math.ceil(moq_kg / pktWeight);
        const pktPrice = Math.round(pktWeight * rate);

        // Manage Quantity Input
        const qtyInput = document.getElementById('custom-qty');
        qtyInput.placeholder = moqPkts; // Set greyed out minimum

        let enteredQty = parseInt(qtyInput.value) || 0;

        // Reset if size changed, otherwise let user type freely
        if (source === 'size') {
            qtyInput.value = moqPkts;
            enteredQty = moqPkts;
        }

        // Calculation uses the HIGHER of (entered quantity) or (MOQ)
        const finalQtyForMath = Math.max(enteredQty, moqPkts);

        const totalWeight = pktWeight * finalQtyForMath;

        document.getElementById('quote-moq').innerText = `${moqPkts} Packets`;

        // Show "Your Order" row for clarity
        const userQtyRow = document.getElementById('quote-user-qty-row');
        const userQtyText = document.getElementById('quote-user-qty');
        if (userQtyRow) {
            userQtyRow.style.display = 'flex';
            if (enteredQty > 0 && enteredQty < moqPkts) {
                userQtyText.innerHTML = `${enteredQty} <span style="font-size: 0.8rem; color: #e67e22;">(Min ${moqPkts} applied)</span>`;
            } else {
                userQtyText.innerText = `${enteredQty || moqPkts} Packets`;
                userQtyText.style.color = '#28a745';
            }
        }

        document.getElementById('quote-rate').innerText = `Rs ${rate}/KG`;
        document.getElementById('quote-packet-rate').innerText = `Rs ${pktPrice.toLocaleString()}/Pkt`;
        document.getElementById('quote-weight').innerText = `${totalWeight.toFixed(1)} KG`;
        document.getElementById('quote-total').innerText = `Rs ${(pktPrice * finalQtyForMath).toLocaleString()}`;

        // Enable submit button if info is provided
        const btn = document.getElementById('custom-submit-btn');
        if (name && phone && phone.length > 7) {
            btn.disabled = false;
        } else {
            btn.disabled = true;
        }
    } else {
        document.getElementById('quote-moq').innerText = '--';
        document.getElementById('quote-total').innerText = 'Rs 0';
        document.getElementById('custom-submit-btn').disabled = true;
    }
}

async function submitCustomQuote() {
    const L = document.getElementById('custom-len').value;
    const W = document.getElementById('custom-wid').value;
    const qtyInput = document.getElementById('custom-qty');
    const name = document.getElementById('custom-name').value;
    const phone = document.getElementById('custom-phone').value;
    const total = document.getElementById('quote-total').innerText;
    const btn = document.getElementById('custom-submit-btn');

    // FINAL VALIDATION
    const moq = parseInt(qtyInput.placeholder);
    let qty = parseInt(qtyInput.value) || 0;

    if (qty < moq) {
        alert(`Note: The minimum order for this size is ${moq} packets. We have updated your request to the minimum.`);
        qtyInput.value = moq;
        qty = moq;
        calculateCustomQuote('qty');
        return; // Let user see the update before sending
    }

    btn.disabled = true;
    btn.innerHTML = 'Sending...';

    const kgRate = document.getElementById('quote-rate').innerText;
    const pktRate = document.getElementById('quote-packet-rate').innerText;
    const weight = document.getElementById('quote-weight').innerText;

    // 1. FORMAT WHATSAPP MESSAGE
    const msg = `*NEW CUSTOM QUOTE REQUEST*\n` +
        `--------------------------\n` +
        `👤 Name: ${name}\n` +
        `📞 Phone: ${phone}\n` +
        `📄 Paper: ${selectedCustomCategory}\n` +
        `🏷️ Brand: ${selectedCustomBrand}\n` +
        `⚖️ GSM: ${selectedCustomRoll.gsm}\n` +
        `📏 Size: ${L} x ${W} inches\n` +
        `📦 Quantity: ${qty} Packets\n` +
        `⚖️ Rate: ${kgRate}\n` +
        `📦 Rate: ${pktRate}\n` +
        `⚖️ Total Weight: ${weight}\n` +
        `💰 Est. Total: ${total}\n` +
        `--------------------------\n` +
        `_Technical review pending._`;

    const whatsappUrl = `https://wa.me/923036470666?text=${encodeURIComponent(msg)}`;

    // 2. SEND EMAIL NOTIFICATION (Using new webhook)
    const emailData = {
        customerName: name + " (CUSTOM QUOTE)",
        customerPhone: phone,
        orderSummary: `${selectedCustomCategory} (${selectedCustomBrand}) | ${L}x${W} (Custom) | ${selectedCustomRoll.gsm} GSM | ${qty} Packets`,
        kgRate: kgRate,
        pktRate: pktRate,
        orderTotal: total.replace(/\D/g, ''),
        orderWeight: weight
    };

    try {
        await fetch('https://script.google.com/macros/s/AKfycbw6NJf-nOQgbDRndWWtaFzKPFFR_66MSV-0C0RW4IOvAkKdPPwk2_eXD0EeIUw2sjs/exec', {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(emailData)
        });
    } catch (e) { console.error("Email notification failed", e); }

    // 3. OPEN WHATSAPP
    window.open(whatsappUrl, '_blank');

    // 4. SHOW SUCCESS
    btn.innerHTML = '✅ Quote Requested!';
    setTimeout(() => {
        hideCustomView();
        btn.innerHTML = 'Request Quote via WhatsApp';
        resetCustomView(); // Ensure total reset
    }, 3000);
}
