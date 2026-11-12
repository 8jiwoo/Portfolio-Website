// Everything you'd want to edit lives in this file.
// Items marked "EDIT ME" are placeholders - replace them with your real details.
window.CONTENT = {
  name: 'JIWOO HA',
  nameKr: '하지우',
  tagline: 'Portfolio',

  github: '8jiwoo',                 // shown on the right monitor and used to list your repos under PROJECTS
  youtube: '4iV4Q7z46dA',           // YouTube video id played on the left monitor (must allow embedding)
  music: '',                        // optional: path to your own mp3 (e.g. 'assets/music.mp3'). Empty = built-in lo-fi loop
  mapUrl: 'https://www.google.com/maps/search/?api=1&query=Nanyang+Polytechnic+School+of+Information+Technology',

  // Each section opens from a piece of furniture. item = { title, sub, text, img, links: [{ label, url }] }
  sections: {
    computers: { label: 'Projects', items: [   // your public GitHub repos are added automatically below these
      // { title: 'My project', sub: '2026', text: 'What it does.', img: 'assets/project1.png', links: [{ label: 'Demo', url: 'https://...' }] },
    ] },
    laptop: { label: 'School', items: [
      { title: 'Nanyang Polytechnic', sub: 'School of Information Technology', text: 'EDIT ME: diploma, years, modules you enjoyed.' },
      { title: 'EDIT ME: Club / CCA', sub: 'Role, year', text: 'What you did there.' },
    ] },
    certs: { label: 'Certs', items: [
      { title: 'Licenses & certifications', sub: 'On LinkedIn', text: 'My certifications are listed on my LinkedIn profile.', links: [{ label: 'View on LinkedIn', url: 'https://www.linkedin.com/in/8jiwoo/details/certifications/' }] },
      // add individual ones here later: { title: 'Name', sub: 'Issuer, year', links: [{ label: 'Verify', url: 'https://...' }] },
    ] },
    name: { label: 'Awards', items: [
      { title: 'EDIT ME: Award', sub: 'Organisation, year', text: 'What it was for.' },
    ] },
    bag: { label: 'Volunteering', items: [
      { title: 'EDIT ME: Volunteering', sub: 'Organisation, dates', text: 'What you helped with.' },
    ] },
    notebook: { label: 'Artworks', items: [
      { title: 'Living room', sub: '360 panorama', text: 'The room you are standing in.', img: 'assets/pano_4k.webp' },
      // { title: 'Another piece', img: 'assets/art2.jpg' },
    ] },
    phone: { label: 'Contact', items: [
      { title: 'GitHub', text: 'github.com/8jiwoo', links: [{ label: 'Open', url: 'https://github.com/8jiwoo' }] },
      { title: 'Email', text: 'EDIT ME: you@example.com', links: [{ label: 'Write', url: 'mailto:you@example.com' }] },
      { title: 'LinkedIn', text: 'linkedin.com/in/8jiwoo', links: [{ label: 'Open', url: 'https://www.linkedin.com/in/8jiwoo/' }] },
    ] },
  },
};
