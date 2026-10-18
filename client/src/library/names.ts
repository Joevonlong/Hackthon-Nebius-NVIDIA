// Q2-8: author name parsing shared by notes, the graph, result tiles and exports. Handles every form the sources send:
//   "Itay Tirosh" / "J. A. Smith" (given first) · "Yan M" / "Smith JA" (PubMed: surname + initials) · "van der Berg, A."
//   (family, given) · "A. van der Berg" (lowercase particles stay with the surname).
const PARTICLES = new Set(['van', 'von', 'der', 'den', 'de', 'del', 'della', 'di', 'da', 'dos', 'das', 'du', 'la', 'le', 'ter', 'ten', 'zu', 'bin', 'al', 'el'])
/** PubMed-style initials token: 1–3 capitals, no dots ("M", "JA", "JAB"). */
const isInitials = (t: string) => /^\p{Lu}{1,3}$/u.test(t)
const isParticle = (t: string) => PARTICLES.has(t) // lowercase only: "Van" as a given name stays a given name

/** { family, given } of one author string; family is '' for an empty input. */
export function splitName(raw: string | undefined | null): { family: string; given: string } {
  const a = String(raw || '').trim().replace(/\s+/g, ' ')
  if (!a) return { family: '', given: '' }
  if (a.includes(',')) {
    const [family, ...rest] = a.split(',')
    return { family: family.trim(), given: rest.join(',').trim() }
  }
  const t = a.split(' ')
  if (t.length === 1) return { family: t[0], given: '' }
  // "Yan M", "Smith JA", "van der Berg A": surname first, initials last
  if (isInitials(t[t.length - 1]) && !isInitials(t[0])) return { family: t.slice(0, -1).join(' '), given: t[t.length - 1] }
  // "J. A. Smith", "A. van der Berg": the last word plus any lowercase particles in front of it
  let i = t.length - 1
  while (i > 0 && isParticle(t[i - 1])) i--
  return { family: t.slice(i).join(' '), given: t.slice(0, i).join(' ') }
}

/** The surname of one author string ("Yan M" → "Yan", "J. A. Smith" → "Smith", "van der Berg, A." → "van der Berg"). */
export const lastName = (a: string | undefined | null) => splitName(a).family
