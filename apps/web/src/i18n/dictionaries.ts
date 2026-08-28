import type { Locale } from "./config";

/**
 * Translations.
 *
 * `en` is the source of truth: its shape defines `Dictionary`, so every other
 * locale is type-checked against it and a missing or misspelled key fails the
 * build rather than rendering `undefined` to a visitor.
 *
 * Interpolation is deliberately absent. Where a value belongs mid-sentence the
 * string is split, because word order differs between these languages and
 * concatenating fragments in English order produces nonsense in Hindi.
 */
const en = {
  settings: {
    label: "Settings",
    appearance: "Appearance",
    language: "Language",
    system: "System",
    light: "Light",
    dark: "Dark",
    close: "Close",
  },
  home: {
    headline: "Scheduling that gets the time zone right.",
    body: "A working slice of the booking flow, running against a real Postgres database with the overlap constraint enforced.",
    demoTitle: "Demo booking page",
    demoBody: "Three event types, a seeded working week, existing bookings",
  },
  booking: {
    minutes: "minutes",
    timeZone: "Time zone",
    chooseDate: "Choose a date",
    chooseTime: "Choose a time",
    previousMonth: "Previous month",
    nextMonth: "Next month",
    nothingThisMonth: "Nothing available this month.",
    unavailable: "unavailable",
    slotsAvailable: "slots available",
    confirmHeading: "Confirm your booking",
    yourName: "Your name",
    email: "Email",
    notes: "Anything we should know?",
    back: "Back",
    confirm: "Confirm",
    request: "Request booking",
    booking: "Booking…",
    pickAnother: "Pick another time",
    with: "with",
  },
  confirmation: {
    booked: "You're booked",
    pending: "Awaiting confirmation",
    cancelled: "This booking was cancelled",
    invitationSent: "A calendar invitation is on its way to",
    willConfirm: "will confirm shortly. We'll email you either way.",
    what: "What",
    when: "When",
    who: "Who",
    notes: "Notes",
    and: "and",
    backHome: "Back",
  },
  errors: {
    nameRequired: "Please tell us your name.",
    emailInvalid: "That email address doesn't look right.",
    timeInvalid: "That time is no longer valid.",
    pageGone: "This booking page is no longer available.",
    slotTaken: "That slot has just been taken. Please choose another time.",
    raceLost: "Someone just booked that time. Please pick another slot.",
  },
  credit: {
    developedBy: "Developed by",
    linkedinHint: "(LinkedIn, opens in a new tab)",
  },
};

/**
 * Deliberately no `as const` on `en`. With it, every English string becomes a
 * literal type and no translation can satisfy the shape — the type would
 * demand the word "Settings" rather than a string in that slot. Without it the
 * values widen to `string`, so the *keys* are enforced and the wording is free.
 */
export type Dictionary = typeof en;

/** Every locale must satisfy the English shape exactly. */
type Translations = Record<Locale, Dictionary>;

const hi: Dictionary = {
  settings: {
    label: "सेटिंग्स",
    appearance: "रूप",
    language: "भाषा",
    system: "सिस्टम",
    light: "हल्का",
    dark: "गहरा",
    close: "बंद करें",
  },
  home: {
    headline: "ऐसी शेड्यूलिंग जो टाइम ज़ोन सही रखती है।",
    body: "बुकिंग प्रवाह का एक चालू हिस्सा, वास्तविक Postgres डेटाबेस पर, ओवरलैप बाधा लागू किए हुए।",
    demoTitle: "डेमो बुकिंग पेज",
    demoBody: "तीन इवेंट प्रकार, एक तैयार कार्य-सप्ताह, मौजूदा बुकिंग",
  },
  booking: {
    minutes: "मिनट",
    timeZone: "टाइम ज़ोन",
    chooseDate: "तारीख़ चुनें",
    chooseTime: "समय चुनें",
    previousMonth: "पिछला महीना",
    nextMonth: "अगला महीना",
    nothingThisMonth: "इस महीने कुछ उपलब्ध नहीं है।",
    unavailable: "अनुपलब्ध",
    slotsAvailable: "समय उपलब्ध",
    confirmHeading: "अपनी बुकिंग की पुष्टि करें",
    yourName: "आपका नाम",
    email: "ईमेल",
    notes: "कुछ बताना चाहेंगे?",
    back: "वापस",
    confirm: "पुष्टि करें",
    request: "बुकिंग का अनुरोध करें",
    booking: "बुक हो रहा है…",
    pickAnother: "दूसरा समय चुनें",
    with: "के साथ",
  },
  confirmation: {
    booked: "आपकी बुकिंग हो गई",
    pending: "पुष्टि की प्रतीक्षा",
    cancelled: "यह बुकिंग रद्द कर दी गई थी",
    invitationSent: "कैलेंडर आमंत्रण भेजा जा रहा है:",
    willConfirm: "शीघ्र ही पुष्टि करेंगे। हम आपको दोनों स्थिति में ईमेल करेंगे।",
    what: "क्या",
    when: "कब",
    who: "कौन",
    notes: "टिप्पणियाँ",
    and: "और",
    backHome: "वापस",
  },
  errors: {
    nameRequired: "कृपया अपना नाम बताएं।",
    emailInvalid: "यह ईमेल पता सही नहीं लगता।",
    timeInvalid: "यह समय अब मान्य नहीं है।",
    pageGone: "यह बुकिंग पेज अब उपलब्ध नहीं है।",
    slotTaken: "यह समय अभी बुक हो गया। कृपया दूसरा समय चुनें।",
    raceLost: "किसी ने अभी वह समय बुक कर लिया। कृपया दूसरा चुनें।",
  },
  credit: {
    developedBy: "निर्माता",
    linkedinHint: "(लिंक्डइन, नए टैब में खुलेगा)",
  },
};

