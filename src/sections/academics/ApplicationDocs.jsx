// The two documents every application needs, kept in one editable place so
// they can be copied out quickly. Saved to disk a moment after typing stops
// rather than on every keystroke, so a long edit isn't hundreds of writes.
import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../../api';
import { SectionHead } from '../../components/ui';

const PLACEHOLDER_CV = `ISRAA ATTAR
Manchester, UK · your.email@example.com · linkedin.com/in/yourprofile · github.com/yourhandle

EDUCATION
BSc Computer Science — University of Manchester (expected 2028)
Relevant modules: Data Structures & Algorithms, Databases, Machine Learning
A-Levels: Maths (A*), Further Maths (A), Physics (A)

EXPERIENCE
Software Project — Daily Deck (personal, 2026)
· Built a cross-platform desktop dashboard in React and Electron
· Integrated live data from six external APIs with offline caching
· Designed a local-first storage layer with atomic writes and backups

SKILLS
Languages: JavaScript, Python, Java, SQL
Tools: React, Node.js, Git, Electron, Vite
Other: financial markets, technical analysis

INTERESTS
Algorithmic trading · open-source · photography`;

const PLACEHOLDER_COVER = `Dear Hiring Team,

I am applying for the [ROLE] internship at [COMPANY]. I am a second-year
Computer Science student at the University of Manchester, and the role stood
out to me because [SPECIFIC REASON — mention a team, product or paper].

Over the past year I have been building Daily Deck, a desktop application that
brings my health, academic and trading data into one dashboard. It taught me
more than any module has: how to design a storage layer that never loses data,
how to reconcile messy third-party APIs, and how to keep a codebase readable
while it grows.

I also trade currencies and metals actively, which has given me a practical
feel for risk, discipline and reviewing my own decisions honestly — I keep
per-hour statistics on my own performance and act on what they show.

I would welcome the chance to bring that curiosity to [COMPANY]. Thank you for
your time and consideration.

Kind regards,
Israa Attar`;

const EMPTY = { cv: PLACEHOLDER_CV, coverLetter: PLACEHOLDER_COVER };

export default function ApplicationDocs() {
  const [docs, setDocs] = useStore('application-docs', EMPTY);
  const [draft, setDraft] = useState(null);
  const [saved, setSaved] = useState(false);
  const timer = useRef(null);

  // Seed the editable draft once the stored copy has loaded.
  useEffect(() => {
    if (docs && draft === null) setDraft({ ...EMPTY, ...docs });
  }, [docs, draft]);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!draft) return null;

  function edit(field, value) {
    const next = { ...draft, [field]: value };
    setDraft(next);
    setSaved(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setDocs(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    }, 600);
  }

  // Writing immediately on blur means leaving the tab never loses the last
  // few characters typed inside the debounce window.
  function flush() {
    clearTimeout(timer.current);
    setDocs(draft);
  }

  const copy = (text) => navigator.clipboard?.writeText(text);

  return (
    <div>
      <SectionHead
        title="CV & cover letter"
        sub="Your reusable application text — edit freely, it saves itself."
      >
        {saved && <span className="faint" style={{ fontSize: 12 }}>✓ Saved</span>}
      </SectionHead>

      <div className="grid cols-2">
        <DocBox
          label="CV"
          value={draft.cv}
          onChange={(v) => edit('cv', v)}
          onBlur={flush}
          onCopy={() => copy(draft.cv)}
        />
        <DocBox
          label="Cover letter"
          value={draft.coverLetter}
          onChange={(v) => edit('coverLetter', v)}
          onBlur={flush}
          onCopy={() => copy(draft.coverLetter)}
        />
      </div>
    </div>
  );
}

function DocBox({ label, value, onChange, onBlur, onCopy }) {
  const words = value.trim() ? value.trim().split(/\s+/).length : 0;
  return (
    <div className="card">
      <div className="doc-head">
        <h3 style={{ margin: 0 }}>{label}</h3>
        <div className="doc-meta">
          <span className="faint">{words} words</span>
          <button className="btn small" onClick={onCopy}>Copy</button>
        </div>
      </div>
      <textarea
        className="doc-box"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        spellCheck="true"
      />
    </div>
  );
}
