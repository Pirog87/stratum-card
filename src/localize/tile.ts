// Teksty kafla encji (`stratum-room-tile`) — PL i EN.
//
// Dlaczego TS, a nie `pl.json` / `en.json` obok: bundle nie ma pluginu
// JSON w rollupie, a dokładanie go dla kilkudziesięciu napisów rozbiłoby
// regułę „bundle mały, zero nowych zależności". Słownik siedzi więc tu,
// w katalogu lokalizacji, z tymi samymi kluczami w obu językach (pilnuje
// tego typ `TileStrings` — brak klucza w EN to błąd kompilacji).

export interface TileStrings {
  on: string;
  off: string;
  unavailable: string;
  unknown: string;
  activate: string;
  open: string;
  closed: string;
  opening: string;
  closing: string;
  detected: string;
  clear: string;
  home: string;
  not_home: string;
  locked: string;
  unlocked: string;
  media: Record<
    'off' | 'on' | 'idle' | 'playing' | 'paused' | 'buffering' | 'standby',
    string
  >;
  player: {
    prev: string;
    next: string;
    play: string;
    pause: string;
    unsupported: string;
    power_on: string;
    power_off: string;
    mute: string;
    unmute: string;
    volume: string;
    vol_down: string;
    vol_up: string;
    seek: string;
  };
  intercom: {
    idle: string;
    recording: string;
    sending: string;
    mic_denied: string;
    mic_missing: string;
    mic_failed: string;
    upload_denied: string;
    upload_failed: string;
    network: string;
    play_failed: string;
    timeout: string;
  };
}

export const tilePl: TileStrings = {
  on: 'włączone',
  off: 'wyłączone',
  unavailable: 'niedostępne',
  unknown: 'nieznany',
  activate: 'aktywuj',
  open: 'otwarte',
  closed: 'zamknięte',
  opening: 'otwiera się',
  closing: 'zamyka się',
  detected: 'wykryto',
  clear: 'brak',
  home: 'w domu',
  not_home: 'poza domem',
  locked: 'zamknięte',
  unlocked: 'otwarte',
  media: {
    off: 'wyłączony',
    on: 'włączony',
    idle: 'bezczynny',
    playing: 'odtwarza',
    paused: 'pauza',
    buffering: 'buforuje',
    standby: 'czuwanie',
  },
  player: {
    prev: 'Poprzedni',
    next: 'Następny',
    play: 'Odtwarzaj',
    pause: 'Pauza',
    unsupported: 'niedostępne na tym urządzeniu',
    power_on: 'Włącz',
    power_off: 'Wyłącz',
    mute: 'Wycisz',
    unmute: 'Wyłącz wyciszenie',
    volume: 'Głośność',
    vol_down: 'Ciszej (przytrzymaj = płynnie)',
    vol_up: 'Głośniej (przytrzymaj = płynnie)',
    seek: 'Tapnij, żeby przewinąć',
  },
  intercom: {
    idle: 'Przytrzymaj i mów — nagranie poleci na ten głośnik',
    recording: 'Nagrywanie… puść, żeby wysłać',
    sending: 'Wysyłanie nagrania…',
    mic_denied: 'Brak dostępu do mikrofonu — zezwól aplikacji na mikrofon',
    mic_missing: 'Nie znaleziono mikrofonu',
    mic_failed: 'Nie udało się uruchomić mikrofonu',
    upload_denied: 'Brak uprawnień do wysłania nagrania (HTTP {status})',
    upload_failed: 'Nie udało się wysłać nagrania (HTTP {status}) — sprawdź media_dirs',
    network: 'Nie udało się wysłać nagrania — brak połączenia z HA',
    play_failed: 'Głośnik nie odtworzył nagrania',
    timeout: 'Wysyłanie nagrania trwało za długo — przerwano',
  },
};

export const tileEn: TileStrings = {
  on: 'on',
  off: 'off',
  unavailable: 'unavailable',
  unknown: 'unknown',
  activate: 'activate',
  open: 'open',
  closed: 'closed',
  opening: 'opening',
  closing: 'closing',
  detected: 'detected',
  clear: 'clear',
  home: 'home',
  not_home: 'away',
  locked: 'locked',
  unlocked: 'unlocked',
  media: {
    off: 'off',
    on: 'on',
    idle: 'idle',
    playing: 'playing',
    paused: 'paused',
    buffering: 'buffering',
    standby: 'standby',
  },
  player: {
    prev: 'Previous',
    next: 'Next',
    play: 'Play',
    pause: 'Pause',
    unsupported: 'not supported by this device',
    power_on: 'Turn on',
    power_off: 'Turn off',
    mute: 'Mute',
    unmute: 'Unmute',
    volume: 'Volume',
    vol_down: 'Volume down (hold = smooth)',
    vol_up: 'Volume up (hold = smooth)',
    seek: 'Tap to seek',
  },
  intercom: {
    idle: 'Hold and speak — the recording plays on this speaker',
    recording: 'Recording… release to send',
    sending: 'Sending recording…',
    mic_denied: 'No microphone access — allow the app to use the microphone',
    mic_missing: 'No microphone found',
    mic_failed: 'Could not start the microphone',
    upload_denied: 'Not allowed to upload the recording (HTTP {status})',
    upload_failed: 'Could not upload the recording (HTTP {status}) — check media_dirs',
    network: 'Could not upload the recording — no connection to HA',
    play_failed: 'The speaker did not play the recording',
    timeout: 'Sending the recording took too long — cancelled',
  },
};
