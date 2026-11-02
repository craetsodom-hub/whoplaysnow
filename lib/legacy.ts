// The domain previously hosted a film/TV catalogue (about 800k URLs known to
// Google, often under a two-letter country prefix). Those pages will never
// return, so answer 410 Gone instead of a generic 404 or a "match not found"
// page: Google drops 410s faster and stops spending crawl budget on them.
const catalogue=/^\/(?:[a-z]{2}\/)?(?:movie|movies|tv|tv-shows|show|shows|series|season|episode|person|people|actor|actors|cast|crew|director|provider|providers|streaming|watch|discover|catalog|genre|genres|collection|collections|network|networks|keyword|keywords|company|companies|title|titles|film|films|anime|trending|popular|search)(?:\/|$)/i;
const retiredInfrastructure=/^\/(?:sitemap|sitemaps|_next|api\/(?:movie|tv|search|title|person))\//i;
const countryHome=/^\/[a-z]{2}\/?$/i;

export function isLegacyPath(path:string){return catalogue.test(path)||retiredInfrastructure.test(path)||countryHome.test(path);}