const bn: Dictionary = {
  settings: {
    label: "সেটিংস",
    appearance: "চেহারা",
    language: "ভাষা",
    system: "সিস্টেম",
    light: "হালকা",
    dark: "গাঢ়",
    close: "বন্ধ",
  },
  home: {
    headline: "এমন শিডিউলিং যা টাইম জ়োন ঠিক রাখে।",
    body: "বুকিং প্রবাহের একটি সচল অংশ, সত্যিকারের Postgres ডেটাবেসে, ওভারল্যাপ শর্ত প্রয়োগ করা।",
    demoTitle: "ডেমো বুকিং পাতা",
    demoBody: "তিনটি ইভেন্ট ধরন, একটি সাজানো কর্মসপ্তাহ, বিদ্যমান বুকিং",
  },
  booking: {
    minutes: "মিনিট",
    timeZone: "টাইম জ়োন",
    chooseDate: "তারিখ বাছুন",
    chooseTime: "সময় বাছুন",
    previousMonth: "আগের মাস",
    nextMonth: "পরের মাস",
    nothingThisMonth: "এই মাসে কিছু নেই।",
    unavailable: "অনুপলব্ধ",
    slotsAvailable: "সময় ফাঁকা",
    confirmHeading: "আপনার বুকিং নিশ্চিত করুন",
    yourName: "আপনার নাম",
    email: "ইমেল",
    notes: "কিছু জানানোর আছে?",
    back: "ফিরে যান",
    confirm: "নিশ্চিত করুন",
    request: "বুকিংয়ের অনুরোধ",
    booking: "বুক হচ্ছে…",
    pickAnother: "অন্য সময় বাছুন",
    with: "সঙ্গে",
  },
  confirmation: {
    booked: "আপনার বুকিং হয়ে গেছে",
    pending: "নিশ্চিতকরণের অপেক্ষায়",
    cancelled: "এই বুকিং বাতিল করা হয়েছিল",
    invitationSent: "ক্যালেন্ডার আমন্ত্রণ পাঠানো হচ্ছে:",
    willConfirm: "শীঘ্রই নিশ্চিত করবেন। আমরা যেকোনো ক্ষেত্রেই ইমেল করব।",
    what: "কী",
    when: "কখন",
    who: "কে",
    notes: "মন্তব্য",
    and: "এবং",
    backHome: "ফিরে যান",
  },
  errors: {
    nameRequired: "অনুগ্রহ করে আপনার নাম লিখুন।",
    emailInvalid: "ইমেল ঠিকানাটি সঠিক মনে হচ্ছে না।",
    timeInvalid: "এই সময় আর বৈধ নয়।",
    pageGone: "এই বুকিং পাতা আর উপলব্ধ নয়।",
    slotTaken: "সময়টি এইমাত্র বুক হয়ে গেছে। অন্য সময় বাছুন।",
    raceLost: "কেউ এইমাত্র সময়টি বুক করেছেন। অন্যটি বাছুন।",
  },
  credit: {
    developedBy: "নির্মাতা",
    linkedinHint: "(লিঙ্কডইন, নতুন ট্যাবে খুলবে)",
  },
};

