/** The free companion book, offered where players save or share a screenshot. Open access (CC BY 4.0) on Zenodo. */
export const BOOK = {
  title: 'Build Your Cloud Career',
  subtitle: 'A Professional’s Guide to Cloud Engineering',
  url: 'https://zenodo.org/records/23031568',
  short: 'zenodo.org/records/23031568',
} as const;

/** A one-line offer with a link that opens Zenodo in a new tab. */
export function bookHtml(id = 'book-link'): string {
  return `<p class="book">📘 <span><b>Free book:</b> <i>${BOOK.title}: ${BOOK.subtitle}</i>. Roles, skills and a roadmap into cloud engineering.
    <a id="${id}" href="${BOOK.url}" target="_blank" rel="noopener">Download it free on Zenodo ↗</a></span></p>`;
}
