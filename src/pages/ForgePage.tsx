const items = [
  'frameworks/waypoint-cms',
  'frameworks/omarcms-template',
  'frameworks/seo-audit-hub',
  'scripts/technical-audit',
  'scripts/space-to-csv',
  'scripts/scraper',
]

export default function ForgePage() {
  return <div className="grid-page">{items.map((x) => <div className="tile" key={x}><h3>{x.split('/').pop()}</h3><p>{x}</p></div>)}</div>
}
