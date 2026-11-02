import type { MatchLocale } from './routes.ts'

type Copy = {
  language: string
  direction: 'ltr' | 'rtl'
  title: (event: string) => string
  description: (event: string, competition: string) => string
  kicker: string
  intro: (event: string) => string
  kickoff: string
  competition: string
  watchIn: (country: string) => string
  publishedBy: string
  officialLink: string
  sourceLink: string
  allMatches: string
  languages: string
}

export const matchCopy: Record<MatchLocale, Copy> = {
  en: { language: 'English', direction: 'ltr', title: event => `Where to watch ${event}`, description: (event, competition) => `Find legal channels and streaming services for ${event} in ${competition}, organized by country with source links.`, kicker: 'Match broadcast guide', intro: event => `Country-specific TV channels and authorized streaming services for ${event}.`, kickoff: 'Kickoff', competition: 'Competition', watchIn: country => `Where to watch in ${country}`, publishedBy: 'Published', officialLink: 'Official viewing or schedule link', sourceLink: 'View listing source', allMatches: 'Browse all matches', languages: 'Other languages' },
  es: { language: 'Español', direction: 'ltr', title: event => `Dónde ver ${event}`, description: (event, competition) => `Consulta los canales y servicios de streaming legales para ${event} en ${competition}, organizados por país y con enlaces a las fuentes.`, kicker: 'Guía de emisión del partido', intro: event => `Canales de televisión y servicios de streaming autorizados para ${event}, por país.`, kickoff: 'Hora de inicio', competition: 'Competición', watchIn: country => `Dónde ver en ${country}`, publishedBy: 'Publicado', officialLink: 'Enlace oficial de emisión o programación', sourceLink: 'Ver fuente', allMatches: 'Ver todos los partidos', languages: 'Otros idiomas' },
  fr: { language: 'Français', direction: 'ltr', title: event => `Où regarder ${event}`, description: (event, competition) => `Retrouvez les chaînes et services de streaming légaux pour ${event} en ${competition}, classés par pays avec leurs sources.`, kicker: 'Guide de diffusion du match', intro: event => `Chaînes TV et services de streaming autorisés pour ${event}, pays par pays.`, kickoff: 'Coup d’envoi', competition: 'Compétition', watchIn: country => `Où regarder en ${country}`, publishedBy: 'Publié', officialLink: 'Lien officiel de diffusion ou de programmation', sourceLink: 'Voir la source', allMatches: 'Voir tous les matchs', languages: 'Autres langues' },
  de: { language: 'Deutsch', direction: 'ltr', title: event => `Wo läuft ${event}?`, description: (event, competition) => `Finde legale TV-Sender und Streamingdienste für ${event} in ${competition}, nach Land geordnet und mit Quellen.`, kicker: 'Übertragung des Spiels', intro: event => `Länderspezifische TV-Sender und autorisierte Streamingdienste für ${event}.`, kickoff: 'Anstoß', competition: 'Wettbewerb', watchIn: country => `Übertragung in ${country}`, publishedBy: 'Veröffentlicht', officialLink: 'Offizieller Streaming- oder Programmlink', sourceLink: 'Quelle ansehen', allMatches: 'Alle Spiele', languages: 'Weitere Sprachen' },
  it: { language: 'Italiano', direction: 'ltr', title: event => `Dove vedere ${event}`, description: (event, competition) => `Trova canali e servizi di streaming legali per ${event} in ${competition}, divisi per paese e con link alle fonti.`, kicker: 'Guida alla trasmissione', intro: event => `Canali TV e servizi di streaming autorizzati per ${event}, paese per paese.`, kickoff: 'Calcio d’inizio', competition: 'Competizione', watchIn: country => `Dove vedere in ${country}`, publishedBy: 'Pubblicato', officialLink: 'Link ufficiale alla visione o al palinsesto', sourceLink: 'Vedi la fonte', allMatches: 'Tutte le partite', languages: 'Altre lingue' },
  pt: { language: 'Português', direction: 'ltr', title: event => `Onde assistir ${event}`, description: (event, competition) => `Encontre canais e serviços de streaming legais para ${event} na ${competition}, organizados por país e com links para as fontes.`, kicker: 'Guia de transmissão da partida', intro: event => `Canais de TV e serviços de streaming autorizados para ${event}, por país.`, kickoff: 'Início', competition: 'Competição', watchIn: country => `Onde assistir em ${country}`, publishedBy: 'Publicado', officialLink: 'Link oficial de transmissão ou programação', sourceLink: 'Ver fonte', allMatches: 'Ver todas as partidas', languages: 'Outros idiomas' },
  ar: { language: 'العربية', direction: 'rtl', title: event => `أين تشاهد ${event}`, description: (event, competition) => `اعثر على القنوات وخدمات البث القانونية لمباراة ${event} في ${competition}، مرتبة حسب البلد مع روابط المصادر.`, kicker: 'دليل بث المباراة', intro: event => `القنوات التلفزيونية وخدمات البث المرخصة لمباراة ${event} حسب البلد.`, kickoff: 'موعد البداية', competition: 'البطولة', watchIn: country => `أين تشاهد في ${country}`, publishedBy: 'نُشر', officialLink: 'رابط المشاهدة أو الجدول الرسمي', sourceLink: 'عرض المصدر', allMatches: 'عرض جميع المباريات', languages: 'لغات أخرى' },
}

export const matchEvidenceCopy: Record<MatchLocale, Record<'A' | 'B' | 'C', string>> = {
  en: { A: 'Official match schedule', B: 'Official all-match service', C: 'Match-specific listing' },
  es: { A: 'Programación oficial del partido', B: 'Servicio oficial para todos los partidos', C: 'Listado específico del partido' },
  fr: { A: 'Programme officiel du match', B: 'Service officiel pour tous les matchs', C: 'Programme spécifique au match' },
  de: { A: 'Offizieller Spielplan', B: 'Offizieller Dienst für alle Spiele', C: 'Spielspezifischer Eintrag' },
  it: { A: 'Programma ufficiale della partita', B: 'Servizio ufficiale per tutte le partite', C: 'Programma specifico della partita' },
  pt: { A: 'Programação oficial da partida', B: 'Serviço oficial para todas as partidas', C: 'Listagem específica da partida' },
  ar: { A: 'الجدول الرسمي للمباراة', B: 'خدمة رسمية لجميع المباريات', C: 'قائمة خاصة بالمباراة' },
}
