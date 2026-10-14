// -----------------------------------------------------------------------------
// Runtime texts shown in Gladys (connection status, action results, widget).
// Every text is a { en, fr } object: Gladys picks the user's language.
// -----------------------------------------------------------------------------

const plural = (n, one, many) => (n === 1 ? one : many);

export const T = {
  notConfigured: {
    en: 'Enter the email and the password of your Bring! account in the configuration.',
    fr: 'Saisissez l’e-mail et le mot de passe de votre compte Bring! dans la configuration.',
  },
  ok: (lists, watching) => ({
    en: `Connected to Bring!: ${lists.length} ${plural(lists.length, 'list', 'lists')} (${lists.join(', ')}).${watching ? '' : ' Lists not watched: the scene triggers are off.'}`,
    fr: `Connecté à Bring! : ${lists.length} ${plural(lists.length, 'liste', 'listes')} (${lists.join(', ')}).${watching ? '' : ' Listes non surveillées : les déclencheurs de scène sont inactifs.'}`,
  }),
  noList: {
    en: 'Connected to Bring!, but the account has no list yet.',
    fr: 'Connecté à Bring!, mais le compte n’a encore aucune liste.',
  },
  badEmail: {
    en: 'Bring! refused the email address: check it in the configuration and save again.',
    fr: 'Bring! a refusé l’adresse e-mail : vérifiez-la dans la configuration et enregistrez à nouveau.',
  },
  badCredentials: {
    en: 'Bring! refused the email or the password: check them in the configuration and save again.',
    fr: 'Bring! a refusé l’e-mail ou le mot de passe : vérifiez-les dans la configuration et enregistrez à nouveau.',
  },
  unreachable: (message) => ({
    en: `Bring! is unreachable: ${message}. Retrying at the next refresh.`,
    fr: `Bring! est injoignable : ${message}. Nouvel essai au prochain rafraîchissement.`,
  }),
  testOk: (lines) => ({
    en: `Bring! answers. ${lines.length} ${plural(lines.length, 'list', 'lists')}:\n${lines.map((l) => `- ${l.name}: ${l.count} ${plural(l.count, 'item', 'items')} to buy (articles in ${l.locale})`).join('\n')}`,
    fr: `Bring! répond. ${lines.length} ${plural(lines.length, 'liste', 'listes')} :\n${lines.map((l) => `- ${l.name} : ${l.count} article${l.count > 1 ? 's' : ''} à acheter (articles en ${l.locale})`).join('\n')}`,
  }),
  testFailed: (code, message) => ({
    en: `The test failed (${code}): ${message}`,
    fr: `Le test a échoué (${code}) : ${message}`,
  }),
  unknownList: (query, names) => ({
    en: `Unknown Bring! list "${query}". The lists are: ${names.join(', ') || 'none'}.`,
    fr: `Liste Bring! inconnue « ${query} ». Les listes sont : ${names.join(', ') || 'aucune'}.`,
  }),
  widget: {
    notConfigured: {
      en: 'Configure your Bring! account in the integration first',
      fr: 'Configurez d’abord votre compte Bring! dans l’intégration',
    },
    notLoaded: { en: 'Waiting for the first reading…', fr: 'En attente de la première lecture…' },
    empty: { en: 'Nothing to buy', fr: 'Rien à acheter' },
    toBuy: (n) => ({
      en: `${n} ${plural(n, 'item', 'items')} to buy`,
      fr: `${n} article${n > 1 ? 's' : ''} à acheter`,
    }),
    more: (n) => ({ en: `+ ${n} more`, fr: `+ ${n} de plus` }),
    add: { en: 'Add', fr: 'Ajouter' },
    checkOff: { en: 'Check off', fr: 'Cocher' },
    item: { en: 'Item', fr: 'Article' },
    itemPlaceholder: { en: 'Milk', fr: 'Lait' },
    specification: { en: 'Details (optional)', fr: 'Précision (facultatif)' },
    specificationPlaceholder: { en: '2 l', fr: '2 l' },
    added: (name) => ({ en: `${name} added`, fr: `${name} ajouté` }),
    checked: (name) => ({ en: `${name} checked off`, fr: `${name} coché` }),
    notOnList: (name) => ({
      en: `${name} is no longer on the list`,
      fr: `${name} n’est plus sur la liste`,
    }),
    needsForm: {
      en: 'This form needs Gladys 5.2 or later',
      fr: 'Ce formulaire nécessite Gladys 5.2 ou plus récent',
    },
    noQuickItem: {
      en: 'Set the one-tap item in the widget settings',
      fr: 'Indiquez l’article en un clic dans les réglages du widget',
    },
    failed: (message) => ({ en: `Bring!: ${message}`, fr: `Bring! : ${message}` }),
  },
};
