function formatUsage() {
  return [
    '🧮 FORMAT KALKULATOR',
    '',
    'tambah 10 5 10',
    'kurang 10 5',
    'kali 10 5 2',
    'bagi 10 5'
  ].join('\n');
}

function handleCalc(text) {
  const raw = String(text || '').trim();
  const m = raw.match(/^(tambah|kurang|kali|bagi)\s+((?:-?\d+(?:[.,]\d+)?\s*)+)$/i);
  if (!m) {
    if (/^(tambah|kurang|kali|bagi)(\s|$)/i.test(raw)) return formatUsage();
    return null;
  }

  const op = m[1].toLowerCase();
  const numbersText = m[2].trim().split(/\s+/);
  const numbers = numbersText.map((n) => Number.parseFloat(n.replace(',', '.')));
  if (numbers.length < 2) return formatUsage();

  const pretty = (n) => Number(n.toFixed(4)).toString();
  let res = numbers[0];

  for (let i = 1; i < numbers.length; i++) {
    if (op === 'tambah') res += numbers[i];
    else if (op === 'kurang') res -= numbers[i];
    else if (op === 'kali') res *= numbers[i];
    else if (op === 'bagi') {
      if (numbers[i] === 0) return 'Tidak bisa membagi dengan nol.';
      res /= numbers[i];
    }
  }

  const sign = op === 'tambah' ? ' + ' : op === 'kurang' ? ' - ' : op === 'kali' ? ' x ' : ' / ';
  return `Hasil: ${numbers.join(sign)} = ${pretty(res)}`;
}

module.exports = { handleCalc };
