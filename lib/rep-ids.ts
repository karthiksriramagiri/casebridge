export interface RepExternalIds {
  ghlUserId: string
  slackUserId: string
}

// Keyed by profile name (must match profiles.name exactly)
export const REP_IDS: Record<string, RepExternalIds> = {
  'Ziyad':    { ghlUserId: 'Yfag4NMqX2HIaOOrXU7G', slackUserId: 'U0B8B2BE4BZ' },
  'Pablo':    { ghlUserId: 'DNj1g2jJWDnSObPK0CHb', slackUserId: 'U0AV0KAR9EF' },
  'Mauricio': { ghlUserId: 'gzsChechxzf121Wk0VBo', slackUserId: 'U0BDB0H8Z33' },
  'Irwing':   { ghlUserId: 'euSfnQe7gJcZMUZOSkNu', slackUserId: 'U0BDVQRKHKJ' },
}
