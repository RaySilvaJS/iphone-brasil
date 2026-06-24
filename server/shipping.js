// Sistema de rastreamento logístico interno (simulado)
// Este módulo NÃO utiliza nenhuma API externa, Correios ou transportadora real.
// Toda a lógica é gerada internamente com base no CEP de destino.

const REGIONS = [
  { test: p => p >= 1  && p <= 19, hub: 'Hub São Paulo, SP',      days: [2, 3] },
  { test: p => p >= 20 && p <= 28, hub: null,                      days: [1, 2] },
  { test: p => p === 29,           hub: 'Hub Vitória, ES',         days: [2, 3] },
  { test: p => p >= 30 && p <= 39, hub: 'Hub Belo Horizonte, MG', days: [2, 4] },
  { test: p => p >= 40 && p <= 48, hub: 'Hub Salvador, BA',        days: [4, 6] },
  { test: p => p === 49,           hub: 'Hub Aracaju, SE',         days: [4, 6] },
  { test: p => p >= 50 && p <= 59, hub: 'Hub Recife, PE',          days: [5, 7] },
  { test: p => p >= 60 && p <= 65, hub: 'Hub Fortaleza, CE',       days: [5, 7] },
  { test: p => p >= 66 && p <= 68, hub: 'Hub Belém, PA',           days: [6, 9] },
  { test: p => p === 69,           hub: 'Hub Manaus, AM',          days: [7, 10] },
  { test: p => p >= 70 && p <= 77, hub: 'Hub Brasília, DF',        days: [3, 5] },
  { test: p => p >= 78 && p <= 79, hub: 'Hub Campo Grande, MS',    days: [4, 6] },
  { test: p => p >= 80 && p <= 89, hub: 'Hub Curitiba, PR',        days: [4, 6] },
  { test: p => p >= 90 && p <= 99, hub: 'Hub Porto Alegre, RS',    days: [5, 7] },
];

// Deterministic random based on order ID so tracking is always the same
function seededInt(seed, min, max) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  return min + (Math.abs(h) % (max - min + 1));
}

function addHours(date, h) {
  return new Date(date.getTime() + h * 3_600_000);
}

function getCepRegion(cep) {
  const digits = String(cep || '').replace(/\D/g, '');
  if (digits.length < 2) return REGIONS.find(r => r.test(20)); // default RJ
  const prefix = parseInt(digits.slice(0, 2), 10);
  return REGIONS.find(r => r.test(prefix)) || REGIONS.find(r => r.test(20));
}

function generateTracking(payment) {
  const base   = payment.paidAt ? new Date(payment.paidAt) : new Date();
  const cep    = payment.address?.cep || '';
  const city   = payment.address?.cidade || 'Destino';
  const uf     = payment.address?.estado || '';
  const dest   = uf ? `${city}, ${uf}` : city;
  const region = getCepRegion(cep);
  const [mn, mx] = region.days;
  const days   = seededInt(payment.id || String(base.getTime()), mn, mx);

  const steps = [];

  steps.push({
    step:      'payment_approved',
    label:     'Pagamento aprovado',
    location:  'Loja Online — Rio de Janeiro, RJ',
    timestamp: base.toISOString(),
  });

  steps.push({
    step:      'preparing',
    label:     'Pedido em separação',
    location:  'Centro de Distribuição — Rio de Janeiro, RJ',
    timestamp: addHours(base, 2).toISOString(),
  });

  steps.push({
    step:      'dispatched',
    label:     'Enviado para transporte',
    location:  'Rio de Janeiro, RJ',
    timestamp: addHours(base, 20).toISOString(),
  });

  if (region.hub) {
    const hubH = Math.max(48, Math.floor(days / 2) * 24);
    steps.push({
      step:      'in_transit',
      label:     'Em trânsito — Hub Regional',
      location:  region.hub,
      timestamp: addHours(base, hubH).toISOString(),
    });
  }

  steps.push({
    step:      'out_for_delivery',
    label:     'Saindo para entrega',
    location:  dest,
    timestamp: addHours(base, days * 24 - 16).toISOString(),
  });

  steps.push({
    step:      'delivered',
    label:     'Entregue',
    location:  dest,
    timestamp: addHours(base, days * 24 + 3).toISOString(),
  });

  return {
    trackingId:        'TRK-' + (payment.shortId || payment.id.slice(0, 8)).toUpperCase(),
    estimatedDelivery: addHours(base, days * 24).toISOString(),
    generatedAt:       new Date().toISOString(),
    steps,
  };
}

module.exports = { generateTracking };
