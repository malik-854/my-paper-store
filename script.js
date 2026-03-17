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
const APP_VERSION = "2026.03.17.02"; // Match Google Sheet X2 to stop reload loop
const SPREADSHEET_ID = "1-KuOU3Kj4Yo6afuGN5qENwAlGvGUORQSz8qfcNCqv18"
const API_KEY = "AIzaSyA05kFZ9ejXco6wpLFfV8WUVaUBbjnhhVI"
const SHEET_NAME = "Sheet1"

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
    MULTIPLE_1_5: 22
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
 * Option A: Auto-Update on Page Load
 * Compares saved cart items with fresh Google Sheets data.
 * Updates prices/rates automatically and notifies the user.
 */
function revalidateCart() {
    if (!cart || Object.keys(cart).length === 0) return { count: 0, keys: [] };

    let changed = false;
    let changeCount = 0;
    let changedKeys = [];

    Object.keys(cart).forEach(key => {
        const item = cart[key];
        const fresh = window.lunrStore ? window.lunrStore[item.id] : null;

        if (fresh) {
            const freshPrice = Math.round(parseFloat(fresh.price || 0));
            const freshRate = fresh.rate || item.rate;

            if (item.price !== freshPrice || item.rate !== freshRate) {
                item.price = freshPrice;
                item.rate = freshRate;
                changed = true;
                changeCount++;
                changedKeys.push(key);
            }
        }
    });

    if (changed) {
        saveCart();
        renderCart(changedKeys); // Pass keys to highlight
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

    document.getElementById('price-banner-title').innerHTML = `Cart Prices Updated`;
    document.getElementById('price-banner-body').innerHTML =
        `${count} item(s) in your cart have been updated to today's rates.`;

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
    setupShippingListeners();
    setupPaymentListeners();

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

        // Try to fetch from Google Sheets (A1:X to include version cell X2)
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}!A1:X?key=${API_KEY}`;
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
    rows.forEach(r => {
        const cat = r[COL.CATEGORY] || 'Uncategorized'
        if (!g[cat]) g[cat] = { category: cat, items: [] }

        // Get color info
        const hasColors = (r[COL.HAS_COLORS] || '').toUpperCase() === 'YES'
        const colorOptions = hasColors ? (r[COL.COLOR_OPTIONS] || '').split(',').map(c => c.trim()) : []

        g[cat].items.push({
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
            hasColors: hasColors,
            colorOptions: colorOptions,
            color: hasColors && colorOptions.length > 0 ? colorOptions[0] : '',
            displaySize: r[COL.DISPLAY_SIZE] || '',  // Custom display text from Column R
            showGSM: !["White Sticker", "Stickers"].includes(cat),  // Control GSM display
            isStickerOnly: cat === "Stickers",  // NEW: Flag for stickers category
            discountTag: r[COL.DISCOUNT_TAG] || '',      // ADD THIS
            newTag: r[COL.NEW_TAG] || '',               // Existing line
            halfQty: (r[COL.HALF_QTY] || '').toUpperCase() === 'YES',
            evenOnly: (r[COL.EVEN_ONLY] || '').toUpperCase() === 'YES',
            multiple15: (r[COL.MULTIPLE_1_5] || '').toUpperCase() === 'YES'
        })
    })
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
            <div class="no-results">
                <h3>${isSearch ? 'No products found' : 'No products available'}</h3>
                <p>${isSearch ? 'Try different search terms' : 'Please check back later'}</p>
            </div>
        `;
        return;
    }

    Object.keys(groups).forEach((cat, index) => {
        const catKey = safeKey(cat);
        if (cat && cat !== "undefined") {
            // Create category container/tile
            wrap.innerHTML += `
<div class="category-section" id="section-${catKey}" onclick="handleSectionClick(event, '${catKey}')">
    <h2 class="category-header">${cat}</h2>
    <div class="category-products" id="cat-${catKey}" style="max-height: 0;">
        <!-- Products will be added here -->
    </div>
</div>`
        }

        const items = groups[cat].items
        const grouped = {}
        items.forEach(i => {
            const key = safeKey(i.name)
            if (!grouped[key]) grouped[key] = { name: i.name, variations: [], hasColors: i.hasColors, colorOptions: i.colorOptions }
            grouped[key].variations.push(i)
        })

        // Get the container for this category
        const categoryContainer = document.getElementById(`cat-${safeKey(cat)}`)

        Object.keys(grouped).forEach(k => {
            const g = grouped[k]
            const sizes = [...new Set(g.variations.map(v => v.size))]

            // CRITICAL: Determine if this category needs GSM filtering
            // Photocopy Paper and Stickers should NOT have GSM filtering
            const shouldFilterGsms = !["Photocopy Paper", "Stickers", "A4 Paper", "White Sticker"].includes(cat)

            // Only create GSM map if needed
            let sizeToGsmsMap = {}
            if (shouldFilterGsms) {
                // Create a map of available GSMs for each size (for categories that need filtering)
                g.variations.forEach(v => {
                    if (!sizeToGsmsMap[v.size]) {
                        sizeToGsmsMap[v.size] = []
                    }
                    if (!sizeToGsmsMap[v.size].includes(v.gsm)) {
                        sizeToGsmsMap[v.size].push(v.gsm)
                    }
                })

                // Store this map globally for dynamic updates
                window[`sizeToGsms_${k}`] = sizeToGsmsMap
            }

            // Get ALL GSMs for the product (for all categories)
            const allGsms = [...new Set(g.variations.map(v => v.gsm))]

            // NEW: Get colors if product has colors
            let colors = []
            if (g.hasColors && g.colorOptions && g.colorOptions.length > 0) {
                colors = g.colorOptions
            } else {
                // For products without colors, still track available colors from variations
                const availableColors = [...new Set(g.variations.map(v => v.color || '').filter(c => c))]
                if (availableColors.length > 0) {
                    colors = availableColors
                }
            }

            // Create variation map
            const map = {}
            g.variations.forEach(v => {
                // ALWAYS create key with brand if brand exists
                if (v.displaySize) {
                    // Primary key: size_gsm_brand
                    const brandKey = `${v.size}_${v.gsm}_${v.displaySize}`
                    map[brandKey] = v

                    // Also create fallback key without brand (for backward compatibility)
                    const fallbackKey = `${v.size}_${v.gsm}`
                    if (!map[fallbackKey]) {
                        map[fallbackKey] = v
                    }
                } else {
                    // For products without brand: size_gsm
                    const baseKey = `${v.size}_${v.gsm}`
                    map[baseKey] = v
                }

                // If product has color, create color-specific keys
                if (v.color) {
                    if (v.displaySize) {
                        // size_gsm_brand_color
                        const colorBrandKey = `${v.size}_${v.gsm}_${v.displaySize}_${v.color}`
                        map[colorBrandKey] = v
                    }
                    // size_gsm_color (fallback)
                    const colorKey = `${v.size}_${v.gsm}_${v.color}`
                    map[colorKey] = v
                }
            })

            window[`map_${k}`] = map
            window[`size_${k}`] = sizes[0]
            window[`gsm_${k}`] = allGsms[0] // Set to first GSM
            window[`color_${k}`] = colors[0] || '' // Initialize first color
            
            // Get first available brand for initial selection
            const brands = [...new Set(g.variations.map(v => v.displaySize).filter(b => b))]
            window[`brand_${k}`] = brands[0] || ''

            // Store category info for this product
            window[`category_${k}`] = cat

            if (cat === "Copy Paper" || cat === "Stickers") {
                // Get unique sizes for this product group
                const uniqueSizes = [...new Set(g.variations.map(v => v.size))];

                productHtml = `
<div class="product-card">
    <img id="img_${k}" src="${g.variations[0].image}" alt="${g.name}">
    <div class="product-info">
        <h3>${g.name}</h3>
        
        <!-- SIZE SELECTION FOR COPY PAPER -->
        ${uniqueSizes.length > 1 ? `
        <div class="variation-grid size-grid">
            ${uniqueSizes.map((size, i) => {
                    const isActive = i === 0;
                    // Store the first size as default
                    if (isActive) {
                        window[`size_${k}`] = size;
                        // Also store brands for this size
                        const brandsForSize = [...new Set(g.variations.filter(v => v.size === size).map(v => v.displaySize).filter(brand => brand))];
                        if (brandsForSize.length > 0) {
                            window[`brand_${k}`] = brandsForSize[0];
                        }
                    }
                    return `<button class="variation-btn ${isActive ? 'active' : ''}" 
                    onclick="selectVar('${k}','size','${size}',this)">${size}</button>`;
                }).join("")}
        </div>
        ` : ''}
        
        <!-- BRAND SELECTION - WILL BE UPDATED DYNAMICALLY -->
        <div class="variation-grid brand-grid" id="brand-grid-${k}">
            ${(() => {
                        // Get brands for the default/first size
                        const defaultSize = uniqueSizes[0];
                        const brandsForDefaultSize = [...new Set(g.variations.filter(v => v.size === defaultSize).map(v => v.displaySize).filter(brand => brand))];

                        return brandsForDefaultSize.map((brand, i) => {
                            // Set default brand
                            if (i === 0) window[`brand_${k}`] = brand;
                            return `<button class="variation-btn brand-btn ${i === 0 ? 'active' : ''}" 
                        onclick="selectVar('${k}','brand','${brand}',this)">
                        ${brand}
                        ${g.variations.find(v => v.displaySize === brand && v.discountTag) ?
                                    `<span class="badge-on-btn badge-discounted">${g.variations.find(v => v.displaySize === brand && v.discountTag).discountTag}</span>` : ''}
                        ${g.variations.find(v => v.displaySize === brand && v.newTag) ?
                                    `<span class="badge-on-btn badge-new">${g.variations.find(v => v.displaySize === brand && v.newTag).newTag}</span>` : ''}
                    </button>`;
                        }).join("");
                    })()}
        </div>

        <!-- GSM SELECTION - WILL BE UPDATED DYNAMICALLY -->
        ${cat !== "Stickers" ? `
        <div class="variation-grid gsm-grid" id="gsm-grid-${k}">
            ${(() => {
                        // Get GSMs for default size and brand
                        const defaultSize = uniqueSizes[0];
                        const defaultBrand = window[`brand_${k}`];
                        const gsmsForDefault = [...new Set(g.variations.filter(v =>
                            v.size === defaultSize && v.displaySize === defaultBrand
                        ).map(v => v.gsm))];

                        return gsmsForDefault.map((gsmVal, i) => {
                            if (i === 0) window[`gsm_${k}`] = gsmVal;
                            return `<button class="variation-btn ${i === 0 ? 'active' : ''}" 
                        onclick="selectVar('${k}','gsm','${gsmVal}',this)">${gsmVal}</button>`;
                        }).join("");
                    })()}
        </div>
        ` : ''}
        
        <p class="details" id="info_${k}"></p>
        <div class="price" id="price_${k}"></div>
    </div>

    <div class="qty-row">
        <div class="qty-input">
            <input type="number" 
                id="qty_${k}" 
                value="${g.variations[0].multiple15 ? '1.5' : (g.variations[0].evenOnly ? '2' : '1')}" 
                min="${g.variations[0].multiple15 ? '1.5' : (g.variations[0].halfQty ? '0.5' : '1')}" 
                max="999" 
                step="${getQuantityStep(g.variations[0])}">
        </div>
        <button class="btn-cart" onclick="addToCart('${k}')">
            Add to Cart
        </button>
    </div>
</div>`
            } else {
                // REGULAR PRODUCTS with GSM filtering
                productHtml = `
<div class="product-card">
    ${cat !== "Copy Paper" && cat !== "Stickers" ? `
        ${g.variations.some(v => v.discountTag) ? `<div class="product-badge badge-discounted">${g.variations.find(v => v.discountTag).discountTag}</div>` : ''}
        ${g.variations.some(v => v.newTag) ? `<div class="product-badge badge-new">${g.variations.find(v => v.newTag).newTag}</div>` : ''}
    ` : ''}
    <img id="img_${k}" src="${g.variations[0].image}" alt="${g.name}">
    <div class="product-info">
        <h3>${g.name}</h3>
        
        <!-- SIZE SELECTION (for regular products) -->
        <div class="variation-grid size-grid">
            ${sizes.map((s, i) => `<button class="variation-btn ${i === 0 ? 'active' : ''}" onclick="selectVar('${k}','size','${s}',this)">${s}</button>`).join("")}
        </div>

        <!-- DYNAMIC GSM SELECTION - Will be updated when size changes (for regular products) -->
        <div class="variation-grid gsm-grid" id="gsm-grid-${k}">
            ${shouldFilterGsms ?
                        // Show GSMs for the first size
                        (sizeToGsmsMap[sizes[0]] || []).map((gsmVal, i) => `<button class="variation-btn ${i === 0 ? 'active' : ''}" onclick="selectVar('${k}','gsm','${gsmVal}',this)">${gsmVal}</button>`).join("")
                        :
                        // Show all GSMs for categories that don't need filtering
                        allGsms.map((gsmVal, i) => `<button class="variation-btn ${i === 0 ? 'active' : ''}" onclick="selectVar('${k}','gsm','${gsmVal}',this)">${gsmVal}</button>`).join("")
                    }
        </div>

        <!-- COLOR SELECTOR - ONLY SHOW IF PRODUCT HAS COLORS -->
        ${colors.length > 0 ? `
        <div class="variation-grid color-grid" id="color-grid-${k}">
            ${colors.map((color, i) => `
            <button class="variation-btn color-btn ${i === 0 ? 'active' : ''}" 
                    onclick="selectVar('${k}','color','${color}',this)"
                    style="${getColorStyle(color)}"
                    title="${color}">
                ${color}
            </button>`).join("")}
        </div>
        ` : ''}

        <p class="details" id="info_${k}"></p>
        <div class="price" id="price_${k}"></div>
    </div>

    <div class="qty-row">
        <div class="qty-input">
            <input type="number" id="qty_${k}" value="${g.variations[0].evenOnly ? '2' : '1'}" min="${g.variations[0].halfQty ? '0.5' : '1'}" max="999" step="${getQuantityStep(g.variations[0])}">
        </div>
        <button class="btn-cart" onclick="addToCart('${k}')">
            Add to Cart
        </button>
    </div>
</div>`
            }

            // Add to category container
            categoryContainer.innerHTML += productHtml

            // Initialize UI with default values
            updateUI(k)
        })
    })
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

    updateUI(key)
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
                button.textContent = brand;
                button.onclick = function () { selectVar(key, 'brand', brand, this); };
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
            button.textContent = gsm;
            button.onclick = function () { selectVar(key, 'gsm', gsm, this); };
            gsmGrid.appendChild(button);
        });

        // Update selected GSM to first available
        window[`gsm_${key}`] = availableGsms[0];
    }

    updateUI(key);
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
    updateUI(key)
}

