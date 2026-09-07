const categoryWordGroups = new Map([
  ["f", [
    "fuck", "fucks", "fucked", "fucking", "fuckin", "fucker", "fuckers", "fuckery",
    "fuckhead", "fuckheads", "fuckface", "fuckwit", "fuckboy", "fucktard", "fuckup", "fuckups",
    "motherfuck", "motherfucker", "motherfuckers", "motherfucking", "motherfuckin",
    "mothafucka", "mothafucker", "clusterfuck", "fuk", "fuq", "wtf", "stfu"
  ]],
  ["s", [
    "shit", "shits", "shite", "shitty", "shittier", "shittiest", "shitting", "shittin",
    "shitter", "shitters", "shithead", "shitheads", "shithole", "shitshow", "shitstorm",
    "shitface", "shitbag", "shitpost", "shitposting",
    "bullshit", "bullshitting", "bullshitter", "horseshit", "dogshit", "batshit",
    "dipshit", "apeshit"
  ]],
  ["b", [
    "bitch", "bitches", "bitching", "bitchin", "bitchy", "bitchass",
    "bastard", "bastards", "sonofabitch"
  ]],
  ["a", [
    "ass", "asses", "asshole", "assholes", "asshat", "assclown", "asswipe", "assface",
    "dumbass", "dumbasses", "jackass", "jackasses", "badass", "smartass", "fatass",
    "hardass", "kickass", "arse", "arses", "arsehole", "arseholes"
  ]],
  ["d", [
    "damn", "damns", "damned", "damning", "damnit", "dammit",
    "goddamn", "goddamned", "goddammit", "goddamnit",
    "dick", "dicks", "dickhead", "dickheads", "dickwad", "dickish",
    "douche", "douches", "douchebag", "douchebags"
  ]],
  ["c", [
    "cock", "cocks", "cockhead", "cocksucker", "cocksuckers",
    "cunt", "cunts", "cunty", "crap", "craps", "crappy", "crapped", "crapping"
  ]],
  ["p", [
    "pussy", "pussies", "piss", "pissed", "pisses", "pissing", "pissin", "prick", "pricks"
  ]]
]);

export const categoryKeys = [...categoryWordGroups.keys()];

export const triggerPhrases = [...categoryWordGroups.values()].flat();

const exactWordCategories = new Map(
  [...categoryWordGroups].flatMap(([category, words]) => words.map((word) => [word, category]))
);

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
    const category = exactWordCategories.get(word.replace(/^'+|'+$/g, ""));
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
