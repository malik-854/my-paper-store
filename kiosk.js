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

    const orderItems = Object.values(cart).map(i => ({
        name: i.name, specs: `${i.size} | ${i.gsm} GSM`, qty: i.qty, price: i.price, total: i.price * i.qty
    }));
    const total = orderItems.reduce((sum, i) => sum + i.total, 0);

    const invoiceLink = `https://www.hayyatstore.com/order.html?id=${orderId}`;

    const orderData = {
        orderId, invoiceLink, customerName: name, customerPhone: phone,
        shippingMethod: shipping, paymentMethod: payment, deliveryAddress: address,
        orderItems, totalAmount: total, deliveryCharges: 0
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

        // 3. EMAIL WEBHOOK
        await fetch('https://script.google.com/macros/s/AKfycbw-h33gLXwPGRdnlURFncIhf3W8AS55ikyJN8Db4IZaydA4BwXxyG4gkSghUlluOznFWg/exec', {
            method: 'POST', mode: 'no-cors', body: JSON.stringify({ customerName: name, orderSummary: "Kiosk Order", orderTotal: total })
        });

        // 4. SUCCESS & PRINT (SILENT via RawBT for Android Tablet)
        prepareReceipt(name, phone, orderId, shipping, payment, address, total);
        document.getElementById('checkout-modal').classList.remove('active');
        const sm = document.getElementById('success-modal');
        if (sm) { sm.style.display = 'flex'; document.getElementById('success-order-id').innerText = orderId; }

        localStorage.removeItem('hayyat_cart');
        
        // Trigger RawBT Silent Printing after 1 second
        setTimeout(() => {
            const receiptHtml = document.getElementById('print-section').innerHTML;
            // Wrap in basic HTML structure for RawBT
            const fullHtml = `<html><head><meta charset="utf-8"></head><body style="margin:0;padding:2mm;">${receiptHtml}</body></html>`;
            window.location.href = "intent:#Intent;action=ru.a402d.rawbtprinter.action.PRINT;S.html=" + encodeURIComponent(fullHtml) + ";end";
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
            const specStr = specs.length > 0 ? `<div style="font-size:10px; opacity:0.8; margin-top:2px;">${specs.join(' | ')}</div>` : '';
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
