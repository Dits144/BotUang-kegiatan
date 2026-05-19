const { parseOwnerActivate } = require('./utils/parser');
console.log(parseOwnerActivate('#aktif 120363427301916965@g.us 3', null));
console.log(parseOwnerActivate('#aktif 3', '120363427301916965@g.us'));
