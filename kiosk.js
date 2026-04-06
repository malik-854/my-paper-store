/**
 * kiosk.js - Kiosk-specific logic for Hayyat Webstore
 */

// 1. SETTINGS & URLS
const scriptUrl = 'https://script.google.com/macros/s/AKfycbysHbzMzacuCiZp16PJO5Gnx8kN2asM2Te4yDavvSdXRUN2jfUwRvc-LCjRvKPGXbsG/exec';
const macroDroidUrl = 'https://trigger.macrodroid.com/5f8b53ed-bdb1-4979-8f48-81059ecfd195/order';

// 2. IDLE AUTO-REFRESH (60 Seconds)
let idleTimer;
function startIdleTimer() {
    function reset() {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
            localStorage.removeItem('hayyat_cart');
            window.location.reload();
        }, 60000);
    }
    ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(e => document.addEventListener(e, reset, true));
    reset();
}
startIdleTimer();

// 3. OVERRIDE MAIN SCRIPT
window.openCheckout = async function () {
    if (Object.keys(cart).length === 0) return alert("Your cart is empty");
    if (typeof fetchProducts === 'function') await fetchProducts({ quiet: true });
    if (typeof closeCart === 'function') closeCart();
    const m = document.getElementById("checkout-modal");
    if (m) { m.classList.add("active"); document.body.style.overflow = "hidden"; }
    if (typeof updateShipping === 'function') updateShipping('self', true);
};

window.placeOrder = async function () {
    const btn = document.querySelector('.whatsapp-btn');
    if (btn) { btn.innerHTML = '⏳ Saving...', btn.disabled = true; }

    const orderId = `HAYYAT-KIOSK-${Date.now()}`;
    const name = document.getElementById("cust-name").value || "Kiosk Guest";
    const phone = document.getElementById("cust-phone").value || "";
    const address = document.getElementById("delivery-address").value;
    const shipping = document.querySelector('input[name="shipping"]:checked').value;
    const payment = document.querySelector('input[name="payment"]:checked').value;

    // Calculate Totals and Weight
    let totalWeight = 0;
    Object.values(cart).forEach(item => { totalWeight += (item.weight * item.qty); });

    const orderItems = Object.values(cart).map(i => ({
        name: i.name,
        specs: `${i.size} | ${i.gsm} GSM${i.selectedBrand ? ' | ' + i.selectedBrand : ''}${i.selectedColor ? ' | ' + i.selectedColor : ''}`,
        qty: i.qty,
        price: i.price,
        rate: i.rate, // CRITICAL: Fix for N/A in invoice
        weight: i.weight,
        total: i.price * i.qty
    }));

    let subtotalValue = orderItems.reduce((sum, i) => sum + i.total, 0);
    let deliveryCharges = 0;

    // DELIVERY CALCULATION (UNIFIED: 350 min, no nearest-100 rounding)
    if (shipping === "open") {
        deliveryCharges = (totalWeight <= 150) ? 350 : Math.round(totalWeight * 4.5);
    } else if (shipping === "bundle") {
        let bundles = Math.round(totalWeight / 70) || 1;
        deliveryCharges = bundles * 250;
    }

    const totalCalculated = subtotalValue + deliveryCharges;
    const invoiceLink = `https://www.hayyatstore.com/order.html?id=${orderId}`;

    const orderData = {
        orderId, invoiceLink, customerName: name, customerPhone: phone,
        shippingMethod: shipping, paymentMethod: payment, deliveryAddress: address,
        orderItems, totalAmount: totalCalculated, deliveryCharges: deliveryCharges,
        totalWeight: Math.round(totalWeight), subtotal: subtotalValue
    };

    try {
        // 1. SAVE TO GOOGLE SHEET
        await fetch(scriptUrl, {
            method: 'POST', mode: 'no-cors', body: JSON.stringify({ action: 'createOrder', order: orderData })
        });

        // 2. TRIGGER WHATSAPP (Via Shop Phone - MACRODROID)
        if (phone) {
            const msg = `✅ *Kiosk Order Received*\n-------------------------\nCustomer: ${name}\nOrder Link: ${invoiceLink}\n\nOrder Id: ${orderId}\n💰 *Please show this message at the counter to proceed.*\n\nآپ اپنی اگلی خریداری کے لیے ہماری ویب سائٹ www.hayyatstore.com استعمال کر سکتے ہیں۔ ویب سائٹ پر آپ نہ صرف تازہ ترین ریٹس (Rates) چیک کر سکتے ہیں، بلکہ اپنا آرڈر بھی دے سکتے ہیں۔ اس طرح آپ کا آرڈر تیزی سے پراسیس ہوگا اور آپ کو دکان پر انتظار بھی نہیں کرنا پڑے گا۔`;
            const waUrl = `${macroDroidUrl}?phone=92${phone.startsWith('0') ? phone.substring(1) : phone}&msg=${encodeURIComponent(msg)}`;
            fetch(waUrl, { mode: 'no-cors' }); // Silent ping to phone
        }

        // 3. EMAIL WEBHOOK (New Structured Format for ERP)
        let orderSummary = "ORDER_DATA_START\n";
        orderSummary += "---CUSTOMER_INFO---\n";
        orderSummary += `Name: ${name}\n`;
        orderSummary += `Phone: ${phone || "Not provided"}\n`;
        const email = document.getElementById("cust-email") ? document.getElementById("cust-email").value : '';
        
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

        await fetch('https://script.google.com/macros/s/AKfycbw-h33gLXwPGRdnlURFncIhf3W8AS55ikyJN8Db4IZaydA4BwXxyG4gkSghUlluOznFWg/exec', {
            method: 'POST', mode: 'no-cors', body: JSON.stringify(emailData)
        });

        // 4. SUCCESS & PRINT
        prepareReceipt(name, phone, orderId, shipping, payment, address, subtotalValue, deliveryCharges);
        document.getElementById('checkout-modal').classList.remove('active');
        const sm = document.getElementById('success-modal');
        if (sm) { sm.style.display = 'flex'; document.getElementById('success-order-id').innerText = orderId; }

        localStorage.removeItem('hayyat_cart');

        setTimeout(() => {
            if (typeof fully !== 'undefined') {
                fully.print(); // Fully Kiosk Silent Print
            } else {
                window.print(); // Fallback for standard browsers
            }
        }, 1000);
    } catch (e) {
        console.error('Order preparation error:', e);
        if (btn) { btn.disabled = false; btn.innerHTML = "Finish & Print"; }
    }
};

function prepareReceipt(n, p, id, shippingMethod, paymentMethod, address, subtotal, deliveryFee) {
    document.getElementById('print-name').innerText = n;
    document.getElementById('print-phone').innerText = p || 'N/A';
    document.getElementById('print-order-id').innerText = id;

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
            if (i.selectedColor) specs.push(i.selectedColor);
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

// 4. AUTH & UI
document.addEventListener('DOMContentLoaded', () => {
    const auth = localStorage.getItem("HAYYAT_KIOSK_AUTHORIZED") || window.location.search.includes('HAYYAT_STORE_2026');
    if (auth) {
        localStorage.setItem("HAYYAT_KIOSK_AUTHORIZED", "true");
        document.getElementById('kiosk-auth-overlay').style.display = 'none';
    } else {
        document.getElementById('kiosk-auth-overlay').style.display = 'flex';
    }
});
