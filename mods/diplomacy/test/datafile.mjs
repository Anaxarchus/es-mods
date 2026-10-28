// Reading Endless Sky data text: tokens and indented nodes. No Node APIs, so the
// mock game (mock.mjs) also runs under QuickJS (tools/qjs-time.mjs).

// Tokenise one line of Endless Sky data: quoted, backticked or bare words.
export function tokens(line) {
	const out = [];
	let i = 0;
	while (i < line.length) {
		const c = line[i];
		if (c === ' ' || c === '\t') { i++; continue; }
		if (c === '#') break;
		if (c === '"' || c === '`') {
			const end = line.indexOf(c, i + 1);
			const stop = end < 0 ? line.length : end;
			out.push(line.slice(i + 1, stop));
			i = stop + 1;
			continue;
		}
		let j = i;
		while (j < line.length && line[j] !== ' ' && line[j] !== '\t') j++;
		out.push(line.slice(i, j));
		i = j;
	}
	return out;
}

// Lines as { depth, tokens }, skipping blank and comment lines.
export function nodes(text) {
	const out = [];
	for (const raw of text.split('\n')) {
		const t = tokens(raw);
		if (t.length === 0) continue;
		let depth = 0;
		while (depth < raw.length && raw[depth] === '\t') depth++;
		out.push({ depth, tokens: t });
	}
	return out;
}