const es: Dictionary = {
  settings: {
    label: "Ajustes",
    appearance: "Apariencia",
    language: "Idioma",
    system: "Sistema",
    light: "Claro",
    dark: "Oscuro",
    close: "Cerrar",
  },
  home: {
    headline: "Reservas que respetan la zona horaria.",
    body: "Una parte funcional del flujo de reservas, sobre una base de datos Postgres real con la restricción de solapamiento activa.",
    demoTitle: "Página de reservas de demostración",
    demoBody: "Tres tipos de cita, una semana laboral de ejemplo, reservas existentes",
  },
  booking: {
    minutes: "minutos",
    timeZone: "Zona horaria",
    chooseDate: "Elige una fecha",
    chooseTime: "Elige una hora",
    previousMonth: "Mes anterior",
    nextMonth: "Mes siguiente",
    nothingThisMonth: "No hay disponibilidad este mes.",
    unavailable: "no disponible",
    slotsAvailable: "horas disponibles",
    confirmHeading: "Confirma tu reserva",
    yourName: "Tu nombre",
    email: "Correo electrónico",
    notes: "¿Algo que debamos saber?",
    back: "Atrás",
    confirm: "Confirmar",
    request: "Solicitar reserva",
    booking: "Reservando…",
    pickAnother: "Elegir otra hora",
    with: "con",
  },
  confirmation: {
    booked: "Reserva confirmada",
    pending: "Pendiente de confirmación",
    cancelled: "Esta reserva fue cancelada",
    invitationSent: "Se está enviando una invitación de calendario a",
    willConfirm: "lo confirmará en breve. Te escribiremos en cualquier caso.",
    what: "Qué",
    when: "Cuándo",
    who: "Quién",
    notes: "Notas",
    and: "y",
    backHome: "Volver",
  },
  errors: {
    nameRequired: "Dinos tu nombre, por favor.",
    emailInvalid: "Esa dirección de correo no parece correcta.",
    timeInvalid: "Esa hora ya no es válida.",
    pageGone: "Esta página de reservas ya no está disponible.",
    slotTaken: "Acaban de reservar esa hora. Elige otra, por favor.",
    raceLost: "Alguien acaba de reservar esa hora. Elige otra.",
  },
  credit: {
    developedBy: "Desarrollado por",
    linkedinHint: "(LinkedIn, se abre en una pestaña nueva)",
  },
};

const fr: Dictionary = {
  settings: {
    label: "Paramètres",
    appearance: "Apparence",
    language: "Langue",
    system: "Système",
    light: "Clair",
    dark: "Sombre",
    close: "Fermer",
  },
  home: {
    headline: "Une prise de rendez-vous qui respecte les fuseaux horaires.",
    body: "Une partie fonctionnelle du parcours de réservation, sur une vraie base Postgres avec la contrainte de chevauchement appliquée.",
    demoTitle: "Page de réservation de démonstration",
    demoBody: "Trois types de rendez-vous, une semaine type, des réservations existantes",
  },
  booking: {
    minutes: "minutes",
    timeZone: "Fuseau horaire",
    chooseDate: "Choisissez une date",
    chooseTime: "Choisissez une heure",
    previousMonth: "Mois précédent",
    nextMonth: "Mois suivant",
    nothingThisMonth: "Aucune disponibilité ce mois-ci.",
    unavailable: "indisponible",
    slotsAvailable: "créneaux disponibles",
    confirmHeading: "Confirmez votre réservation",
    yourName: "Votre nom",
    email: "E-mail",
    notes: "Quelque chose à nous signaler ?",
    back: "Retour",
    confirm: "Confirmer",
    request: "Demander une réservation",
    booking: "Réservation…",
    pickAnother: "Choisir un autre créneau",
    with: "avec",
  },
  confirmation: {
    booked: "C'est réservé",
    pending: "En attente de confirmation",
    cancelled: "Cette réservation a été annulée",
    invitationSent: "Une invitation d'agenda part vers",
    willConfirm: "confirmera sous peu. Nous vous écrirons dans tous les cas.",
    what: "Quoi",
    when: "Quand",
    who: "Qui",
    notes: "Notes",
    and: "et",
    backHome: "Retour",
  },
  errors: {
    nameRequired: "Indiquez votre nom, s'il vous plaît.",
    emailInvalid: "Cette adresse e-mail semble incorrecte.",
    timeInvalid: "Ce créneau n'est plus valide.",
    pageGone: "Cette page de réservation n'est plus disponible.",
    slotTaken: "Ce créneau vient d'être pris. Choisissez-en un autre.",
    raceLost: "Quelqu'un vient de réserver ce créneau. Choisissez-en un autre.",
  },
  credit: {
    developedBy: "Développé par",
    linkedinHint: "(LinkedIn, s'ouvre dans un nouvel onglet)",
  },
};

export const dictionaries: Translations = { en, hi, bn, es, fr };
