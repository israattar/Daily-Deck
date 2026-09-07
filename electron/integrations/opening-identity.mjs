// What makes two internship listings "the same opening", independent of how a
// given tracker words the title.
//
// Shared deliberately: the main process uses it to merge sources, and the
// Openings screen uses it to tell whether something is already applied to or
// skipped. Those two answers have to agree — when they drifted apart, skipped
// roles came back as new.
const ROLE_NOISE = new Set([
  'internship', 'intern', 'summer', 'placement', 'programme', 'program', 'scheme',
  'uk', 'united', 'kingdom', 'student', 'undergraduate', 'graduate', 'the', 'and', 'for',
  // "(2027 Start)" and "Starting 2027" are cycle markers, not part of the role.
  'start',
  // Where a role sits does not make it a different role: "Software Engineering
  // Internship" and "Software Engineering Internship - London" are one job.
  'london', 'manchester', 'birmingham', 'edinburgh', 'glasgow', 'bristol', 'leeds',
  'cambridge', 'oxford', 'belfast', 'cardiff', 'sheffield', 'nottingham', 'newcastle',
  'reading', 'bournemouth', 'northampton', 'remote', 'hybrid', 'onsite', 'europe',
]);

// Crude but symmetric: "engineering" and "engineer" both land on "engine".
function stem(word) {
  let out = word;
  if (out.length > 5 && out.endsWith('ing')) out = out.slice(0, -3);
  if (out.length > 4 && out.endsWith('ers')) out = out.slice(0, -3);
  else if (out.length > 3 && out.endsWith('er')) out = out.slice(0, -2);
  else if (out.length > 3 && out.endsWith('s')) out = out.slice(0, -1);
  return out;
}

function roleTokens(title) {
  return new Set(
    String(title || '')
      .toLowerCase()
      .replace(/20\d\d/g, ' ')
      .split(/[^a-z]+/)
      .filter((word) => word.length > 1 && !ROLE_NOISE.has(word))
      .map(stem)
  );
}

// "J.P. Morgan" and "JPMorgan" are the same employer.
function normaliseCompany(name) {
  return String(name || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
}

// Titles that boil down to a single word ("2027 Summer Analyst Programme" is
// just {analyst}) are far too weak to match on — Goldman Sachs alone runs
// several. Those only ever match when their apply links agree.
function similarity(a, b) {
  if (a.size < 2 || b.size < 2) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  return shared / (a.size + b.size - shared);
}

// Deliberately strict. At 0.7, "Campus Software Engineer" swallowed "Campus UI
// Software Engineer" — one extra token in a three-token title still scores
// 0.75. Hiding a real opening is worse than showing a near-duplicate, so a
// title match has to be near-exact; anything looser has to agree on the URL.
const TITLE_MATCH = 0.8;

// Same employer, and close enough in title to be the same job.
function sameRole(companyA, titleA, companyB, titleB) {
  if (normaliseCompany(companyA) !== normaliseCompany(companyB)) return false;
  const tokensA = roleTokens(titleA);
  const tokensB = roleTokens(titleB);
  // Identical wording still counts when the title is a single weak word.
  if (tokensA.size && tokensA.size === tokensB.size && [...tokensA].every((t) => tokensB.has(t))) {
    return true;
  }
  return similarity(tokensA, tokensB) >= TITLE_MATCH;
}

export { ROLE_NOISE, stem, roleTokens, normaliseCompany, similarity, sameRole, TITLE_MATCH };
