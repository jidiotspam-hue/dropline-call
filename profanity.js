export const triggerPhrases = [
  "fuck", "fucking", "fucked", "fucker", "motherfucker", "mother fucker", "shit", "shitty",
  "bitch", "bitches", "ass", "asshole", "bastard", "damn", "dick", "cock", "pussy", "cunt"
];

export const categoryKeys = ["f", "s", "b", "a", "d", "c", "p"];

const exactWordCategories = new Map([
  ["fuck", "f"], ["fucking", "f"], ["fucked", "f"], ["fucker", "f"], ["motherfucker", "f"],
  ["shit", "s"], ["shitty", "s"],
  ["bitch", "b"], ["bitches", "b"], ["bastard", "b"],
  ["ass", "a"], ["asshole", "a"],
  ["damn", "d"], ["dick", "d"],
  ["cock", "c"], ["cunt", "c"],
  ["pussy", "p"]
]);

const specialCategoryPatterns = new Map([
  ["f", [
    /(?:^|\s)f[*#_•·.-]{2,}(?:ing|ed|er|s)?(?=\s|[,.!?;:]|$)/gi,
    /\bf\W+u\W+c\W+k(?:ing|ed|er|s)?\b/gi,
    /\bf[ -]?word\b/gi
  ]],
  ["s", [
    /(?:^|\s)s(?:h)?[*#_•·.-]{2,}(?:ty)?(?=\s|[,.!?;:]|$)/gi,
    /\bs\W+h\W+i\W+t(?:ty)?\b/gi,
    /\bs[ -]?word\b/gi
  ]],
  ["b", [
    /(?:^|\s)b[*#_•·.-]{2,}(?:es)?(?=\s|[,.!?;:]|$)/gi,
    /\bb\W+i\W+t\W+c\W+h(?:es)?\b/gi,
    /\bb[ -]?word\b/gi
  ]],
  ["a", [
    /(?:^|\s)a[*#_•·.-]{2,}(?:hole)?(?=\s|[,.!?;:]|$)/gi,
    /\ba\W+s\W+s(?:hole)?\b/gi,
    /\ba[ -]?word\b/gi
  ]],
  ["d", [
    /(?:^|\s)d[*#_•·.-]{2,}(?=\s|[,.!?;:]|$)/gi,
    /\bd\W+i\W+c\W+k\b/gi,
    /\bd[ -]?word\b/gi
  ]],
  ["c", [
    /(?:^|\s)c[*#_•·.-]{2,}(?=\s|[,.!?;:]|$)/gi,
    /\bc\W+o\W+c\W+k\b/gi,
    /\bc\W+u\W+n\W+t\b/gi,
    /\bc[ -]?word\b/gi
  ]],
  ["p", [
    /(?:^|\s)p[*#_•·.-]{2,}(?=\s|[,.!?;:]|$)/gi,
    /\bp\W+u\W+s\W+s\W+y\b/gi,
    /\bp[ -]?word\b/gi
  ]]
]);

export function detectTriggerCategories(transcript) {
  const raw = String(transcript || "").toLowerCase().replace(/[’`]/g, "'");
  if (!raw) return [];

  const categories = [];
  const words = raw.match(/[a-z']+/g) || [];
  for (const word of words) {
    const category = exactWordCategories.get(word);
    if (category) categories.push(category);
  }

  for (const [category, patterns] of specialCategoryPatterns) {
    for (const pattern of patterns) {
      const matches = raw.match(pattern);
      for (let count = 0; count < (matches?.length || 0); count += 1) categories.push(category);
    }
  }

  return categories;
}

export function containsTrigger(transcript) {
  return detectTriggerCategories(transcript).length > 0;
}
