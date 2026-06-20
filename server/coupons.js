const fs   = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const COUPONS_PATH = path.join(__dirname, 'data', 'coupons.json');
const PAYMENTS_PATH = path.join(__dirname, 'data', 'payments.json');

const loadCoupons  = () => { try { return JSON.parse(fs.readFileSync(COUPONS_PATH, 'utf-8')); } catch { return []; } };
const saveCoupons  = (c) => fs.writeFileSync(COUPONS_PATH, JSON.stringify(c, null, 2), 'utf-8');
const loadPayments = () => { try { return JSON.parse(fs.readFileSync(PAYMENTS_PATH, 'utf-8')); } catch { return []; } };

/**
 * Validates a coupon and computes discount.
 * Returns { valid, discount, discountType, description, error }
 *
 * context = { amount, userId, productId, category, paymentMethod, isFirstPurchase, source }
 */
function validateCoupon(code, context = {}) {
  const { amount = 0, userId, productId, category, paymentMethod, isFirstPurchase, source } = context;

  if (!code) return { valid: false, error: 'Código não informado.' };

  const coupons = loadCoupons();
  const coupon = coupons.find(c => c.code.toUpperCase() === code.toUpperCase());

  if (!coupon) return { valid: false, error: 'Cupom inválido ou não encontrado.' };
  if (!coupon.active) return { valid: false, error: 'Cupom desativado.' };

  const now = new Date();
  if (coupon.startDate && new Date(coupon.startDate) > now) {
    return { valid: false, error: 'Cupom ainda não está ativo.' };
  }
  if (coupon.expiresAt && new Date(coupon.expiresAt) < now) {
    return { valid: false, error: 'Cupom expirado.' };
  }
  if (coupon.maxUses && (coupon.usedCount || 0) >= coupon.maxUses) {
    return { valid: false, error: 'Limite de utilizações atingido.' };
  }
  if (coupon.minValue && amount < coupon.minValue) {
    return { valid: false, error: `Pedido mínimo de R$ ${coupon.minValue.toFixed(2).replace('.', ',')} para este cupom.` };
  }
  if (coupon.firstPurchaseOnly && !isFirstPurchase) {
    return { valid: false, error: 'Cupom válido apenas para a primeira compra.' };
  }
  if (coupon.paymentMethod && paymentMethod && coupon.paymentMethod !== paymentMethod) {
    const label = coupon.paymentMethod === 'pix' ? 'PIX' : 'cartão';
    return { valid: false, error: `Cupom válido somente para pagamento com ${label}.` };
  }
  if (coupon.productIds && coupon.productIds.length > 0 && productId) {
    if (!coupon.productIds.includes(String(productId))) {
      return { valid: false, error: 'Cupom não válido para este produto.' };
    }
  }
  if (coupon.categories && coupon.categories.length > 0 && category) {
    if (!coupon.categories.includes(category)) {
      return { valid: false, error: 'Cupom não válido para esta categoria.' };
    }
  }
  if (coupon.source && source && coupon.source !== source) {
    return { valid: false, error: 'Cupom não válido para esta origem de tráfego.' };
  }

  // Per-user limit
  if (coupon.maxUsesPerUser && userId) {
    const payments = loadPayments();
    const userUses = payments.filter(p => p.couponCode === coupon.code && p.userId === userId).length;
    if (userUses >= coupon.maxUsesPerUser) {
      return { valid: false, error: 'Você já utilizou este cupom o número máximo de vezes.' };
    }
  }

  // Compute discount
  let discount = 0;
  let discountType = coupon.type;
  let description = coupon.description || '';

  if (coupon.type === 'fixed') {
    discount = Math.min(coupon.value, amount);
    description = description || `- R$ ${coupon.value.toFixed(2).replace('.', ',')}`;
  } else if (coupon.type === 'percent') {
    discount = Math.round(amount * (coupon.value / 100) * 100) / 100;
    description = description || `${coupon.value}% OFF`;
  } else if (coupon.type === 'free_shipping') {
    discount = 0; // handled separately in frontend
    description = description || 'Frete grátis';
  } else if (coupon.type === 'pix_extra') {
    if (paymentMethod === 'pix') {
      discount = Math.round(amount * (coupon.value / 100) * 100) / 100;
      description = description || `+${coupon.value}% OFF no PIX`;
    } else {
      return { valid: false, error: 'Este cupom é válido apenas para pagamento com PIX.' };
    }
  } else if (coupon.type === 'first_purchase') {
    if (!isFirstPurchase) {
      return { valid: false, error: 'Cupom válido apenas para a primeira compra.' };
    }
    if (coupon.valueType === 'fixed') {
      discount = Math.min(coupon.value, amount);
    } else {
      discount = Math.round(amount * (coupon.value / 100) * 100) / 100;
    }
    description = description || `Desconto especial — primeira compra`;
  }

  return {
    valid: true,
    discount,
    discountType,
    freeShipping: coupon.type === 'free_shipping',
    code: coupon.code,
    couponId: coupon.id,
    description,
    name: coupon.name,
  };
}

