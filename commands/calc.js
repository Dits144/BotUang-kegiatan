function formatUsage() {
  return [
    '🧮 FORMAT KALKULATOR',
    '',
    'tambah 10 5',
    'kurang 10 5',
    'kali 10 5',
    'bagi 10 5'
  ].join('\n');
}

function handleCalc(text) {
  const raw = String(text || '').trim();
  const m = raw.match(/^(tambah|kurang|kali|bagi)\s+(-?\d+(?:[.,]\d+)?)\s+(-?\d+(?:[.,]\d+)?)$/i);
  if (!m) {
    if (/^(tambah|kurang|kali|bagi)(\s|$)/i.test(raw)) return formatUsage();
    return null;
  }

  const op = m[1].toLowerCase();
  const a = Number.parseFloat(m[2].replace(',', '.'));
  const b = Number.parseFloat(m[3].replace(',', '.'));

  const pretty = (n) => Number(n.toFixed(4)).toString();
  if (op === 'tambah') return `Hasil: ${a} + ${b} = ${pretty(a + b)}`;
  if (op === 'kurang') return `Hasil: ${a} - ${b} = ${pretty(a - b)}`;
  if (op === 'kali') return `Hasil: ${a} x ${b} = ${pretty(a * b)}`;
  if (b === 0) return 'Tidak bisa membagi dengan nol.';
  return `Hasil: ${a} / ${b} = ${pretty(a / b)}`;
}

module.exports = { handleCalc };
