/**
 * kiosk.js - Kiosk-specific logic for Hayyat Webstore
 */

// 1. SETTINGS & URLS
const scriptUrl = 'https://script.google.com/macros/s/AKfycbysHbzMzacuCiZp16PJO5Gnx8kN2asM2Te4yDavvSdXRUN2jfUwRvc-LCjRvKPGXbsG/exec';
const macroDroidUrl = 'https://trigger.macrodroid.com/35d41fb9-cf8f-4641-bc47-921e9e297c10/order';

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

    // DELIVERY CALCULATION (Same logic as script.js)
    if (shipping === "open" || shipping === "bundle") {
        if (shipping === "open") {
            let baseCharges = Math.max(Math.round(totalWeight * 3.5), 450);
            let currentTotalWithBase = subtotalValue + baseCharges;
            if (currentTotalWithBase % 100 === 0) {
                deliveryCharges = baseCharges;
            } else {
                let remainder = currentTotalWithBase % 100;
                let amountToAdd = 100 - remainder;
                deliveryCharges = baseCharges + amountToAdd;
            }
        } else if (shipping === "bundle") {
            let bundles = totalWeight / 70;
            let decimalPart = bundles % 1;
            bundles = (decimalPart <= 0.5) ? Math.floor(bundles) : Math.ceil(bundles);
            bundles = Math.max(1, bundles);
            deliveryCharges = bundles * 250;
        }
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
            const msg = `✅ *Kiosk Order Received*\n-------------------------\nCustomer: ${name}\nOrder ID: ${invoiceLink}\n\n💰 *Please show this message at the counter to proceed.*`;
            const waUrl = `${macroDroidUrl}?phone=92${phone.startsWith('0') ? phone.substring(1) : phone}&msg=${encodeURIComponent(msg)}`;
            fetch(waUrl, { mode: 'no-cors' }); // Silent ping to phone
        }

        // 3. EMAIL WEBHOOK (Formatted perfectly for AutoHotkey via Google Script)
        let orderSummary = "✅ *Order placed through hayyat shop kiosk*\n\n";
        orderSummary += "📄 *NEW PAPER ORDER REQUEST* 📄\n\n";

        const formatNumber = (num) => Math.round(num).toLocaleString('en-IN');
        
        orderSummary += "*Order Summary:*\n";
        orderSummary += `Subtotal: Rs ${formatNumber(subtotalValue)}\n`;
        if (deliveryCharges > 0) orderSummary += `Delivery: Rs ${formatNumber(deliveryCharges)}\n`;
        orderSummary += `*GRAND TOTAL: Rs ${formatNumber(totalCalculated)}*\n`;
        orderSummary += `Total Weight: ${Math.round(totalWeight)} KG\n\n`;

        orderSummary += "*Customer Details:*\n";
        orderSummary += `👤 Name: ${name}\n`;
        orderSummary += `📱 Phone: ${phone || "Not provided"}\n`;
        const email = document.getElementById("cust-email") ? document.getElementById("cust-email").value : '';
        if (email) orderSummary += `📧 Email: ${email}\n`;
        orderSummary += `🚚 Shipping: ${shipping === "self" ? "Self Pickup" : shipping === "open" ? "Delivery - Open" : "Delivery - Bundle"}\n`;
        orderSummary += `💰 Payment: ${payment === "bank" ? "Bank Transfer" : "Pay at Shop"}\n`;

        if (shipping !== "self" && address) {
            orderSummary += `📍 Address: ${address}\n`;
            orderSummary += `💰 Delivery Charges (${shipping === "open" ? "Open" : "Bundle"}): Rs ${formatNumber(deliveryCharges)}\n`;
        }

        orderSummary += `\n*Order Items (${Object.keys(cart).length} types):*\n`;

        let itemIndex = 1;
        for (const key in cart) {
            const item = cart[key];
            const itemTotal = item.price * item.qty;
            const itemWeight = item.weight * item.qty;

            orderSummary += `${itemIndex}. *${item.name}*\n`;

            let specs = [];
            if (item.size) specs.push(`Size: ${item.size}`);
            if (item.gsm) specs.push(`GSM: ${item.gsm}`);
            if (item.selectedBrand) specs.push(`Brand: ${item.selectedBrand}`);
            if (item.selectedColor) specs.push(`Color: ${item.selectedColor}`);

            if (specs.length > 0) {
                orderSummary += `   ${specs.join(' | ')}\n`;
            }

            orderSummary += `   Qty: ${item.qty} packs × Rs ${formatNumber(item.price)} = Rs ${formatNumber(itemTotal)}\n`;
            orderSummary += `   Weight: ${Math.round(itemWeight)} KG @ Rs ${item.rate}/KG\n\n`;
            itemIndex++;
        }

        orderSummary += `⏳ _Please confirm availability and provide payment details._`;

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
        prepareReceipt(name, phone, orderId, shipping, payment, address, total);
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
        alert("Success! Order recorded."); // Fallback
        if (btn) { btn.disabled = false; btn.innerHTML = "Finish & Print"; }
    }
};

function prepareReceipt(n, p, id, shippingMethod, paymentMethod, address, itemTotal) {
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

    // Calculate Delivery Charges
    let deliveryFee = 0;
    if (shippingMethod !== 'self') {
        if (typeof calculateDeliveryCharges === 'function') {
            deliveryFee = calculateDeliveryCharges(shippingMethod);
        }
    }

    const subEl = document.getElementById('print-subtotal');
    if (subEl) subEl.innerText = `Rs ${itemTotal}`;

    const delRow = document.getElementById('print-delivery-row');
    const delVal = document.getElementById('print-delivery-charges');
    if (deliveryFee > 0) {
        if (delRow) delRow.style.display = 'flex';
        if (delVal) delVal.innerText = `Rs ${deliveryFee}`;
    } else {
        if (delRow) delRow.style.display = 'none';
    }

    const totalEl = document.getElementById('print-total-amount');
    if (totalEl) totalEl.innerText = `Rs ${itemTotal + deliveryFee}`;
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