/**
 * Registers coupon usage after a payment is confirmed.
 * Call this when order is placed (not when approved).
 */
function recordCouponUse(code, paymentId) {
  if (!code) return;
  const coupons = loadCoupons();
  const idx = coupons.findIndex(c => c.code.toUpperCase() === code.toUpperCase());
  if (idx === -1) return;
  coupons[idx].usedCount = (coupons[idx].usedCount || 0) + 1;
  coupons[idx].usedPayments = [...(coupons[idx].usedPayments || []), paymentId];
  saveCoupons(coupons);
}

// ─── Admin CRUD helpers ────────────────────────────────────────────────────────

function createCoupon(data) {
  const coupons = loadCoupons();
  if (!data.code || !data.type) throw new Error('Código e tipo são obrigatórios.');
  const exists = coupons.find(c => c.code.toUpperCase() === data.code.toUpperCase());
  if (exists) throw new Error('Já existe um cupom com este código.');

  const coupon = {
    id:              uuidv4(),
    name:            (data.name || data.code).trim(),
    code:            data.code.trim().toUpperCase(),
    description:     (data.description || '').trim(),
    type:            data.type,         // fixed | percent | free_shipping | pix_extra | first_purchase
    value:           Number(data.value) || 0,
    valueType:       data.valueType || 'percent', // for first_purchase: 'fixed' | 'percent'
    active:          data.active !== false,
    startDate:       data.startDate || null,
    expiresAt:       data.expiresAt || null,
    maxUses:         data.maxUses ? Number(data.maxUses) : null,
    maxUsesPerUser:  data.maxUsesPerUser ? Number(data.maxUsesPerUser) : null,
    minValue:        data.minValue ? Number(data.minValue) : null,
    productIds:      data.productIds || [],
    categories:      data.categories || [],
    paymentMethod:   data.paymentMethod || null,  // 'pix' | 'cartao' | null (any)
    firstPurchaseOnly: !!data.firstPurchaseOnly,
    source:          data.source || null,         // 'facebook' | 'instagram' | 'tiktok' | null
    usedCount:       0,
    usedPayments:    [],
    createdAt:       new Date().toISOString(),
  };
  coupons.push(coupon);
  saveCoupons(coupons);
  return coupon;
}

function updateCoupon(id, data) {
  const coupons = loadCoupons();
  const idx = coupons.findIndex(c => c.id === id);
  if (idx === -1) throw new Error('Cupom não encontrado.');

  const allowed = ['name','description','type','value','valueType','active','startDate','expiresAt',
    'maxUses','maxUsesPerUser','minValue','productIds','categories','paymentMethod','firstPurchaseOnly','source'];
  allowed.forEach(k => { if (k in data) coupons[idx][k] = data[k]; });

  // If code changed, validate uniqueness
  if (data.code && data.code.toUpperCase() !== coupons[idx].code) {
    const exists = coupons.find((c, i) => i !== idx && c.code.toUpperCase() === data.code.toUpperCase());
    if (exists) throw new Error('Já existe um cupom com este código.');
    coupons[idx].code = data.code.trim().toUpperCase();
  }

  coupons[idx].updatedAt = new Date().toISOString();
  saveCoupons(coupons);
  return coupons[idx];
}

function deleteCoupon(id) {
  const coupons = loadCoupons();
  const idx = coupons.findIndex(c => c.id === id);
  if (idx === -1) throw new Error('Cupom não encontrado.');
  const [removed] = coupons.splice(idx, 1);
  saveCoupons(coupons);
  return removed;
}

function getCouponStats(id) {
  const coupons = loadCoupons();
  const coupon = coupons.find(c => c.id === id);
  if (!coupon) throw new Error('Cupom não encontrado.');

  const payments = loadPayments();
  const linked = payments.filter(p => p.couponCode && p.couponCode.toUpperCase() === coupon.code.toUpperCase());
  const totalSaved = linked.reduce((s, p) => s + (p.couponDiscount || 0), 0);
  const totalOrders = linked.length;
  const approvedOrders = linked.filter(p => p.status === 'approved').length;

  return {
    coupon,
    totalOrders,
    approvedOrders,
    totalSaved,
    conversionRate: totalOrders ? Math.round((approvedOrders / totalOrders) * 100) : 0,
    orders: linked.map(p => ({
      id: p.id,
      shortId: p.shortId,
      clientName: p.clientName,
      amount: p.amount,
      couponDiscount: p.couponDiscount,
      status: p.status,
      createdAt: p.createdAt,
    })),
  };
}

module.exports = { validateCoupon, recordCouponUse, createCoupon, updateCoupon, deleteCoupon, getCouponStats, loadCoupons, saveCoupons };
