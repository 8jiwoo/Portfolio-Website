// Everything you'd want to edit lives in this file.
// Items marked "EDIT ME" are placeholders - replace them with your real details.
window.CONTENT = {
  name: 'JIWOO HA',
  nameKr: '하지우',

  github: '8jiwoo',                 // shown on the right monitor
  youtube: '4iV4Q7z46dA',           // YouTube video id played on the left monitor (must allow embedding)
  music: '',                        // optional: path to your own mp3 (e.g. 'assets/music.mp3'). Empty = built-in cartoon loop
  // the globe: satellite view over Nanyang Polytechnic, School of Information Technology
  mapUrl: 'https://www.google.com/maps/@?api=1&map_action=map&center=1.3801,103.8490&zoom=18&basemap=satellite',

  // Each section opens from a piece of furniture.
  //   { heading }                                               a small group title
  //   { title, sub, text, tech, img, links: [{ label, url }] }  a card
  //   add  detail: '...'  to make a card clickable; it then opens a popup with that text
  // A missing img file is fine: the card shows a plain tile instead.
  sections: {
    computers: { label: 'Projects', items: [
      { title: 'PlateLoop', sub: 'Food waste management · Hackathon project',
        text: "AI tray scanner that measures what's served, eaten and left, so canteens cook the right amount. Kitchen dashboard and Loopi apps for schools, hospitals and offices.",
        tech: 'JavaScript', links: [{ label: 'Code', url: 'https://github.com/8jiwoo/Plateloop' }, { label: 'Live', url: 'https://8jiwoo.github.io/Plateloop/' }] },
      { title: 'Personal Portfolio Website', sub: 'Web development project', img: 'assets/pano_4k.webp',
        text: 'This site: my hand-drawn living room as a 360° space you can look around and click through.',
        tech: 'HTML, CSS, JavaScript, WebGL, Python', links: [{ label: 'Code', url: 'https://github.com/8jiwoo/Portfolio-Website' }] },
      { title: 'Web Development Project', sub: 'Web development', text: 'EDIT ME: short description.', tech: 'EDIT ME' },
      { title: 'Full-Stack Application', sub: 'Full-stack development', text: 'EDIT ME: short description.', tech: 'EDIT ME' },
    ] },
    frame: { label: 'Experience', items: [
      { title: 'JPMorgan Chase', sub: 'Incoming Software Engineering Intern' },
    ] },
    laptop: { label: 'Education', items: [
      { title: 'Nanyang Polytechnic (NYP)', sub: 'School of Information Technology' },
      { heading: 'Activities & societies' },
      { title: 'SWIFT Club', sub: 'Publicity Committee Member · 2025–Present' },
      { title: 'SEG Club', sub: 'Subcommittee Member · 2024–2025' },
      { title: 'NYP Lumina Programme', sub: 'Capstone Leadership Development Programme' },
    ] },
    certs: { label: 'Certs', items: [
      { title: 'Navigating AI & Digital Safety with Confidence', sub: 'Workshop' },
      { title: 'AI Fluency Framework and Foundations', sub: 'Certificate of Completion' },
      { title: 'Web Development Functions and User Experience Design Fundamentals', sub: 'Certificate' },
      { title: 'More on LinkedIn', links: [{ label: 'View on LinkedIn', url: 'https://www.linkedin.com/in/8jiwoo/details/certifications/' }] },
    ] },
    name: { label: 'Awards', items: [
      { heading: 'Awards & scholarships' },
      { title: 'Daisy Phay–NYP Foundation Scholarship', sub: 'Scholarship', star: true },
      { heading: 'Activities & achievements' },
      { title: 'SEG Mind Your Wellness', sub: '2024 · Assistant Student Organiser' },
      { title: 'OELP – Engineering, Suzhou, China', sub: 'AY2024 · Overseas Experiential Learning Programme, NYP SEG' },
      { title: 'SDG Open Hackathon', sub: '2025' },
      { title: 'IMPACT Week 2025', sub: '2025 · Represented Nanyang Polytechnic' },
      { title: 'OELP – Cybersecurity, Tokyo, Japan', sub: 'AY2026 · Overseas Experiential Learning Programme, DDAS, NYP SIT' },
      { title: 'SG Eco Loop 2.0 Hackathon', sub: 'Hackathon' },
    ] },
    bag: { label: 'Volunteering', items: [
      { title: 'Project Rejuven-Aid', sub: '2026 · Volunteer', img: 'assets/volunteer1.jpg',     // EDIT ME: add this picture
        detail: 'As part of the Lumina Scholars Programme, I participated in Project Rejuven-Aid (also known as Silver Homes), a volunteer-driven initiative dedicated to creating healthier, safer and cleaner living environments for disadvantaged seniors.' },
      { title: 'Chinese New Year Lunch Gathering for the Elderly', sub: '2025 · Assistant Student Organiser', img: 'assets/volunteer2.jpg',   // EDIT ME: add this picture
        detail: 'Organised a Chinese New Year lunch gathering for elderly residents in collaboration with Project Love Lunch. Worked alongside my team from the ground up to plan and coordinate the event, contributing to the organisation and execution of the gathering.' },
    ] },
    notebook: { label: 'Artworks', items: [
      { title: 'Living room', sub: '360 panorama', text: 'The room you are standing in.', img: 'assets/pano_4k.webp' },
    ] },
    phone: { label: 'Contact', items: [
      { title: 'Email', text: '8jiwoo@gmail.com', links: [{ label: 'Write', url: 'mailto:8jiwoo@gmail.com' }] },
      { title: 'LinkedIn', text: 'linkedin.com/in/8jiwoo', links: [{ label: 'Open', url: 'https://www.linkedin.com/in/8jiwoo/' }] },
      { title: 'GitHub', text: 'github.com/8jiwoo', links: [{ label: 'Open', url: 'https://github.com/8jiwoo' }] },
    ] },
  },
};