// NEW FUNCTION: Update available GSM options when size changes
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
    updateUI(key)
}

function updateUI(key) {
    // Get selected values
    const selectedSize = window[`size_${key}`]
    const selectedGsm = window[`gsm_${key}`]
    const selectedColor = window[`color_${key}`] || ''
    const selectedBrand = window[`brand_${key}`] || ''  // Get selected brand

    // Build the lookup key - PRIORITY: size_gsm_brand_color
    let lookupKey = `${selectedSize}_${selectedGsm}`

    // Add brand to lookup if selected
    if (selectedBrand) {
        lookupKey += `_${selectedBrand}`
    }

    // Add color to lookup if selected
    if (selectedColor) {
        lookupKey += `_${selectedColor}`
    }

    // Find the product variation
    let p = window[`map_${key}`][lookupKey]

    // If not found with brand+color, try without color
    if (!p && selectedColor) {
        lookupKey = `${selectedSize}_${selectedGsm}`
        if (selectedBrand) {
            lookupKey += `_${selectedBrand}`
        }
        p = window[`map_${key}`][lookupKey]
    }

    // If still not found with brand, try without brand (but with color if exists)
    if (!p && selectedBrand) {
        lookupKey = `${selectedSize}_${selectedGsm}`
        if (selectedColor) {
            lookupKey += `_${selectedColor}`
        }
        p = window[`map_${key}`][lookupKey]
    }

    // If still not found, try base key (size_gsm only)
    if (!p) {
        const fallbackKey = `${selectedSize}_${selectedGsm}`
        p = window[`map_${key}`][fallbackKey]
    }

    // If product found
    if (p) {
        // Update display
        document.getElementById(`price_${key}`).innerText = `Rs ${p.price} (Rs ${p.rate}/KG)`

        // Show different info based on product type
        const infoElement = document.getElementById(`info_${key}`)
        if (p.showGSM === false) {
            // For products that don't show GSM (White Sticker, Stickers)
            infoElement.innerText = `${p.sheets} Sheets | Rs ${p.rate}/KG`
        } else {
            // For regular products (including Photocopy Paper)
            infoElement.innerText = `${p.gsm} GSM | Rs ${p.rate}/KG`
        }

        // Update image
        const img = document.getElementById(`img_${key}`)
        if (img && p.image) {
            img.src = p.image
        }

        // Update quantity limit
        const qtyInput = document.getElementById(`qty_${key}`)
        if (qtyInput) {
            qtyInput.max = p.maxQty
            if (parseInt(qtyInput.value) > p.maxQty) qtyInput.value = p.maxQty
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
            // Multiply weight by 3
            let rawCharge = totalWeight * 3.5;
            // 2. Round to the nearest 10 (e.g., 453 becomes 450, 456 becomes 460)
            deliveryCharges = Math.round(rawCharge / 10) * 10;
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
// ===== END CHECKOUT FUNCTIONS =====

// ADD TO CART FUNCTION - UPDATED FOR BRAND
async function addToCart(key) {

    const qtyInput = document.getElementById(`qty_${key}`)
    let rawQty = qtyInput.value;

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
        // Fetch A1:X to also check the Version cell (X2) during cart-add
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}!A1:X?key=${API_KEY}&_=${Date.now()}`;
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

            if (isProblematicProduct && selectedBrand) {
                // For problematic products: Match by Column R (Brand) + Size + GSM
                freshProduct = productRows.find(row =>
                    row[17] === selectedBrand &&  // Column R - Unique identifier
                    row[6] == length &&
                    row[7] == width &&
                    row[8] == selectedGsm
                );
                console.log("Using brand-specific lookup for problematic product");
            } else {
                // For normal products: Use old method
                freshProduct = productRows.find(row =>
                    row[3] === productName &&
                    row[6] == length &&
                    row[7] == width &&
                    row[8] == selectedGsm
                );
            }

            // Fallback to old method if brand lookup fails
            if (!freshProduct && isProblematicProduct) {
                freshProduct = productRows.find(row =>
                    row[3] === productName &&
                    row[6] == length &&
                    row[7] == width &&
                    row[8] == selectedGsm
                );
            }

            if (freshProduct) {
                const freshPrice = Math.round(parseFloat(freshProduct[12] || 0));
                const currentPrice = p.price;

                console.log('Fresh price:', freshPrice, 'Current price:', currentPrice);

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
    let qty = parseFloat(rawQty);
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
        alert(`Maximum allowed quantity is ${p.maxQty}`)
        return
    }

    // Create unique cart key
    const cartKey = key + "_" + p.size + "_" + p.gsm +
        (p.displaySize ? "_" + p.displaySize : "") +
        (p.color ? "_" + p.color : "")

    const cartItem = {
        ...p,
        qty,
        selectedColor: selectedColor,
        selectedBrand: selectedBrand
    }

    if (cart[cartKey]) {
        const newQty = cart[cartKey].qty + qty
        if (newQty > p.maxQty) {
            alert(`Maximum total quantity for this item is ${p.maxQty}. You already have ${cart[cartKey].qty} in cart.`)
            return
        }
        cart[cartKey].qty = newQty
    } else {
        cart[cartKey] = cartItem
    }

    renderCart()
    updateCartBadge()
    saveCart() // Persist to local storage

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
                            value="${item.qty}"
                            min="${itemMin}"
                            max="${item.maxQty}"
                            step="${itemStep}"
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
            // OPEN delivery logic
            let baseCharges = Math.max(Math.round(totalWeight * 3.5), 450);
            let currentTotalWithBase = total + baseCharges;

            if (currentTotalWithBase % 100 === 0) {
                deliveryCharges = baseCharges;
            } else {
                let remainder = currentTotalWithBase % 100;
                let amountToAdd = 100 - remainder;
                deliveryCharges = baseCharges + amountToAdd;
            }
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

    // Build orderSummary for email (keep exactly same format as before)
    let orderSummary = "✅ *Order placed through www.hayyatstore.com*\n\n";
    orderSummary += "📄 *NEW PAPER ORDER REQUEST* 📄\n\n";

    // ORDER SUMMARY AT THE TOP
    const subtotal = total - deliveryCharges;
    orderSummary += "*Order Summary:*\n";
    orderSummary += `Subtotal: Rs ${formatNumber(subtotal)}\n`;
    if (deliveryCharges > 0) orderSummary += `Delivery: Rs ${formatNumber(deliveryCharges)}\n`;
    orderSummary += `*GRAND TOTAL: Rs ${formatNumber(total)}*\n`;
    orderSummary += `Total Weight: ${Math.round(totalWeight)} KG\n\n`;

    // CUSTOMER DETAILS
    orderSummary += "*Customer Details:*\n";
    orderSummary += `👤 Name: ${name}\n`;
    orderSummary += `📱 Phone: ${phone}\n`;
    if (email) orderSummary += `📧 Email: ${email}\n`;
    orderSummary += `🚚 Shipping: ${shipping === "self" ? "Self Pickup" : shipping === "open" ? "Delivery - Open" : "Delivery - Bundle"}\n`;
    orderSummary += `💰 Payment: ${document.querySelector('input[name="payment"]:checked').value === "bank" ? "Bank Transfer" : "Pay at Shop"}\n`;
    if (shipping === "open" || shipping === "bundle") {
        orderSummary += `📍 Address: ${address}\n`;
        orderSummary += `💰 Delivery Charges (${shipping === "open" ? "Open" : "Bundle"}): Rs ${formatNumber(deliveryCharges)}\n`;
    }
    orderSummary += `\n*Order Items (${Object.keys(cart).length} types):*\n`;

    // ORDER ITEMS WITH FORMATTED PRICES
    Object.values(cart).forEach((i, index) => {
        const itemTotal = i.price * i.qty;
        const itemWeight = i.weight * i.qty;
        const formattedPrice = formatNumber(i.price);
        const formattedItemTotal = formatNumber(itemTotal);

        orderSummary += `${index + 1}. *${i.name}*\n`;

        // Build specifications line
        let specs = `Size: ${i.size} | GSM: ${i.gsm}`;
        if (i.selectedBrand && i.selectedBrand !== '') {
            specs += ` | Brand: ${i.selectedBrand}`;
        }
        if (i.selectedColor && i.selectedColor !== '') {
            specs += ` | Color: ${i.selectedColor}`;
        }
        orderSummary += `   ${specs}\n`;

        orderSummary += `   Qty: ${i.qty} packs × Rs ${formattedPrice} = Rs ${formattedItemTotal}\n`;
        orderSummary += `   Weight: ${Math.round(itemWeight)} KG @ Rs ${i.rate}/KG\n\n`;
    });

    orderSummary += `⏳ _Please confirm availability and provide payment details._`;

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

        await fetch('https://script.google.com/macros/s/AKfycbw-h33gLXwPGRdnlURFncIhf3W8AS55ikyJN8Db4IZaydA4BwXxyG4gkSghUlluOznFWg/exec', {
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

// Helper to manage clicks on category sections
function handleSectionClick(event, categoryKey) {
    const section = document.getElementById(`section-${categoryKey}`);
    const isFocused = section.classList.contains("focused");
    
    // If clicking header OR if not focused yet, toggle it
    if (event.target.closest('.category-header') || !isFocused) {
        toggleCategory(categoryKey);
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
        
        // Show all other sections
        document.querySelectorAll('.category-section').forEach(s => {
            s.classList.remove("hidden");
        });

        productsDiv.style.maxHeight = "0";
        
        // Scroll back to where the section was
        window.scrollTo({ top: section.offsetTop - 100, behavior: 'smooth' });
    } else {
        // ENTER FOCUS MODE
        wrap.classList.add("focus-mode");
        
        // Hide all other sections
        document.querySelectorAll('.category-section').forEach(s => {
            if (s.id !== `section-${categoryKey}`) {
                s.classList.add("hidden");
            }
        });

        section.classList.add("focused");
        productsDiv.style.maxHeight = "10000px";
        
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
        alert(`Maximum allowed quantity for this item is ${item.maxQty}.`);
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
